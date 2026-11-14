import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CalendarDays, ChevronRight, Search, Settings2 } from 'lucide-react';

import HeaderIconButton from '@/components/HeaderIconButton';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useConnections } from '@/lib/connections/useConnections';
import { getDeviceTimeZone, zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import { useAppDispatch, useAppSelector } from '@/store';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import Composer from '@apps/helm/components/home/Composer';
import ConversationThread from '@apps/helm/components/home/ConversationThread';
import CannotOpenState from '@apps/helm/components/states/CannotOpenState';
import NeedsConnectionState from '@apps/helm/components/states/NeedsConnectionState';
import { DAY_MS, HELM_COPY, HOME_COMPOSER_ID } from '@apps/helm/constants';
import OutboxSummary from '@apps/helm/components/inbox/OutboxRow';
import {
  useCanUseDropBox,
  useOutboxEntries,
} from '@apps/helm/hooks/useCaptureOutbox';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import { useSession } from '@apps/helm/hooks/useSession';
import { hasLapsedTrust } from '@apps/helm/queries/helmKeyQueries';
import { retryKey, type KeyStatus } from '@apps/helm/store/helmSlice';
import { selectHeldItems } from '@apps/helm/store/selectors/captureSelectors';
import { formatClock, getDayNoon, toDayKey } from '@apps/helm/utils/planDays';
import { getDayEvents, getTodayRecords } from '@apps/helm/utils/synced';

interface HomeSurfaceProps {
  composerRef: RefObject<HTMLTextAreaElement | null>;
  isComposing: boolean;
  onComposerFocusChange: (isFocused: boolean) => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
}

const getWaitingPlaceholder = (
  keyStatus: KeyStatus,
  canSaveOffline: boolean,
  name: string,
) => {
  if (keyStatus === 'offline') {
    return canSaveOffline ? null : HELM_COPY.outboxNeedsConnection(name);
  }
  if (keyStatus === 'failed') {
    return canSaveOffline ? null : HELM_COPY.composerBlocked;
  }
  return null;
};

const ROW =
  'h-11 w-full min-w-0 justify-between! gap-2 rounded-none px-0! text-[15px] font-normal';

/** The next fixed thing today (tomorrow's first once today's are over) and how many questions wait, each a door. */
function QuietLines({ now }: { now: number }) {
  const { showView } = useHelmUrlState();
  const { grants } = useConnections({
    readerAppId: 'helm',
    includeEnded: true,
  });
  const stored = useAppSelector((state) => state.helm.synced.items);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const needsYou = useAppSelector(selectHeldItems).needsYou.length;
  const nextEvent = useMemo(() => {
    const records = getTodayRecords(stored, grants);
    const todayNoon = getDayNoon(toDayKey(now, timeZone), timeZone);
    const firstAfter = (at: number, from: number) =>
      getDayEvents(records, at, timeZone).events.find(
        (event) =>
          !event.isAllDay && event.startAt !== null && event.startAt >= from,
      );
    const today = firstAfter(now, now);
    if (today?.startAt != null) {
      return {
        label: HELM_COPY.homeNextEvent(
          formatClock(today.startAt, timeZone),
          today.sealed.title,
        ),
      };
    }
    const tomorrow = firstAfter(todayNoon + DAY_MS, 0);
    return tomorrow?.startAt != null
      ? {
          label: HELM_COPY.homeNextEventTomorrow(
            formatClock(tomorrow.startAt, timeZone),
            tomorrow.sealed.title,
          ),
        }
      : null;
  }, [stored, grants, now, timeZone]);

  if (!nextEvent && needsYou === 0) return null;

  return (
    <ul className='divide-border border-border divide-y border-b'>
      {nextEvent && (
        <li>
          <Button
            type='button'
            variant='tertiary'
            className={ROW}
            onClick={() => void showView('today')}
          >
            <span className='flex min-w-0 items-center gap-2'>
              <CalendarDays
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden='true'
              />
              <span className='truncate'>{nextEvent.label}</span>
            </span>
            <ChevronRight
              className='text-muted-foreground size-4 shrink-0'
              aria-hidden='true'
            />
          </Button>
        </li>
      )}
      {needsYou > 0 && (
        <li>
          <Button
            type='button'
            variant='tertiary'
            className={ROW}
            onClick={() => void showView('inbox')}
          >
            <span className='flex min-w-0 items-center gap-2'>
              <span
                className='size-2 shrink-0 rounded-full bg-(--helm-verdigris)'
                aria-hidden='true'
              />
              <span className='truncate'>
                {HELM_COPY.needsYouCount(needsYou)}
              </span>
            </span>
            <ChevronRight
              className='text-muted-foreground size-4 shrink-0'
              aria-hidden='true'
            />
          </Button>
        </li>
      )}
    </ul>
  );
}

function HomeSurface({
  composerRef,
  isComposing,
  onComposerFocusChange,
  onOpenSettings,
  onOpenSearch,
}: HomeSurfaceProps) {
  const name = useAssistantName();
  const dispatch = useAppDispatch();
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const isKeyRetrying = useAppSelector((state) => state.helm.isKeyRetrying);
  const keyRefusals = useAppSelector((state) => state.helm.keyRefusals);
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const canSaveOffline =
    useCanUseDropBox(uid) &&
    (keyStatus === 'offline' || keyStatus === 'failed');
  // Words typed while waiting carry over to the field once the key is here.
  const [typedWaiting, setTypedWaiting] = useState('');
  const outbox = useOutboxEntries(uid);
  const { sessions, openSessionId } = useSession();
  const { isLoaded: isCapturesLoaded, isFailed: isCapturesFailed } =
    useAppSelector((state) => state.helm.recentCaptures);
  const hasTurns = sessions.length > 0;
  const voice = useHelmVoiceContext();
  const now = useNow(60_000);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const todayStart = zonedDateTimeToEpoch(
    toDayKey(now, timeZone),
    '00:00',
    timeZone,
  );
  const composerBox = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = composerBox.current;
    if (!element) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty(
        '--helm-composer-h',
        `${element.getBoundingClientRect().height}px`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--helm-composer-h');
    };
  }, []);

  return (
    <main className='flex flex-1 flex-col pb-10'>
      <div
        data-home-header
        className='bg-background sticky top-0 z-10 -mx-4 px-4 pt-0'
      >
        <div className='flex h-[60px] items-center justify-between gap-3'>
          <div className='flex min-w-0 items-center gap-2'>
            <AssistantMark name={name} isLarge />
            <h1 className='helm-serif truncate text-[28px] leading-[34px]'>
              {name}
            </h1>
          </div>
          {keyStatus === 'ready' && (
            <div className='flex shrink-0 items-center gap-3'>
              <HeaderIconButton
                icon={<Search className='size-4' aria-hidden='true' />}
                label={HELM_COPY.searchTitle}
                onClick={onOpenSearch}
              />
              <HeaderIconButton
                icon={<Settings2 className='size-4' aria-hidden='true' />}
                label={HELM_COPY.settingsTitle}
                onClick={onOpenSettings}
              />
            </div>
          )}
        </div>
        {keyStatus === 'ready' && <QuietLines now={now} />}
      </div>
      <div className='flex flex-1 flex-col gap-8 pt-4'>
        {!hasTurns && keyStatus !== 'offline' && keyStatus !== 'failed' && (
          <p className='text-muted-foreground text-center text-[15px]'>
            {HELM_COPY.homeHint}
          </p>
        )}
        {isCapturesFailed && !isCapturesLoaded && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.turnsFailed}
          </p>
        )}
        {isCapturesLoaded && !hasTurns && (
          <p className='helm-card p-4 text-[15px] text-pretty'>
            {HELM_COPY.firstOpen(name)}
          </p>
        )}
        {hasTurns && (
          <ConversationThread
            sessions={sessions}
            openSessionId={openSessionId}
            scroll='window'
            loadsEarlier
            foldsBefore={todayStart}
          />
        )}
        <div className='mt-auto flex flex-col gap-4'>
          {keyStatus === 'offline' && (
            <NeedsConnectionState
              name={name}
              canSave={canSaveOffline}
              isTrustLapsed={uid !== null && hasLapsedTrust(uid)}
            />
          )}
          <OutboxSummary uid={uid} entries={outbox} />
          {keyStatus === 'failed' && (
            <CannotOpenState
              isRetrying={isKeyRetrying}
              hasRetryFailed={keyRefusals > 1}
              onRetry={() => dispatch(retryKey())}
            />
          )}
        </div>
      </div>
      <div
        aria-hidden='true'
        className='h-[var(--helm-composer-h,0px)] shrink-0'
      />
      {/* While the voice is in use the dock's words take this place; the field keeps its draft and its room. */}
      <div
        className={join(
          'pointer-events-none fixed inset-x-0 bottom-[calc(var(--helm-dock-top,env(safe-area-inset-bottom,0px))+8px)] z-30 px-4 transition-[bottom,translate,opacity,visibility] duration-200 ease-out motion-reduce:transition-none',
          voice.state !== 'idle' &&
            voice.dictationOwner !== HOME_COMPOSER_ID &&
            'invisible translate-y-8 opacity-0',
        )}
      >
        <div
          ref={composerBox}
          className={join(
            "before:from-background pointer-events-auto relative mx-auto max-w-xl before:pointer-events-none before:absolute before:inset-x-[-1rem] before:-top-6 before:bottom-1/2 before:-z-10 before:bg-gradient-to-t before:to-transparent before:content-['']",
            isComposing &&
              "after:bg-background after:pointer-events-none after:absolute after:inset-x-[-1rem] after:top-1/2 after:-bottom-24 after:-z-10 after:content-['']",
          )}
        >
          <Composer
            key={keyStatus === 'ready' ? 'ready' : 'waiting'}
            fieldRef={composerRef}
            dictationId={HOME_COMPOSER_ID}
            maxLines={10}
            screen={null}
            onFocusChange={onComposerFocusChange}
            showsVoiceNotice={isComposing}
            isReady={keyStatus === 'ready'}
            isOutbox={canSaveOffline}
            heldText={typedWaiting}
            onTextChange={setTypedWaiting}
            waitingPlaceholder={getWaitingPlaceholder(
              keyStatus,
              canSaveOffline,
              name,
            )}
          />
        </div>
      </div>
    </main>
  );
}

export default HomeSurface;

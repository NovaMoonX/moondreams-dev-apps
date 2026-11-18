import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import {
  CalendarDays,
  ChevronRight,
  MessageSquarePlus,
  Search,
  Settings2,
  Sparkles,
} from 'lucide-react';

import HeaderIconButton from '@/components/HeaderIconButton';
import WorkingRing from '@/components/WorkingRing';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { useConnections } from '@/lib/connections/useConnections';
import { getDeviceTimeZone, zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import { store, useAppDispatch, useAppSelector } from '@/store';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import DayCard from '@apps/helm/components/dayCard/DayCard';
import GroupingCard from '@apps/helm/components/home/GroupingCard';
import GroupingFiledLine from '@apps/helm/components/home/GroupingFiledLine';
import MorningQuestionTurn from '@apps/helm/components/home/MorningQuestionTurn';
import Composer from '@apps/helm/components/home/Composer';
import ConversationThread from '@apps/helm/components/home/ConversationThread';
import CannotOpenState from '@apps/helm/components/states/CannotOpenState';
import TalkNotice from '@apps/helm/components/voice/TalkNotice';
import VoiceStatus from '@apps/helm/components/voice/VoiceStatus';
import NeedsConnectionState from '@apps/helm/components/states/NeedsConnectionState';
import { DAY_MS, HELM_COPY, HOME_COMPOSER_ID } from '@apps/helm/constants';
import OutboxSummary from '@apps/helm/components/inbox/OutboxRow';
import {
  useCanUseDropBox,
  useOutboxEntries,
} from '@apps/helm/hooks/useCaptureOutbox';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useDayCard } from '@apps/helm/hooks/useDayCard';
import { useGroupingOffer } from '@apps/helm/hooks/useGroupingOffer';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import { useSession } from '@apps/helm/hooks/useSession';
import { hasLapsedTrust } from '@apps/helm/queries/helmKeyQueries';
import { setConversationFreshAt } from '@apps/helm/store/actions/settingsActions';
import { retryKey, type KeyStatus } from '@apps/helm/store/helmSlice';
import {
  selectExecutionsById,
  selectHeldItems,
  selectOutsideCaptures,
} from '@apps/helm/store/selectors/captureSelectors';
import {
  selectNoteById,
  selectTopicById,
} from '@apps/helm/store/selectors/knowledgeSelectors';
import { pickHomeCards } from '@apps/helm/utils/groupingOffer';
import { isPastTurn, readNewestTurnAt } from '@apps/helm/utils/linearThread';
import { setLiveAimsDay } from '@apps/helm/utils/morningAsk';
import { groupTurns } from '@apps/helm/utils/sessions';
import { readOutsideAdditions } from '@apps/helm/utils/outsideTurns';
import OutsideMark from '@apps/helm/components/outside/OutsideMark';
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

const LEAD = 'flex size-4 shrink-0 items-center justify-center';

const ROW =
  'h-11 w-full min-w-0 justify-between! gap-2 rounded-none px-0! text-[15px] font-normal';

/** The next fixed thing today (tomorrow's first once today's are over), how many questions wait and what outside assistants added since the person looked, each a door. */
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
  const outsideCaptures = useAppSelector(selectOutsideCaptures);
  const executionsById = useAppSelector(selectExecutionsById);
  const noteById = useAppSelector(selectNoteById);
  const topicById = useAppSelector(selectTopicById);
  const outsideSeenAt = useAppSelector(
    (state) => state.helm.profile?.outsideSeenAt ?? null,
  );
  const outside = useMemo(() => {
    const added = readOutsideAdditions(
      outsideCaptures,
      outsideSeenAt ?? now - 7 * DAY_MS,
      executionsById,
      (ref) =>
        ref.collection === 'notes'
          ? noteById.get(ref.docId)?.title || null
          : ref.collection === 'topics'
            ? (topicById.get(ref.docId)?.name ?? null)
            : null,
    );
    return added.count === 0
      ? null
      : {
          label: HELM_COPY.homeOutsideAdded(
            added.vias,
            added.count,
            added.isAllNew,
            added.title,
          ),
          via: added.vias.length === 1 ? added.vias[0] : null,
        };
  }, [
    outsideCaptures,
    outsideSeenAt,
    now,
    executionsById,
    noteById,
    topicById,
  ]);
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

  if (!nextEvent && needsYou === 0 && outside === null) return null;

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
              <span className={LEAD}>
                <CalendarDays
                  className='text-muted-foreground size-4'
                  aria-hidden='true'
                />
              </span>
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
              <span className={LEAD}>
                <span
                  className='size-2 rounded-full bg-(--helm-verdigris)'
                  aria-hidden='true'
                />
              </span>
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
      {outside !== null && (
        <li>
          <Button
            type='button'
            variant='tertiary'
            className={ROW}
            onClick={() => void showView('outside')}
          >
            <span className='flex min-w-0 items-center gap-2'>
              <span className={LEAD}>
                {outside.via !== null ? (
                  <OutsideMark via={outside.via} isSmall />
                ) : (
                  <Sparkles
                    className='text-muted-foreground size-4'
                    aria-hidden='true'
                  />
                )}
              </span>
              <span className='truncate'>{outside.label}</span>
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

/** Starts the next turn as a new conversation, so nothing said before it carries over; what was said folds behind Earlier and anything waiting stays in Needs you. */
function NewConversationButton({ uid }: { uid: string }) {
  const { addToast } = useToast();
  const startFresh = () => {
    const previous = store.getState().helm.profile?.conversationFreshAt ?? null;
    const fail = (error: unknown) => {
      console.error('Helm conversation did not start fresh', error);
      addToast({ title: HELM_COPY.newConversationFailed, type: 'error' });
    };
    setConversationFreshAt(uid, Date.now())
      .then(() =>
        addToast({
          title: HELM_COPY.newConversationStarted,
          type: 'info',
          action: {
            label: HELM_COPY.undo,
            onClick: () =>
              void setConversationFreshAt(uid, previous).catch(fail),
          },
        }),
      )
      .catch(fail);
  };
  return (
    <HeaderIconButton
      icon={<MessageSquarePlus className='size-4' aria-hidden='true' />}
      label={HELM_COPY.newConversation}
      onClick={startFresh}
    />
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
  const keyFailure = useAppSelector((state) => state.helm.keyFailure);
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const canSaveOffline =
    useCanUseDropBox(uid) &&
    (keyStatus === 'offline' || keyStatus === 'failed');
  // Words typed while waiting carry over to the field once the key is here.
  const [typedWaiting, setTypedWaiting] = useState('');
  const outbox = useOutboxEntries(uid);
  const { sessions, openSessionId, freshFrom, homeFrom } = useSession();
  const { isLoaded: isCapturesLoaded, isFailed: isCapturesFailed } =
    useAppSelector((state) => state.helm.recentCaptures);
  const hasTurns = sessions.length > 0;
  const hasFreshTurns = sessions.some(
    (session) =>
      session.startedAt >= homeFrom || session.sessionId === openSessionId,
  );
  const isWaitingOnKey = keyStatus === 'offline' || keyStatus === 'failed';
  // Until the first page of turns is read the thread is empty, which would otherwise read as no conversation yet.
  const isOpening =
    !hasTurns && !isCapturesLoaded && !isCapturesFailed && !isWaitingOnKey;
  const voice = useHelmVoiceContext();
  const isDesktop = useMediaQuery().isAtLeast('lg');
  const now = useNow(60_000);
  const dayCard = useDayCard(now);
  const grouping = useGroupingOffer(now);
  const cards = pickHomeCards({
    hasDay: keyStatus === 'ready',
    hasOffer: keyStatus === 'ready' && grouping.offer !== null,
    hasFiled: keyStatus === 'ready' && grouping.filed !== null,
  });
  const isDayCardAsking = dayCard.model?.mode === 'windDown';
  // The morning question is the assistant's turn at the bottom of the thread until the person sends a turn that isn't its answer; after that it waits at the top as the day card's line, and Answer asks it again here.
  const [morningReaskedAt, setMorningReaskedAt] = useState<number | null>(null);
  const newestTurnAt = readNewestTurnAt(
    sessions.flatMap((session) =>
      groupTurns(session.turns).map((turn) => turn.lead),
    ),
  );
  const isMorningLive =
    keyStatus === 'ready' &&
    dayCard.model?.mode === 'ask' &&
    !isPastTurn(
      Math.max(dayCard.model.dayStart, morningReaskedAt ?? 0),
      newestTurnAt,
    );
  const liveAimsDay = isMorningLive ? (dayCard.model?.todayKey ?? null) : null;
  useEffect(() => {
    setLiveAimsDay(liveAimsDay);
    return () => setLiveAimsDay(null);
  }, [liveAimsDay]);
  const morningBox = useRef<HTMLDivElement>(null);
  const morningTurn = isMorningLive ? (
    <div ref={morningBox}>
      <MorningQuestionTurn card={dayCard} />
    </div>
  ) : null;
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const todayStart = zonedDateTimeToEpoch(
    toDayKey(now, timeZone),
    '00:00',
    timeZone,
  );
  const headerBox = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = headerBox.current;
    if (!element) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty(
        '--helm-home-header-h',
        `${element.getBoundingClientRect().height}px`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--helm-home-header-h');
    };
  }, []);
  const composerBox = useRef<HTMLDivElement>(null);
  const dayCardBox = useRef<HTMLDivElement>(null);
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
        ref={headerBox}
        data-home-header
        className='bg-background sticky top-0 z-10 -mx-4 px-4 pt-0'
      >
        <div className='flex h-[60px] items-center justify-between gap-3 lg:justify-end'>
          <div className='flex min-w-0 items-center gap-2 lg:hidden'>
            <AssistantMark name={name} isLarge />
            <h1 className='helm-serif truncate text-[28px] leading-[34px]'>
              {name}
            </h1>
          </div>
          {keyStatus === 'ready' && (
            <div className='flex shrink-0 items-center gap-3'>
              {hasFreshTurns && uid && <NewConversationButton uid={uid} />}
              <div className='flex items-center gap-3 lg:hidden'>
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
            </div>
          )}
        </div>
        {keyStatus === 'ready' && <QuietLines now={now} />}
      </div>
      <div className='flex flex-1 flex-col gap-8 pt-4'>
        {cards.includes('day') && (
          <div ref={dayCardBox} className='empty:hidden'>
            <DayCard
              card={dayCard}
              isMorningLive={isMorningLive}
              onAsk={() => setMorningReaskedAt(Date.now())}
            />
          </div>
        )}
        {cards.includes('grouping') && grouping.offer && (
          <GroupingCard key={grouping.offer.id} grouping={grouping.offer} />
        )}
        {cards.includes('filedLine') && grouping.filed && (
          <GroupingFiledLine
            key={grouping.filed.id}
            grouping={grouping.filed}
          />
        )}
        {isOpening && (
          <div
            className='flex flex-1 flex-col items-center justify-center gap-4 pb-16'
            role='status'
          >
            <WorkingRing isWorking className='text-primary'>
              <AssistantMark name={name} isHero />
            </WorkingRing>
            <p className='text-muted-foreground text-[15px]'>
              {HELM_COPY.homeOpening}
            </p>
          </div>
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
        {!hasTurns && morningTurn}
        {hasTurns && (
          <ConversationThread
            key={freshFrom}
            sessions={sessions}
            openSessionId={openSessionId}
            scroll='window'
            loadsEarlier
            foldsBefore={todayStart}
            freshFrom={homeFrom}
            holdsOn={
              isMorningLive
                ? morningBox
                : keyStatus === 'ready' && isDayCardAsking
                  ? dayCardBox
                  : null
            }
            tail={morningTurn}
          />
        )}
        {!hasFreshTurns && !isOpening && !isWaitingOnKey && !isMorningLive && (
          <p className='text-muted-foreground text-center text-[15px]'>
            {HELM_COPY.homeHint}
          </p>
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
              failure={keyFailure}
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
          'pointer-events-none fixed inset-x-0 bottom-[calc(var(--helm-dock-top,env(safe-area-inset-bottom,0px))+8px)] z-30 px-4 transition-[bottom,translate,opacity,visibility] duration-200 ease-out motion-reduce:transition-none lg:bottom-6 lg:left-65',
          !isDesktop &&
            voice.state !== 'idle' &&
            voice.dictationOwner !== HOME_COMPOSER_ID &&
            'invisible translate-y-8 opacity-0',
        )}
      >
        <div
          ref={composerBox}
          className={join(
            "before:from-background pointer-events-auto relative mx-auto max-w-xl before:pointer-events-none before:absolute before:inset-x-[-1rem] before:-top-6 before:bottom-1/2 before:-z-10 before:bg-gradient-to-t before:to-transparent before:content-[''] lg:max-w-3xl",
            isComposing &&
              "after:bg-background after:pointer-events-none after:absolute after:inset-x-[-1rem] after:top-1/2 after:-bottom-24 after:-z-10 after:content-['']",
          )}
        >
          {isDesktop && (
            <div className='mb-3 flex flex-col gap-3'>
              {!isComposing && <TalkNotice />}
              <VoiceStatus hasControls={voice.state !== 'idle'} />
            </div>
          )}
          <Composer
            key={keyStatus === 'ready' ? 'ready' : 'waiting'}
            fieldRef={composerRef}
            hasTalkButton={isDesktop}
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

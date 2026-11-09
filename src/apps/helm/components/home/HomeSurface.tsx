import { useEffect, type Ref } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { Settings2 } from 'lucide-react';

import HeaderIconButton from '@/components/HeaderIconButton';
import LazyMount from '@/components/LazyMount';
import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatDate } from '@/utils/formatUtils';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import Composer from '@apps/helm/components/home/Composer';
import TurnCard from '@apps/helm/components/home/TurnCard';
import CannotOpenState from '@apps/helm/components/states/CannotOpenState';
import NeedsConnectionState from '@apps/helm/components/states/NeedsConnectionState';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useSession } from '@apps/helm/hooks/useSession';
import { loadEarlierSessions } from '@apps/helm/store/actions/captureActions';
import { retryKey, type KeyStatus } from '@apps/helm/store/helmSlice';
import { groupSessionsByDay, type Session } from '@apps/helm/utils/sessions';

interface HomeSurfaceProps {
  composerRef: Ref<HTMLTextAreaElement>;
  onComposerFocusChange: (isFocused: boolean) => void;
  onOpenSettings: () => void;
}

const TURN_ESTIMATED_HEIGHT = 88;

const WAITING_PLACEHOLDER: Record<KeyStatus, string | null> = {
  loading: null,
  ready: null,
  offline: HELM_COPY.composerOffline,
  failed: HELM_COPY.composerBlocked,
};

/** Mounts when scrolled near and brings in the next page of earlier sessions. */
function EarlierLoader({ uid }: { uid: string }) {
  useEffect(() => {
    void loadEarlierSessions(uid);
  }, [uid]);

  return (
    <p className='text-muted-foreground text-center text-[13px]' role='status'>
      {HELM_COPY.loadingEarlier}
    </p>
  );
}

function SessionTurns({
  session,
  latestId,
  noticeId,
}: {
  session: Session;
  latestId: string | null;
  noticeId: string | null;
}) {
  return (
    <div className='flex flex-col gap-4'>
      {session.turns.map((turn) => (
        <TurnCard
          key={turn.id}
          capture={turn}
          showsOutcome={turn.id === latestId}
          showsReading={false}
          isOnHome
          showsNotice={turn.id === noticeId}
        />
      ))}
    </div>
  );
}

function HomeSurface({
  composerRef,
  onComposerFocusChange,
  onOpenSettings,
}: HomeSurfaceProps) {
  const name = useAssistantName();
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const isKeyRetrying = useAppSelector((state) => state.helm.isKeyRetrying);
  const keyRefusals = useAppSelector((state) => state.helm.keyRefusals);
  const { sessions, openSessionId } = useSession();
  const { isLoaded: isCapturesLoaded, isFailed: isCapturesFailed } =
    useAppSelector((state) => state.helm.recentCaptures);
  const earlier = useAppSelector((state) => state.helm.earlier);
  const hasTurns = sessions.length > 0;
  const latestId = sessions.at(-1)?.turns.at(-1)?.id ?? null;
  const noticeId =
    sessions
      .flatMap((session) => session.turns)
      .filter((turn) => turn.status === 'sorted')
      .at(-1)?.id ?? null;

  // Home rests on the newest turn while earlier sessions mount above it, until the person scrolls or types.
  useEffect(() => {
    if (!latestId) return;
    const follow = { isOn: true };
    const toBottom = () => {
      if (follow.isOn) {
        window.scrollTo({ top: document.documentElement.scrollHeight });
      }
    };
    const stop = () => {
      follow.isOn = false;
    };
    const intents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    const observer = new ResizeObserver(toBottom);
    observer.observe(document.body);
    intents.forEach((name) =>
      window.addEventListener(name, stop, { passive: true }),
    );
    toBottom();
    return () => {
      observer.disconnect();
      intents.forEach((name) => window.removeEventListener(name, stop));
    };
  }, [latestId]);

  return (
    <main className='flex flex-1 flex-col gap-8'>
      <div className='relative flex flex-col items-center gap-2 pt-10 text-center'>
        {keyStatus === 'ready' && (
          <div className='absolute top-0 right-0'>
            <HeaderIconButton
              icon={<Settings2 className='size-4' aria-hidden='true' />}
              label={HELM_COPY.settingsTitle}
              onClick={onOpenSettings}
            />
          </div>
        )}
        <div className='flex items-center gap-2'>
          <AssistantMark name={name} isLarge />
          <h1 className='helm-serif text-[28px] leading-[34px]'>{name}</h1>
        </div>
        {keyStatus !== 'offline' && keyStatus !== 'failed' && (
          <p className='text-muted-foreground text-[15px]'>
            {HELM_COPY.homeHint}
          </p>
        )}
      </div>
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
        <div className='flex flex-1 flex-col justify-end gap-4'>
          {user && !earlier.isExhausted && !earlier.isFailed && (
            <LazyMount key={earlier.captures.length} estimatedHeight={32}>
              <EarlierLoader uid={user.uid} />
            </LazyMount>
          )}
          {user && earlier.isFailed && (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className='self-center'
              onClick={() => void loadEarlierSessions(user.uid)}
            >
              {HELM_COPY.earlierFailed}
            </Button>
          )}
          {groupSessionsByDay(sessions).map((day) => (
            <section key={day.dayStart} className='flex flex-col gap-4'>
              <SectionDivider label={formatDate(day.dayStart)} />
              {day.sessions.map((session) =>
                session.sessionId === openSessionId ? (
                  <SessionTurns
                    key={session.sessionId}
                    session={session}
                    latestId={latestId}
                    noticeId={noticeId}
                  />
                ) : (
                  <LazyMount
                    key={session.sessionId}
                    estimatedHeight={
                      TURN_ESTIMATED_HEIGHT * session.turns.length
                    }
                  >
                    <SessionTurns
                      session={session}
                      latestId={latestId}
                      noticeId={noticeId}
                    />
                  </LazyMount>
                ),
              )}
            </section>
          ))}
        </div>
      )}
      <div className='mt-auto flex flex-col gap-4'>
        {keyStatus === 'offline' && <NeedsConnectionState name={name} />}
        {keyStatus === 'failed' && (
          <CannotOpenState
            isRetrying={isKeyRetrying}
            hasRetryFailed={keyRefusals > 1}
            onRetry={() => dispatch(retryKey())}
          />
        )}
        <Composer
          key={keyStatus === 'ready' ? 'ready' : 'waiting'}
          fieldRef={composerRef}
          onFocusChange={onComposerFocusChange}
          isReady={keyStatus === 'ready'}
          waitingPlaceholder={WAITING_PLACEHOLDER[keyStatus]}
        />
      </div>
    </main>
  );
}

export default HomeSurface;

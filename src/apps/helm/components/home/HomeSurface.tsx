import { useEffect, type Ref } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import LazyMount from '@/components/LazyMount';
import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { formatDate } from '@/utils/formatUtils';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import Composer from '@apps/helm/components/home/Composer';
import TurnCard from '@apps/helm/components/home/TurnCard';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useSession } from '@apps/helm/hooks/useSession';
import { loadEarlierSessions } from '@apps/helm/store/actions/captureActions';
import { groupSessionsByDay, type Session } from '@apps/helm/utils/sessions';

interface HomeSurfaceProps {
  composerRef: Ref<HTMLTextAreaElement>;
}

const TURN_ESTIMATED_HEIGHT = 88;

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

function SessionTurns({ session }: { session: Session }) {
  return (
    <div className='flex flex-col gap-4'>
      {session.turns.map((turn) => (
        <TurnCard key={turn.id} capture={turn} />
      ))}
    </div>
  );
}

/** Home is the conversation: the assistant's name, one quiet line, earlier sessions a scroll up (a day at a time), the session in progress at the bottom and, before anything is said, one card saying how to begin. */
function HomeSurface({ composerRef }: HomeSurfaceProps) {
  const name = useAssistantName();
  const { user } = useAuth();
  const { sessions, openSessionId } = useSession();
  const isCapturesLoaded = useAppSelector(
    (state) => state.helm.recentCaptures.isLoaded,
  );
  const earlier = useAppSelector((state) => state.helm.earlier);
  const hasTurns = sessions.length > 0;

  return (
    <main className='flex flex-1 flex-col gap-8'>
      <div className='flex flex-col items-center gap-2 pt-10 text-center'>
        <div className='flex items-center gap-2'>
          <AssistantMark name={name} />
          <h1 className='helm-serif text-[28px] leading-[34px]'>{name}</h1>
        </div>
        <p className='text-muted-foreground text-[15px]'>
          {HELM_COPY.homeHint}
        </p>
      </div>
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
                  <SessionTurns key={session.sessionId} session={session} />
                ) : (
                  <LazyMount
                    key={session.sessionId}
                    estimatedHeight={
                      TURN_ESTIMATED_HEIGHT * session.turns.length
                    }
                  >
                    <SessionTurns session={session} />
                  </LazyMount>
                ),
              )}
            </section>
          ))}
        </div>
      )}
      <Composer fieldRef={composerRef} />
    </main>
  );
}

export default HomeSurface;

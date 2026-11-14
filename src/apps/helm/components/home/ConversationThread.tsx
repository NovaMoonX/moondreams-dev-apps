import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronDown } from 'lucide-react';

import LazyMount from '@/components/LazyMount';
import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { formatDate } from '@/utils/formatUtils';
import TurnCard from '@apps/helm/components/home/TurnCard';
import { HELM_COPY } from '@apps/helm/constants';
import { loadEarlierSessions } from '@apps/helm/store/actions/captureActions';
import {
  groupSessionsByDay,
  groupTurns,
  type Session,
} from '@apps/helm/utils/sessions';

const TURN_ESTIMATED_HEIGHT = 88;

interface ConversationThreadProps {
  sessions: Session[];
  openSessionId: string | null;
  /** What scrolls to keep the newest turn in view: the page itself, or the layer the thread sits in. */
  scroll: 'window' | 'container';
  /** Brings in the next page of earlier sessions as the top is scrolled near. */
  loadsEarlier: boolean;
  /** Sessions that started before this moment fold behind one "Earlier" row, except the open one and the newest. */
  foldsBefore?: number | null;
  /** Sessions that started before the conversation last started fresh fold too, the newest included. */
  freshFrom?: number;
}

type Place = { id: string; top: number } | null;

const getScroller = (
  root: HTMLElement | null,
  scroll: 'window' | 'container',
) =>
  scroll === 'container'
    ? (root?.closest<HTMLElement>('[data-subview-scroller]') ?? null)
    : null;

// The first session in view, so turns added above it (Earlier opening, an older page, a session drawn for real) never move what the person is reading. Safari on iOS does no scroll anchoring of its own.
const readPlace = (
  root: HTMLElement | null,
  scroller: HTMLElement | null,
): Place => {
  const top = scroller?.getBoundingClientRect().top ?? 0;
  const anchors = Array.from(
    root?.querySelectorAll<HTMLElement>('[data-anchor]') ?? [],
  );
  const inView =
    anchors.find((element) => element.getBoundingClientRect().top >= top) ??
    anchors.find((element) => element.getBoundingClientRect().bottom > top);
  return inView
    ? {
        id: inView.dataset.anchor ?? '',
        top: inView.getBoundingClientRect().top,
      }
    : null;
};

/** Scrolls so the remembered session is back where it was; says whether it moved anything. */
const returnToPlace = (
  root: HTMLElement | null,
  scroller: HTMLElement | null,
  place: Place,
) => {
  if (!place) return false;
  const element = root?.querySelector<HTMLElement>(
    `[data-anchor="${place.id}"]`,
  );
  if (!element) return false;
  const shift = element.getBoundingClientRect().top - place.top;
  if (Math.abs(shift) < 1) return false;
  if (scroller) scroller.scrollBy({ top: shift });
  else window.scrollBy({ top: shift });
  return true;
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
      {groupTurns(session.turns).map(({ lead, joined }) => (
        <TurnCard
          key={lead.id}
          capture={lead}
          joined={joined}
          showsOutcome={(joined.at(-1) ?? lead).id === latestId}
          showsReading={false}
          isOnHome
          showsNotice={lead.id === noticeId}
        />
      ))}
    </div>
  );
}

/** The turns of a conversation, by day and session, resting on the newest until the person scrolls or types. Home draws every session; the conversation over a page draws the open one. */
function ConversationThread({
  sessions,
  openSessionId,
  scroll,
  loadsEarlier,
  foldsBefore = null,
  freshFrom = 0,
}: ConversationThreadProps) {
  const { user } = useAuth();
  const [isUnfolded, setIsUnfolded] = useState(false);
  const earlier = useAppSelector((state) => state.helm.earlier);
  const root = useRef<HTMLDivElement>(null);
  const isFollowing = useRef(true);
  const place = useRef<Place>(null);
  const latestId = sessions.at(-1)?.turns.at(-1)?.id ?? null;
  const noticeId =
    sessions
      .flatMap((session) => groupTurns(session.turns).map((turn) => turn.lead))
      .filter((turn) => turn.status === 'sorted')
      .at(-1)?.id ?? null;

  // The newest turn stays in view while earlier sessions mount above it, until the person scrolls or types.
  useEffect(() => {
    if (!latestId) return;
    const scroller = getScroller(root.current, scroll);
    isFollowing.current = true;
    // The scroll our own correction causes is not the person moving, so it doesn't move the remembered place.
    const adjusted = { at: 0 };
    const keepPlace = () => {
      if (performance.now() - adjusted.at < 120) return;
      place.current = readPlace(root.current, scroller);
    };
    const toBottom = () => {
      if (!isFollowing.current) {
        if (returnToPlace(root.current, scroller, place.current)) {
          adjusted.at = performance.now();
        }
        return;
      }
      if (scroller) scroller.scrollTo({ top: scroller.scrollHeight });
      else window.scrollTo({ top: document.documentElement.scrollHeight });
    };
    const stop = () => {
      isFollowing.current = false;
      keepPlace();
    };
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', keepPlace, { passive: true });
    const intents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    const observer = new ResizeObserver(toBottom);
    observer.observe(scroller?.firstElementChild ?? document.body);
    intents.forEach((name) =>
      window.addEventListener(name, stop, { passive: true }),
    );
    toBottom();
    return () => {
      observer.disconnect();
      target.removeEventListener('scroll', keepPlace);
      intents.forEach((name) => window.removeEventListener(name, stop));
    };
  }, [latestId, scroll]);

  if (sessions.length === 0) return null;

  const lastSessionId = sessions.at(-1)?.sessionId;
  const isFolded = (session: Session) =>
    foldsBefore !== null &&
    session.sessionId !== openSessionId &&
    (session.startedAt < freshFrom ||
      (session.startedAt < foldsBefore && session.sessionId !== lastSessionId));
  const foldedSessions = sessions.filter(isFolded);
  const foldedCount = foldedSessions.reduce(
    (sum, session) => sum + groupTurns(session.turns).length,
    0,
  );
  const hasFold = foldedSessions.length > 0 && !isUnfolded;
  const shownSessions = hasFold
    ? sessions.filter((session) => !isFolded(session))
    : sessions;

  return (
    <div ref={root} className='flex flex-1 flex-col gap-4'>
      {hasFold && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className="relative min-h-0 self-center rounded-full before:absolute before:-inset-x-2 before:-inset-y-2 before:content-['']"
          onClick={() => {
            isFollowing.current = false;
            place.current = readPlace(
              root.current,
              getScroller(root.current, scroll),
            );
            setIsUnfolded(true);
          }}
        >
          {HELM_COPY.earlierFold(foldedCount)}
          <ChevronDown className='size-4' aria-hidden='true' />
        </Button>
      )}
      <div className='flex flex-1 flex-col justify-end gap-4'>
        {loadsEarlier &&
          user &&
          !hasFold &&
          !earlier.isExhausted &&
          !earlier.isFailed && (
            <LazyMount key={earlier.captures.length} estimatedHeight={32}>
              <EarlierLoader uid={user.uid} />
            </LazyMount>
          )}
        {loadsEarlier && user && !hasFold && earlier.isFailed && (
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
        {groupSessionsByDay(shownSessions).map((day) => (
          <section key={day.dayStart} className='flex flex-col gap-4'>
            <SectionDivider label={formatDate(day.dayStart)} />
            {day.sessions.map((session) =>
              session.sessionId === openSessionId ? (
                <div key={session.sessionId} data-anchor={session.sessionId}>
                  <SessionTurns
                    session={session}
                    latestId={latestId}
                    noticeId={noticeId}
                  />
                </div>
              ) : (
                <div key={session.sessionId} data-anchor={session.sessionId}>
                  <LazyMount
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
                </div>
              ),
            )}
          </section>
        ))}
        <div data-anchor='end' />
      </div>
    </div>
  );
}

export default ConversationThread;

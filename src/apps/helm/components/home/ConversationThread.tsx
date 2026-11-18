import { Fragment, useEffect, useRef, useState, type RefObject } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronDown, ChevronUp } from 'lucide-react';

import LazyMount from '@/components/LazyMount';
import SectionDivider from '@/components/SectionDivider';
import StickyDivider from '@/components/StickyDivider';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import TurnCard from '@apps/helm/components/home/TurnCard';
import { HELM_COPY } from '@apps/helm/constants';
import { loadEarlierSessions } from '@apps/helm/store/actions/captureActions';
import {
  groupSessionsByDay,
  groupTurns,
  type Session,
} from '@apps/helm/utils/sessions';

const TURN_ESTIMATED_HEIGHT = 88;
const HOLD_WINDOW_MS = 5000;

const readRestTop = (
  element: HTMLElement | null,
  scroller: HTMLElement | null,
) => {
  if (!element) return 0;
  const box = element.getBoundingClientRect();
  const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
  const viewHeight = scroller ? scroller.clientHeight : window.innerHeight;
  const dock =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        '--helm-composer-h',
      ),
    ) || 0;
  const current = scroller ? scroller.scrollTop : window.scrollY;
  const top = current + box.top - viewTop;
  const endClear = current + box.bottom - viewTop - (viewHeight - dock - 16);
  return Math.max(0, Math.min(top, endClear));
};

interface ConversationThreadProps {
  sessions: Session[];
  openSessionId: string | null;
  /** What scrolls to keep the newest turn in view: the page itself, or the layer the thread sits in. */
  scroll: 'window' | 'container';
  /** Brings in the next page of earlier sessions as the top is scrolled near. */
  loadsEarlier: boolean;
  /** Sessions that started before this moment fold behind one "Earlier" row, except the open one and the newest. */
  foldsBefore?: number | null;
  /** Sessions that started before this moment fold too, the newest included (a fresh start, or today's midnight with Start each day fresh on). */
  freshFrom?: number;
  /** Something above the thread is asking the person first (home's day card): the page rests at its top until a new turn arrives or the person moves. */
  /** While the page opens, rest on this element with its end clear of the dock instead of following the newest turn. */
  holdsOn?: RefObject<HTMLElement | null> | null;
}

type Place = { id: string; top: number } | null;

const getScroller = (
  root: HTMLElement | null,
  scroll: 'window' | 'container',
) =>
  scroll === 'container'
    ? (root?.closest<HTMLElement>('[data-subview-scroller]') ?? null)
    : null;

// The first session whose top is in view (one straddling the edge can grow itself), so turns added above never move what the person reads. iOS Safari does no scroll anchoring.
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

const DAY_MS = 24 * 60 * 60 * 1000;

const formatThreadDay = (dayStart: number) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysAgo = Math.round((today.getTime() - dayStart) / DAY_MS);
  if (daysAgo === 0) return HELM_COPY.threadToday;
  if (daysAgo === 1) return HELM_COPY.threadYesterday;
  const date = new Date(dayStart);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
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
  holdsOn = null,
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
  const hasMoved = useRef(false);
  const heldFor = useRef<string | null>(null);
  const firstSeenAt = useRef<number | null>(null);
  useEffect(() => {
    if (!latestId) return;
    const scroller = getScroller(root.current, scroll);
    firstSeenAt.current ??= performance.now();
    // Held only while the page is still opening (the card may load just after the turns), over the turn it was first shown with and until the person moves, so a card that appears later never jumps the page.
    const isOpening = performance.now() - firstSeenAt.current < HOLD_WINDOW_MS;
    const hold = {
      isOn:
        holdsOn !== null &&
        !hasMoved.current &&
        (heldFor.current === latestId ||
          (heldFor.current === null && isOpening)),
    };
    if (hold.isOn) heldFor.current = latestId;
    isFollowing.current = !hold.isOn;
    // The scroll our own correction causes is not the person moving, so it doesn't move the remembered place.
    const adjusted = { at: 0 };
    const keepPlace = () => {
      if (performance.now() - adjusted.at < 120) return;
      place.current = readPlace(root.current, scroller);
    };
    const toBottom = () => {
      if (hold.isOn) {
        const top = readRestTop(holdsOn?.current ?? null, scroller);
        if (scroller) scroller.scrollTo({ top });
        else window.scrollTo({ top });
        return;
      }
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
      hasMoved.current = true;
      hold.isOn = false;
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
  }, [latestId, scroll, holdsOn]);

  if (sessions.length === 0) return null;

  const lastSessionId = sessions.at(-1)?.sessionId;
  const isFolded = (session: Session) =>
    foldsBefore !== null &&
    session.sessionId !== openSessionId &&
    (session.startedAt < freshFrom ||
      (session.startedAt < foldsBefore && session.sessionId !== lastSessionId));
  const foldedSessions = sessions.filter(isFolded);
  const hasFold = foldedSessions.length > 0 && !isUnfolded;
  // Once opened, Hide earlier sits just above the first session after the last folded one, or at the end when every session was folded.
  const foldEnd = sessions.reduce(
    (end, session, index) => (isFolded(session) ? index + 1 : end),
    0,
  );
  const hideBeforeId =
    !hasFold && foldEnd > 0 ? (sessions[foldEnd]?.sessionId ?? null) : null;
  const shownSessions = hasFold
    ? sessions.filter((session) => !isFolded(session))
    : sessions;
  const hideButton = (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      className="relative min-h-0 self-center rounded-full before:absolute before:-inset-x-2 before:-inset-y-2 before:content-['']"
      onClick={() => {
        isFollowing.current = true;
        setIsUnfolded(false);
      }}
    >
      {HELM_COPY.earlierHide}
      <ChevronUp className='size-4' aria-hidden='true' />
    </Button>
  );
  const renderSession = (session: Session, isFirstOfDay: boolean) => (
    <Fragment key={session.sessionId}>
      {session.sessionId === hideBeforeId && !isFirstOfDay && hideButton}
      <div data-anchor={session.sessionId}>
        {session.sessionId === openSessionId ? (
          <SessionTurns
            session={session}
            latestId={latestId}
            noticeId={noticeId}
          />
        ) : (
          <LazyMount
            estimatedHeight={TURN_ESTIMATED_HEIGHT * session.turns.length}
          >
            <SessionTurns
              session={session}
              latestId={latestId}
              noticeId={noticeId}
            />
          </LazyMount>
        )}
      </div>
    </Fragment>
  );
  const days = groupSessionsByDay(shownSessions);

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
          {HELM_COPY.earlierFold}
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
        {days.map((day) => {
          const startsAtHide = day.sessions[0]?.sessionId === hideBeforeId;
          return (
            <Fragment key={day.dayStart}>
              {startsAtHide && hideButton}
              <section className='flex flex-col gap-4'>
                {scroll === 'window' ? (
                  <StickyDivider
                    label={formatThreadDay(day.dayStart)}
                    className='sticky top-(--helm-home-header-h,0px) z-[5] -mx-4 px-5!'
                    stuckClassName='bg-background! backdrop-blur-none!'
                  />
                ) : (
                  <SectionDivider label={formatThreadDay(day.dayStart)} />
                )}
                {day.sessions.map((session, index) =>
                  renderSession(session, index === 0),
                )}
              </section>
            </Fragment>
          );
        })}
        {!hasFold && foldEnd === sessions.length && hideButton}
        <div data-anchor='end' />
      </div>
    </div>
  );
}

export default ConversationThread;

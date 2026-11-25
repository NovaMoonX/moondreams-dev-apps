import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { Badge, Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';

import LazyMount from '@/components/LazyMount';
import RevealChip from '@/components/RevealChip';
import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useNoIndex } from '@/hooks/useNoIndex';
import { useNow } from '@/hooks/useNow';
import { formatDate, formatDuration, formatTime } from '@/utils/formatUtils';
import { fromLocalDateAndTimeInputValues } from '@/utils/dateInputUtils';
import Loading from '@/ui/Loading';
import FormatBadge from '@apps/a-list/components/shared/FormatBadge';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import ShowOnMyCalendar from '@apps/a-list/components/share/ShowOnMyCalendar';
import { SHARE_PIN_LENGTH } from '@apps/a-list/constants';
import { useAListTheme } from '@apps/a-list/hooks/useAListTheme';
import { sharedCalendarQueryOptions } from '@apps/a-list/queries/shareQueries';
import { startShareFeedListener } from '@apps/a-list/store/listeners/addedCalendarListeners';
import type {
  ShareFeed,
  SharedCalendar as SharedCalendarData,
  SharedCalendarResult,
  SharedViewing,
} from '@apps/a-list/types';
import { getDayKey } from '@apps/a-list/utils/dayKeys';
import {
  getShareRangeLabel,
  groupSharedViewingsByDay,
} from '@apps/a-list/utils/sharing';

const EAGER_DAYS = 4;

// U+2217 is an asterisk drawn on the text's vertical center; a plain `*` sits high and shifts the line when revealed.
const MASK_CHAR = '\u2217';

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

function Message({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children?: string;
}) {
  return (
    <div className='mx-auto max-w-sm space-y-2 py-16 text-center'>
      <p className='text-5xl' aria-hidden='true'>
        {emoji}
      </p>
      <h1 className='text-xl font-semibold'>{title}</h1>
      {children && <p className='text-muted-foreground text-sm'>{children}</p>}
    </div>
  );
}

interface PinGateProps {
  isWrong: boolean;
  isChecking: boolean;
  onSubmit: (pin: string) => void;
}

function toPinText(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, SHARE_PIN_LENGTH);
}

/** A pasted message like "Movie plans … PIN: k7-m2" yields just the PIN. */
function toPastedPin(text: string) {
  const labeled = text.match(/\bpin\W*([a-z0-9]{4})\b/i);
  return toPinText(labeled ? labeled[1] : text);
}

function PinGate({ isWrong, isChecking, onSubmit }: PinGateProps) {
  const [pin, setPin] = useState('');
  const [hasEdited, setHasEdited] = useState(false);
  const [isShown, setIsShown] = useState(false);
  const canSubmit = pin.length === SHARE_PIN_LENGTH && !isChecking;

  return (
    <form
      className='mx-auto max-w-sm space-y-4 py-16 text-center'
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) {
          setHasEdited(false);
          onSubmit(pin);
        }
      }}
    >
      <p className='text-5xl' aria-hidden='true'>
        🔒
      </p>
      <h1 className='text-xl font-semibold'>This calendar has a PIN</h1>
      <p className='text-muted-foreground text-sm'>
        Enter the {SHARE_PIN_LENGTH}-character PIN the person who shared it sent
        you.
      </p>
      <div className='relative'>
        <Input
          variant='outline'
          rounded='full'
          aria-label='PIN'
          autoComplete='off'
          data-1p-ignore=''
          data-lpignore='true'
          autoCapitalize='characters'
          autoCorrect='off'
          spellCheck={false}
          placeholder='••••'
          className='h-12 px-12 py-0 text-center text-lg font-semibold tracking-[0.4em] uppercase'
          value={isShown ? pin : MASK_CHAR.repeat(pin.length)}
          onPaste={(event) => {
            event.preventDefault();
            setPin(toPastedPin(event.clipboardData.getData('text')));
            setHasEdited(true);
          }}
          onChange={(event) => {
            const typed = event.target.value;
            setPin(
              isShown || typed.length >= pin.length
                ? toPinText(
                    isShown ? typed : pin + typed.replaceAll(MASK_CHAR, ''),
                  )
                : pin.slice(0, typed.length),
            );
            setHasEdited(true);
          }}
        />
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          rounded='full'
          aria-label={isShown ? 'Hide PIN' : 'Show PIN'}
          aria-pressed={isShown}
          className='absolute top-1/2 right-1 size-10 min-w-10 -translate-y-1/2'
          onClick={() => setIsShown((current) => !current)}
        >
          {isShown ? (
            <EyeOff className='h-5 w-5' />
          ) : (
            <Eye className='h-5 w-5' />
          )}
        </Button>
      </div>
      {isWrong && !isChecking && !hasEdited && (
        <p className='text-destructive text-sm' role='alert'>
          That PIN didn&apos;t match. Check it and try again.
        </p>
      )}
      <Button
        type='submit'
        rounded='full'
        className='w-full'
        disabled={!canSubmit}
      >
        {isChecking ? 'Checking…' : 'Unlock'}
      </Button>
    </form>
  );
}

function SharedViewingRow({ viewing }: { viewing: SharedViewing }) {
  const details = [
    formatTime(viewing.showtimeAt),
    viewing.runtimeMinutes
      ? formatDuration(viewing.runtimeMinutes * 60_000)
      : null,
    viewing.contentRating,
  ].filter((part): part is string => part !== null);

  return (
    <li className='flex items-center gap-3 py-2.5'>
      <span className='h-20 w-14 shrink-0 overflow-hidden rounded-lg shadow-sm'>
        <PosterCover
          title={viewing.title}
          posterUrl={viewing.posterUrl}
          compact
        />
      </span>
      <div className='min-w-0 flex-1 space-y-1'>
        <p className='truncate font-medium'>{viewing.title}</p>
        <p className='text-muted-foreground text-xs'>{details.join(' · ')}</p>
        {viewing.theatreName && (
          <p className='text-muted-foreground truncate text-xs'>
            📍 {viewing.theatreName}
          </p>
        )}
        {(viewing.format || viewing.status === 'SEEN') && (
          <div className='flex flex-wrap items-center gap-1.5'>
            {viewing.format && <FormatBadge format={viewing.format} />}
            {viewing.status === 'SEEN' && (
              <Badge
                variant='secondary'
                size='xs'
                className='gap-1 rounded-full! whitespace-nowrap'
              >
                <span aria-hidden='true'>🍿</span>
                Seen
              </Badge>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

type SharedDay = ReturnType<typeof groupSharedViewingsByDay>[number];

function DaySections({
  days,
  eagerDays,
}: {
  days: SharedDay[];
  eagerDays: number;
}) {
  return days.map(({ dayKey, viewings }, dayPosition) => {
    const estimatedHeight = 28 + viewings.length * 101;
    return (
      <section
        key={dayKey}
        className='defer-offscreen space-y-1'
        style={{ '--defer-size': `${estimatedHeight}px` } as CSSProperties}
      >
        <SectionDivider
          label={dayFormatter.format(
            fromLocalDateAndTimeInputValues(dayKey, '12:00') ?? 0,
          )}
        />
        <LazyMount
          eager={dayPosition < eagerDays}
          estimatedHeight={estimatedHeight - 28}
        >
          <ul className='divide-border divide-y'>
            {viewings.map((viewing, index) => (
              <SharedViewingRow
                key={`${viewing.showtimeAt}-${index}`}
                viewing={viewing}
              />
            ))}
          </ul>
        </LazyMount>
      </section>
    );
  });
}

function countMovies(count: number) {
  return count === 1 ? '1 movie' : `${count} movies`;
}

function CalendarView({
  calendar,
  extra,
}: {
  calendar: SharedCalendarData;
  extra: ReactNode;
}) {
  const now = useNow();
  const [isPastShown, setIsPastShown] = useState(false);
  const isLive = calendar.kind === 'LIVE';
  const days = useMemo(
    () => groupSharedViewingsByDay(calendar.viewings),
    [calendar.viewings],
  );
  const todayKey = getDayKey(now);
  const upcomingDays = isLive
    ? days.filter((day) => day.dayKey >= todayKey)
    : days;
  const pastDays = isLive
    ? days.filter((day) => day.dayKey < todayKey).reverse()
    : [];
  const pastCount = pastDays.reduce(
    (total, day) => total + day.viewings.length,
    0,
  );
  const movieCount = calendar.viewings.length;
  const upcomingCount = upcomingDays.reduce(
    (total, day) => total + day.viewings.length,
    0,
  );

  return (
    <div className='space-y-5'>
      <div className='space-y-1'>
        <h1 className='text-2xl font-semibold tracking-tight'>
          🎬 Movie calendar
        </h1>
        <p className='text-muted-foreground text-sm'>
          {isLive
            ? `📡 Live${upcomingCount > 0 ? ` · ${upcomingCount} coming up` : ''}`
            : `Snapshot taken ${formatDate(calendar.createdAt)} · ${getShareRangeLabel(calendar)}`}
          {!isLive && movieCount > 0 && ` · ${countMovies(movieCount)}`}
        </p>
      </div>
      {extra}
      {days.length === 0 && (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          🍿 Nothing on this calendar.
        </p>
      )}
      {isLive && days.length > 0 && upcomingDays.length === 0 && (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          🍿 Nothing coming up yet.
        </p>
      )}
      <DaySections days={upcomingDays} eagerDays={EAGER_DAYS} />
      {pastCount > 0 && !isPastShown && (
        <div className='flex justify-center'>
          <RevealChip
            icon={<span aria-hidden='true'>🎞️</span>}
            onClick={() => setIsPastShown(true)}
          >
            Show {pastCount === 1 ? '1 past movie' : `${pastCount} past movies`}
          </RevealChip>
        </div>
      )}
      {isPastShown && <DaySections days={pastDays} eagerDays={0} />}
      <p className='text-muted-foreground text-center text-xs'>
        {isLive
          ? 'Times are shown in your time zone.'
          : "A snapshot, so it won't change if the plans do. Times are shown in your time zone."}
      </p>
      <div className='text-center'>
        <p className='text-muted-foreground text-xs'>
          No account needed to look.
        </p>
        <Button
          href='/a-list'
          variant='link'
          size='sm'
          className='h-10 underline'
        >
          Made with A-List Tracker
        </Button>
      </div>
    </div>
  );
}

function useShareFeed(feedId: string | null) {
  const [latest, setLatest] = useState<{
    feedId: string;
    feed: ShareFeed | null;
  } | null>(null);

  useEffect(() => {
    if (feedId === null) return;
    return startShareFeedListener(feedId, (feed) =>
      setLatest({ feedId, feed }),
    );
  }, [feedId]);

  if (feedId === null || latest?.feedId !== feedId) return undefined;
  return latest.feed;
}

function OkView({
  shareId,
  result,
}: {
  shareId: string;
  result: Extract<SharedCalendarResult, { status: 'ok' }>;
}) {
  const { user, signInWithGoogle } = useAuth();
  const feed = useShareFeed(result.feedId);

  if (feed === null) {
    return (
      <Message emoji='🎞️' title='This link has ended'>
        The person who shared it deleted it or changed its PIN, so it&apos;s no
        longer on your calendar either. Ask them for a new link.
      </Message>
    );
  }

  const calendar = feed ?? result.calendar;
  return (
    <CalendarView
      calendar={calendar}
      extra={
        user && result.feedId !== null ? (
          <ShowOnMyCalendar
            key={user.uid}
            uid={user.uid}
            shareId={shareId}
            feedId={result.feedId}
            kind={calendar.kind}
          />
        ) : user === null ? (
          <div className='bg-muted/50 flex items-center justify-between gap-3 rounded-2xl px-3 py-2'>
            <p className='min-w-0 text-sm'>
              📅 Sign in to show this on your own calendar
            </p>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              rounded='full'
              className='shrink-0 whitespace-nowrap'
              onClick={() => void signInWithGoogle()}
            >
              Sign in
            </Button>
          </div>
        ) : null
      }
    />
  );
}

/** The public page behind a share link: no sign-in, and nothing about whose calendar it is. */
function SharedCalendar() {
  const { shareId = '' } = useParams();
  const [submittedPin, setSubmittedPin] = useState<string | null>(null);
  const { user, loading: isAuthLoading } = useAuth();
  const query = useQuery({
    ...sharedCalendarQueryOptions(shareId, submittedPin, user?.uid ?? null),
    enabled: !isAuthLoading,
  });

  useAListTheme();

  useNoIndex();

  const getContent = () => {
    if (query.isError) {
      return (
        <div className='space-y-4 py-16 text-center'>
          <Message emoji='📡' title="We couldn't open this calendar">
            Check your connection and give it another try.
          </Message>
          <Button
            type='button'
            rounded='full'
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </div>
      );
    }
    if (query.data === undefined) {
      if (submittedPin === null) return <Loading />;
      return <PinGate isWrong={false} isChecking onSubmit={setSubmittedPin} />;
    }
    if (query.data.status === 'ok') {
      return <OkView shareId={shareId} result={query.data} />;
    }
    if (query.data.status === 'not_found') {
      return (
        <Message emoji='🎞️' title="This calendar isn't available">
          The link may have been deleted by the person who shared it, or the
          address got mistyped.
        </Message>
      );
    }
    return (
      <PinGate
        isWrong={query.data.status === 'wrong_pin'}
        isChecking={query.isFetching}
        onSubmit={setSubmittedPin}
      />
    );
  };

  return (
    <div className='page pb-16'>
      <div className='mx-auto max-w-2xl py-6'>{getContent()}</div>
    </div>
  );
}

export default SharedCalendar;

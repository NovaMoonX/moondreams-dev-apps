import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { Badge, Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';

import LazyMount from '@/components/LazyMount';
import SectionDivider from '@/components/SectionDivider';
import { formatDate, formatDuration, formatTime } from '@/utils/formatUtils';
import { fromLocalDateAndTimeInputValues } from '@/utils/dateInputUtils';
import Loading from '@/ui/Loading';
import FormatBadge from '@apps/a-list/components/shared/FormatBadge';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import { SHARE_PIN_LENGTH } from '@apps/a-list/constants';
import { useAListTheme } from '@apps/a-list/hooks/useAListTheme';
import { sharedCalendarQueryOptions } from '@apps/a-list/queries/shareQueries';
import type { SharedCalendar as SharedCalendarData, SharedViewing } from '@apps/a-list/types';
import {
  formatShareRange,
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

function Message({ emoji, title, children }: { emoji: string; title: string; children?: string }) {
  return (
    <div className='mx-auto max-w-sm space-y-2 py-16 text-center'>
      <p className='text-5xl' aria-hidden='true'>{emoji}</p>
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
      <p className='text-5xl' aria-hidden='true'>🔒</p>
      <h1 className='text-xl font-semibold'>This calendar has a PIN</h1>
      <p className='text-muted-foreground text-sm'>
        Enter the {SHARE_PIN_LENGTH}-character PIN the person who shared it sent you.
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
                ? toPinText(isShown ? typed : pin + typed.replaceAll(MASK_CHAR, ''))
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
          {isShown ? <EyeOff className='h-5 w-5' /> : <Eye className='h-5 w-5' />}
        </Button>
      </div>
      {isWrong && !isChecking && !hasEdited && (
        <p className='text-destructive text-sm' role='alert'>
          That PIN didn&apos;t match. Check it and try again.
        </p>
      )}
      <Button type='submit' rounded='full' className='w-full' disabled={!canSubmit}>
        {isChecking ? 'Checking…' : 'Unlock'}
      </Button>
    </form>
  );
}

function SharedViewingRow({ viewing }: { viewing: SharedViewing }) {
  const details = [
    formatTime(viewing.showtimeAt),
    viewing.runtimeMinutes ? formatDuration(viewing.runtimeMinutes * 60_000) : null,
    viewing.contentRating,
  ].filter((part): part is string => part !== null);

  return (
    <li className='flex items-center gap-3 py-2.5'>
      <span className='h-20 w-14 shrink-0 overflow-hidden rounded-lg shadow-sm'>
        <PosterCover title={viewing.title} posterUrl={viewing.posterUrl} compact />
      </span>
      <div className='min-w-0 flex-1 space-y-1'>
        <p className='truncate font-medium'>{viewing.title}</p>
        <p className='text-muted-foreground text-xs'>{details.join(' · ')}</p>
        {viewing.theatreName && (
          <p className='text-muted-foreground truncate text-xs'>📍 {viewing.theatreName}</p>
        )}
        {(viewing.format || viewing.status === 'SEEN') && (
          <div className='flex flex-wrap items-center gap-1.5'>
            {viewing.format && <FormatBadge format={viewing.format} />}
            {viewing.status === 'SEEN' && (
              <Badge variant='secondary' size='xs' className='gap-1 rounded-full! whitespace-nowrap'>
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

function CalendarView({ calendar }: { calendar: SharedCalendarData }) {
  const days = useMemo(
    () => groupSharedViewingsByDay(calendar.viewings),
    [calendar.viewings],
  );
  const movieCount = calendar.viewings.length;

  return (
    <div className='space-y-5'>
      <div className='space-y-1'>
        <h1 className='text-2xl font-semibold tracking-tight'>🎬 Movie calendar</h1>
        <p className='text-muted-foreground text-sm'>
          {formatShareRange(calendar.startDate, calendar.endDate)}
          {movieCount > 0 && ` · ${movieCount === 1 ? '1 movie' : `${movieCount} movies`}`}
        </p>
      </div>
      {days.length === 0 && (
        <p className='text-muted-foreground py-6 text-center text-sm'>🍿 Nothing on this calendar.</p>
      )}
      {days.map(({ dayKey, viewings }, dayPosition) => {
        const estimatedHeight = 28 + viewings.length * 101;
        return (
          <section
            key={dayKey}
            className='defer-offscreen space-y-1'
            style={{ '--defer-size': `${estimatedHeight}px` } as CSSProperties}
          >
            <SectionDivider
              label={dayFormatter.format(fromLocalDateAndTimeInputValues(dayKey, '12:00') ?? 0)}
            />
            <LazyMount eager={dayPosition < EAGER_DAYS} estimatedHeight={estimatedHeight - 28}>
              <ul className='divide-border divide-y'>
                {viewings.map((viewing, index) => (
                  <SharedViewingRow key={`${viewing.showtimeAt}-${index}`} viewing={viewing} />
                ))}
              </ul>
            </LazyMount>
          </section>
        );
      })}
      <p className='text-muted-foreground text-center text-xs'>
        A snapshot from {formatDate(calendar.createdAt)}, so it won&apos;t change if the plans do. Times are shown in your time zone.
      </p>
      <div className='text-center'>
        <p className='text-muted-foreground text-xs'>No account needed to look.</p>
        <Button href='/a-list' variant='link' size='sm' className='h-10 underline'>
          Made with A-List Tracker
        </Button>
      </div>
    </div>
  );
}

/** The public page behind a share link: no sign-in, and nothing about whose calendar it is. */
function SharedCalendar() {
  const { shareId = '' } = useParams();
  const [submittedPin, setSubmittedPin] = useState<string | null>(null);
  const query = useQuery(sharedCalendarQueryOptions(shareId, submittedPin));

  useAListTheme();

  useEffect(() => {
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  const getContent = () => {
    if (query.isError) {
      return (
        <div className='space-y-4 py-16 text-center'>
          <Message emoji='📡' title="We couldn't open this calendar">
            Check your connection and give it another try.
          </Message>
          <Button type='button' rounded='full' onClick={() => void query.refetch()}>
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
      return <CalendarView calendar={query.data.calendar} />;
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

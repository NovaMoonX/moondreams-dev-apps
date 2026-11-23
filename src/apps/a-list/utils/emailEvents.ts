import type { EmailIntakeState } from '@/lib/emailForwarding/types';
import { formatTimeInZone } from '@apps/a-list/utils/theatreTime';
import type { AListEmailEvent, AListEmailOutcome } from '@apps/a-list/types';

export const EMAIL_OUTCOME_EMOJIS: Record<AListEmailOutcome, string> = {
  added: '🎬',
  attached: '🎟️',
  canceled: '👋',
  cancelNotFound: '🔍',
  alreadyHandled: '♻️',
  confirm: '📬',
  notTicket: '📰',
  unread: '🤔',
};

/** Outcomes that show the forwarding does what it is for, so a test email counts and a walk can be ticked. */
const USEFUL_OUTCOMES: AListEmailOutcome[] = [
  'added',
  'attached',
  'canceled',
  'cancelNotFound',
  'alreadyHandled',
];

/** "Wed, Nov 25, 4:15 PM" on the theater's wall clock (the device's when the theater has no zone). */
export function formatShowtimeLine(epoch: number, timeZone: string | null) {
  const day = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(epoch);
  return `${day}, ${formatTimeInZone(epoch, timeZone)}`;
}

/** What happened to the calendar, in words. */
export function describeEmailEvent(
  event: AListEmailEvent,
  timeZone: string | null,
) {
  const title = event.movieTitle ?? event.removedViewing?.movie.title ?? null;
  const when =
    event.showtimeAt === null
      ? null
      : formatShowtimeLine(event.showtimeAt, timeZone);
  const named = title ?? 'a showing';
  const titles: Record<AListEmailOutcome, string> = {
    added: `Added ${named}${when ? ` · ${when}` : ''}`,
    attached: `Ticket added to ${named}`,
    canceled: `Took ${named} off your calendar`,
    alreadyHandled: 'Already on your calendar',
    cancelNotFound: `Couldn’t find ${named} on your calendar`,
    notTicket: 'Not an AMC ticket email',
    unread: 'Couldn’t read this AMC email',
    confirm: 'Forwarding confirmed',
  };
  return titles[event.outcome];
}

/** The sentence under the email in its sheet: what the app did and why. */
export function describeEmailOutcome(event: AListEmailEvent) {
  const lines: Record<AListEmailOutcome, string> = {
    added: 'A new showing went on your calendar with its ticket.',
    attached:
      'That showing was already on your calendar, so its ticket went onto it.',
    canceled:
      'AMC cancelled this reservation, so the showing came off your calendar.',
    cancelNotFound:
      'AMC cancelled a reservation that wasn’t on your calendar, so nothing changed.',
    alreadyHandled: 'You’d already forwarded this one, so nothing changed.',
    confirm: 'Your email service asked to confirm forwarding to this address.',
    notTicket: 'It wasn’t a reservation or a cancellation, so it was skipped.',
    unread:
      'It looked like an AMC reservation, but the details couldn’t be read. Nothing changed.',
  };
  return lines[event.outcome];
}

/** Whether Undo makes sense: the email changed something, and hasn't been undone. */
export function canUndoEmailEvent(event: AListEmailEvent) {
  if (event.undoneAt !== null) return false;
  if (event.outcome === 'canceled') return event.removedViewing !== null;
  return (
    (event.outcome === 'added' || event.outcome === 'attached') &&
    event.viewingId !== null
  );
}

export const UNDO_SUBTITLES: Partial<Record<AListEmailOutcome, string>> = {
  added: 'Take this showing off your calendar',
  attached: 'Remove the ticket, keep the showing',
  canceled: 'Put the showing back on your calendar',
};

/** The instant a new walk begins, from server-written times only (never this phone's clock): one past the latest confirmation or email, so a re-walk ticks only what arrives after it. */
export function getWalkStartedAt(
  intake: EmailIntakeState | null,
  events: AListEmailEvent[],
) {
  const known = [
    intake?.confirmAt ?? null,
    events[0]?.receivedAt ?? null,
  ].filter((value): value is number => value !== null);
  return known.length === 0 ? 0 : Math.max(...known) + 1;
}

/** Whether a useful email has arrived since `startedAt`. */
export function hasUsefulEmailSince(
  events: AListEmailEvent[],
  startedAt: number | null,
) {
  return events.some(
    (event) =>
      event.receivedAt > (startedAt ?? 0) &&
      USEFUL_OUTCOMES.includes(event.outcome),
  );
}

import { HELM_COPY } from '@apps/helm/constants';
import type { OpenDayAims, PlanSlot } from '@apps/helm/types';

const HOUR_MS = 3_600_000;
const DEFAULT_MINUTES = 30;

export type TopCard = 'needsYou' | 'day' | 'grouping';

const TOP_CARDS: readonly TopCard[] = ['needsYou', 'day', 'grouping'];

/** Home's top never holds more than this many cards. */
export const TOP_CARD_CAP = 3;

/** The cards home's top shows, in order and at most `TOP_CARD_CAP`; the day card is one card whether it is the morning or the wind-down. */
export const pickTopCards = (offered: readonly TopCard[]): TopCard[] =>
  TOP_CARDS.filter((card) => offered.includes(card)).slice(0, TOP_CARD_CAP);

export type DayCardMode = 'hidden' | 'ask' | 'answered' | 'windDown' | 'wound';

/** When the morning question stops being offered: a third of the way through the waking day (from the usual start to the usual end), or `fallback` when those two don't make a day. */
export const readMorningCutoff = (input: {
  dayStart: number;
  dayEnd: number;
  fallback: number;
}) =>
  input.dayEnd > input.dayStart
    ? input.dayStart + Math.floor((input.dayEnd - input.dayStart) / 3)
    : input.fallback;

/** The task ids a day still wants done, in the person's order; a task sent to tomorrow, left for later or dropped is no longer one. */
export const readAimTaskIds = (
  day: Pick<OpenDayAims, 'aims' | 'windDown'> | null,
): string[] =>
  [...(day?.aims ?? [])]
    .sort((first, second) => first.order - second.order)
    .filter((aim) => (day?.windDown[aim.taskId]?.choice ?? null) === null)
    .map((aim) => aim.taskId);

/** Which view of the day card home shows: the question (until `morningUntil`, then gone for the day with nothing said), the aims folded, the wind-down or the wound-down line. Nothing before the person's day starts, and no question once the day's last 2 hours begin. */
export function readDayCardMode(input: {
  day: OpenDayAims | null;
  now: number;
  dayStart: number;
  dayEnd: number;
  morningUntil: number;
}): DayCardMode {
  const { day, now, dayStart, dayEnd, morningUntil } = input;
  if (now < dayStart) return 'hidden';
  if (day?.windDownState === 'done') return 'wound';
  if (day?.windDownState === 'dismissed') return 'hidden';
  if (now >= dayEnd - 2 * HOUR_MS) {
    return day !== null && day.aims.length > 0 ? 'windDown' : 'hidden';
  }
  if (day?.state === 'answered' && day.aims.length > 0) return 'answered';
  return day?.state === 'dismissed' || now >= morningUntil ? 'hidden' : 'ask';
}

export type AimResult = 'done' | 'tonight' | 'wontHappen';

/** What an aim stands at: done, still possible before the day ends, or out of reach today. */
export function readAimResult(input: {
  isDone: boolean;
  slot: Pick<PlanSlot, 'startAt' | 'endAt' | 'status'> | null;
  minutes: number | null;
  now: number;
  dayEnd: number;
}): AimResult {
  const { isDone, slot, minutes, now, dayEnd } = input;
  if (isDone) return 'done';
  if (slot?.status === 'notToday') return 'wontHappen';
  if (slot && slot.startAt !== null && slot.endAt !== null) {
    return slot.endAt > now && slot.endAt <= dayEnd ? 'tonight' : 'wontHappen';
  }
  return now + (minutes ?? DEFAULT_MINUTES) * 60_000 <= dayEnd
    ? 'tonight'
    : 'wontHappen';
}

export interface WindDownCounts {
  done: number;
  left: number;
  tomorrow: number;
  later: number;
  dropped: number;
}

/** What each aim became, counted for the wound-down line. */
export const readWindDownCounts = (
  day: Pick<OpenDayAims, 'aims' | 'windDown'>,
  isDone: (taskId: string) => boolean,
): WindDownCounts =>
  day.aims.reduce<WindDownCounts>(
    (counts, { taskId }) => {
      const choice = day.windDown[taskId]?.choice ?? null;
      if (isDone(taskId)) return { ...counts, done: counts.done + 1 };
      if (choice === 'tomorrow') {
        return { ...counts, tomorrow: counts.tomorrow + 1 };
      }
      if (choice === 'later') return { ...counts, later: counts.later + 1 };
      return choice === 'dropped'
        ? { ...counts, dropped: counts.dropped + 1 }
        : { ...counts, left: counts.left + 1 };
    },
    { done: 0, tomorrow: 0, later: 0, dropped: 0, left: 0 },
  );

/** "30 min", "1h", "1h 30m": an aim's length as it is said. */
export const formatAimLength = (minutes: number) =>
  minutes < 60
    ? `${minutes} min`
    : minutes % 60 === 0
      ? `${minutes / 60}h`
      : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

/** The one line a folded morning card shows once answered. */
export const foldedAimsLine = (aims: number, planned: number) =>
  HELM_COPY.dayAimsFolded(aims, planned);

/** Yesterday's aims still undone that nothing has answered: not in today's aims and with no choice made. */
export function readCarryOver(
  yesterday: OpenDayAims | null,
  today: OpenDayAims | null,
  isOpen: (taskId: string) => boolean,
) {
  const onToday = new Set((today?.aims ?? []).map((aim) => aim.taskId));
  return [...(yesterday?.aims ?? [])]
    .sort((first, second) => first.order - second.order)
    .filter(
      (aim) =>
        isOpen(aim.taskId) &&
        !onToday.has(aim.taskId) &&
        (yesterday?.windDown[aim.taskId]?.choice ?? null) === null,
    );
}

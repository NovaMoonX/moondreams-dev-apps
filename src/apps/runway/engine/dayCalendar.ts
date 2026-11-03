import type { Cents, DateOnly } from '@apps/runway/types';

import { getPrevDueOn } from './cards';
import type { GoalTrack } from './pace';

export const CALENDAR_KINDS = ['income', 'bill', 'card', 'goal'] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export type CalendarEntry =
  | { kind: 'income'; on: DateOnly; dayKey: string }
  | { kind: 'bill'; on: DateOnly; billId: string; totalCents: Cents }
  | { kind: 'card'; on: DateOnly; cardId: string }
  | { kind: 'goal'; on: DateOnly; goalId: string; track: GoalTrack | null };

export interface CalendarSources {
  incomeDays: readonly { dayKey: string; on: DateOnly }[];
  billPayments: readonly {
    billId: string;
    dueOn: DateOnly;
    totalCents: Cents;
  }[];
  /** `since` is the first day a due day counts, so a card is not shown due before it existed. */
  cards: readonly {
    cardId: string;
    dueDay: number | null;
    since: DateOnly;
  }[];
  goals: readonly {
    goalId: string;
    targetDate: DateOnly | null;
    track: GoalTrack | null;
  }[];
}

const RANK = new Map<CalendarKind, number>(
  CALENDAR_KINDS.map((kind, index) => [kind, index]),
);

/** The card due days from `from` through `to`, one per month: the latest due day on or before each month's end. */
const getCardDueDays = (
  card: CalendarSources['cards'][number],
  from: DateOnly,
  to: DateOnly,
) => {
  const first = new Date(from);
  const last = new Date(to);
  const count =
    (last.getUTCFullYear() - first.getUTCFullYear()) * 12 +
    last.getUTCMonth() -
    first.getUTCMonth() +
    1;
  return Array.from({ length: count }, (_, index) =>
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + index + 1, 0),
  ).flatMap((monthEnd) => {
    const dueOn = getPrevDueOn(card.dueDay, monthEnd);
    return dueOn !== null && dueOn >= Math.max(from, card.since) && dueOn <= to
      ? [dueOn]
      : [];
  });
};

/** What falls on each day from `from` through `to` (both date-only), keyed by the day: income first, then bills, cards and goal dates. */
export function buildCalendarEntries(
  sources: CalendarSources,
  from: DateOnly,
  to: DateOnly,
): Map<DateOnly, CalendarEntry[]> {
  const inRange = (on: DateOnly) => on >= from && on <= to;
  const entries: CalendarEntry[] = [
    ...sources.incomeDays
      .filter(({ on }) => inRange(on))
      .map(({ dayKey, on }): CalendarEntry => ({ kind: 'income', on, dayKey })),
    ...sources.billPayments
      .filter(({ dueOn }) => inRange(dueOn))
      .map(({ billId, dueOn, totalCents }): CalendarEntry => ({
        kind: 'bill',
        on: dueOn,
        billId,
        totalCents,
      })),
    ...sources.cards.flatMap((card) =>
      getCardDueDays(card, from, to).map((on): CalendarEntry => ({
        kind: 'card',
        on,
        cardId: card.cardId,
      })),
    ),
    ...sources.goals.flatMap(({ goalId, targetDate, track }) =>
      targetDate !== null && inRange(targetDate)
        ? [{ kind: 'goal', on: targetDate, goalId, track } as CalendarEntry]
        : [],
    ),
  ];
  return entries
    .sort((a, b) => (RANK.get(a.kind) ?? 0) - (RANK.get(b.kind) ?? 0))
    .reduce((byDay, entry) => {
      byDay.set(entry.on, [...(byDay.get(entry.on) ?? []), entry]);
      return byDay;
    }, new Map<DateOnly, CalendarEntry[]>());
}

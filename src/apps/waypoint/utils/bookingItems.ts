import type { ChecklistItem, ExpenseLink } from '@apps/waypoint/types';

/** Events are the only plans that can be deleted out from under a link; one that is gone reads as no link. */
export function getLiveLink(item: ChecklistItem, eventIds: ReadonlySet<string>): ExpenseLink | null {
  const link = item.linkedTo ?? null;
  return link && (link.kind !== 'EVENT' || eventIds.has(link.id)) ? link : null;
}

export function isLinkedTo(item: ChecklistItem, link: ExpenseLink, eventIds: ReadonlySet<string>): boolean {
  const live = getLiveLink(item, eventIds);
  return live !== null && live.kind === link.kind && live.id === link.id;
}

/** Day a to-do for a plan is due: the day before it, so there is time to act, but never before the trip for a plan on its first day. */
export function getBookingDueDay(planDayIndex: number | null): number | null {
  return planDayIndex === null ? null : planDayIndex > 0 ? planDayIndex - 1 : planDayIndex;
}

export const BOOKING_VERBS = [
  { label: 'Book', prefix: 'Book' },
  { label: 'Reserve', prefix: 'Reserve' },
  { label: 'Buy tickets', prefix: 'Buy tickets for' },
] as const;

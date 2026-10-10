import type { ChecklistItem, ExpenseLink } from '@apps/waypoint/types';

/** A to-do linked to an event that no longer exists reads as unlinked. Only events are linked from the app today. */
export function getLiveLink(item: ChecklistItem, eventIds: ReadonlySet<string>): ExpenseLink | null {
  const link = item.linkedTo ?? null;
  return link && (link.kind !== 'EVENT' || eventIds.has(link.id)) ? link : null;
}

export function isLinkedTo(item: ChecklistItem, link: ExpenseLink, eventIds: ReadonlySet<string>): boolean {
  const live = getLiveLink(item, eventIds);
  return live !== null && live.kind === link.kind && live.id === link.id;
}

/** Day a to-do for a plan is due: the day before it, but never before today on a live trip or before the trip for a first-day plan. */
export function getBookingDueDay(planDayIndex: number | null, todayIndex: number): number | null {
  if (planDayIndex === null) {
    return null;
  }
  const dayBefore = planDayIndex > 0 ? planDayIndex - 1 : planDayIndex;
  return todayIndex > dayBefore && todayIndex <= planDayIndex ? todayIndex : dayBefore;
}

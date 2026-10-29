import type { Cents, MoneyRange, Schedule } from '@apps/runway/types';

export interface GroupMember {
  amount: MoneyRange;
  schedule: Schedule;
}

/** Times per month as a ratio (a yearly bill would be 1 over 12); null for a schedule with no fixed beat. */
const getMonthlyFactor = (kind: Schedule['kind']): [number, number] | null => {
  if (kind === 'weekly') return [52, 12];
  if (kind === 'everyOtherWeek') return [26, 12];
  if (kind === 'twiceMonthly') return [2, 1];
  if (kind === 'monthly') return [1, 1];
  return null;
};

/**
 * What a group's bills come to in the month holding `on`: each repeating bill at its
 * monthly average, a one-time bill only when it falls in that month. Low and high ends add up
 * separately and round once, so the total never drifts from the parts.
 */
export function monthlyTotal(
  members: readonly GroupMember[],
  on: number,
): MoneyRange {
  const day = new Date(on);
  const monthStart = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1);
  const nextMonth = Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1);
  const weights = members.map(({ schedule }): [number, number] => {
    if (schedule.kind === 'once') {
      const isDue =
        schedule.anchor !== null &&
        schedule.anchor >= monthStart &&
        schedule.anchor < nextMonth;
      return isDue ? [1, 1] : [0, 1];
    }
    return getMonthlyFactor(schedule.kind) ?? [0, 1];
  });
  const sum = (end: 'lowCents' | 'highCents'): Cents =>
    Math.round(
      members.reduce(
        (total, member, index) =>
          total + (member.amount[end] * weights[index][0]) / weights[index][1],
        0,
      ),
    );
  return { lowCents: sum('lowCents'), highCents: sum('highCents') };
}

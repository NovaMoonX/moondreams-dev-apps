import type { Cents, Ending, MoneyRange, Schedule } from '@apps/runway/types';

export interface GroupMember {
  amount: MoneyRange;
  schedule: Schedule;
  /** The first day the bill is in the plan, so a bill that has not begun by the month counts nothing. */
  startsOn: number;
  ending: Ending;
}

export interface GroupTotal {
  total: MoneyRange;
  /** Bills with no regular beat, which no monthly figure can stand for; they are named, never counted as 0 silently. */
  uncounted: number;
}

/** Times per month as a ratio; null for a schedule with no fixed beat. */
const getMonthlyFactor = (kind: Schedule['kind']): [number, number] | null => {
  if (kind === 'weekly') return [52, 12];
  if (kind === 'everyOtherWeek') return [26, 12];
  if (kind === 'twiceMonthly') return [2, 1];
  if (kind === 'monthly') return [1, 1];
  return null;
};

/**
 * What a group's bills come to in the month holding `on`: each repeating bill at its monthly
 * average, a one-time bill only when it falls in that month, and nothing for a bill that has not
 * begun or has ended by then. Low and high ends add up separately and round once, so the total
 * never drifts from the parts.
 */
export function monthlyTotal(
  members: readonly GroupMember[],
  on: number,
): GroupTotal {
  const day = new Date(on);
  const monthStart = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1);
  const nextMonth = Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1);
  const isLive = ({ startsOn, ending }: GroupMember) =>
    startsOn < nextMonth &&
    (ending.onDate === null || ending.onDate >= monthStart);
  const weights = members.map((member): [number, number] | null => {
    const { schedule } = member;
    if (!isLive(member)) return [0, 1];
    if (schedule.kind === 'once') {
      const isDue =
        schedule.anchor !== null &&
        schedule.anchor >= monthStart &&
        schedule.anchor < nextMonth;
      return isDue ? [1, 1] : [0, 1];
    }
    return getMonthlyFactor(schedule.kind);
  });
  const sum = (end: 'lowCents' | 'highCents'): Cents =>
    Math.round(
      members.reduce((total, member, index) => {
        const weight = weights[index] ?? [0, 1];
        return total + (member.amount[end] * weight[0]) / weight[1];
      }, 0),
    );
  return {
    total: { lowCents: sum('lowCents'), highCents: sum('highCents') },
    uncounted: weights.filter((weight) => weight === null).length,
  };
}

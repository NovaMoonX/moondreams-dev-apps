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
  /** Bills due once, still ahead: a usual month does not include them, so they are named beside the total. */
  oneTime: { count: number; range: MoneyRange; dueOn: number | null };
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
 * What a group's bills come to in a usual month: each repeating bill at its monthly average,
 * nothing for a bill that has not begun or has ended by the month holding `on`. A one-time bill is
 * not part of a usual month; it is reported apart. Low and high ends add up separately and round
 * once, so the total never drifts from the parts.
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
  const isOnce = ({ schedule }: GroupMember) => schedule.kind === 'once';
  const weights = members.map((member): [number, number] | null => {
    if (!isLive(member) || isOnce(member)) return [0, 1];
    return getMonthlyFactor(member.schedule.kind);
  });
  const sum = (end: 'lowCents' | 'highCents'): Cents =>
    Math.round(
      members.reduce((total, member, index) => {
        const weight = weights[index] ?? [0, 1];
        return total + (member.amount[end] * weight[0]) / weight[1];
      }, 0),
    );
  const ahead = members.filter(
    (member) =>
      isOnce(member) &&
      member.schedule.anchor !== null &&
      member.schedule.anchor >= on,
  );
  const sumAhead = (end: 'lowCents' | 'highCents'): Cents =>
    ahead.reduce((total, { amount }) => total + amount[end], 0);
  return {
    total: { lowCents: sum('lowCents'), highCents: sum('highCents') },
    uncounted: weights.filter((weight) => weight === null).length,
    oneTime: {
      count: ahead.length,
      range: {
        lowCents: sumAhead('lowCents'),
        highCents: sumAhead('highCents'),
      },
      dueOn:
        ahead.length === 0
          ? null
          : Math.min(...ahead.map(({ schedule }) => schedule.anchor ?? on)),
    },
  };
}

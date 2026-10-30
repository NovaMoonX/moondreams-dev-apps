import type {
  Cents,
  Ending,
  FundingRule,
  MoneyRange,
  Schedule,
} from '@apps/runway/types';

export interface GroupMember {
  amount: MoneyRange;
  schedule: Schedule;
  /** The first day the bill is in the plan, so a bill that has not begun by the month counts nothing. */
  startsOn: number;
  ending: Ending;
}

export interface GroupEnvelopeMember {
  funding: FundingRule;
  /** The first day the envelope is in the plan. */
  startsOn: number;
}

export interface GroupTotal {
  total: MoneyRange;
  /** Bills and envelopes with no regular beat or no fixed amount, which no monthly figure can stand for; they are named, never counted as 0 silently. */
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

const CALENDAR_FACTORS: Record<string, [number, number]> = {
  weekly: [52, 12],
  every2Weeks: [26, 12],
  twiceMonthly: [2, 1],
  monthly: [1, 1],
  yearly: [1, 12],
};

/** How many income days a usual month holds: each live pay line at its monthly beat, a one-off or irregular line at none. */
export function getIncomeDaysPerMonth(
  lines: readonly Pick<GroupMember, 'schedule' | 'startsOn' | 'ending'>[],
  on: number,
): number {
  const day = new Date(on);
  const monthStart = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1);
  const nextMonth = Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1);
  return lines.reduce((total, { schedule, startsOn, ending }) => {
    const factor = getMonthlyFactor(schedule.kind);
    const isLive =
      startsOn < nextMonth &&
      (ending.onDate === null || ending.onDate >= monthStart);
    return factor && isLive ? total + factor[0] / factor[1] : total;
  }, 0);
}

/** An envelope's fixed amount for a usual month as a ratio; null when its amount or beat is not fixed. */
const getEnvelopeWeight = (
  { funding }: GroupEnvelopeMember,
  incomeDaysPerMonth: number,
): [number, number] | null => {
  if (funding.amount.kind !== 'exact') return null;
  const { cadence } = funding;
  if (cadence.kind === 'calendar')
    return CALENDAR_FACTORS[cadence.period] ?? null;
  if (cadence.kind === 'everyIncomeDay') return [incomeDaysPerMonth, 1];
  if (cadence.kind === 'everyNth') return [incomeDaysPerMonth, cadence.n];
  return null;
};

/**
 * What a group's bills and envelopes come to in a usual month: each repeating bill at its monthly
 * average, each envelope with an exact amount and a regular beat at what it gets in a month
 * (`incomeDaysPerMonth` is how many income days a usual month holds), nothing for a bill that has
 * not begun or has ended by the month holding `on`. A one-time bill is not part of a usual month;
 * it is reported apart. Low and high ends add up separately and round once, so the total never
 * drifts from the parts.
 */
export function monthlyTotal(
  members: readonly GroupMember[],
  on: number,
  envelopes: readonly GroupEnvelopeMember[] = [],
  incomeDaysPerMonth = 0,
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
  const envelopeWeights = envelopes.map((envelope) =>
    envelope.startsOn < nextMonth
      ? getEnvelopeWeight(envelope, incomeDaysPerMonth)
      : [0, 1],
  );
  const envelopeCents = (envelope: GroupEnvelopeMember): Cents =>
    envelope.funding.amount.kind === 'exact'
      ? envelope.funding.amount.cents
      : 0;
  const sum = (end: 'lowCents' | 'highCents'): Cents =>
    Math.round(
      members.reduce((total, member, index) => {
        const weight = weights[index] ?? [0, 1];
        return total + (member.amount[end] * weight[0]) / weight[1];
      }, 0) +
        envelopes.reduce((total, envelope, index) => {
          const weight = envelopeWeights[index] ?? [0, 1];
          return total + (envelopeCents(envelope) * weight[0]) / weight[1];
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
    uncounted:
      weights.filter((weight) => weight === null).length +
      envelopeWeights.filter((weight) => weight === null).length,
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

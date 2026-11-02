import { formatCents } from '@/utils/moneyUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import {
  GROUP_WORDS,
  PRIORITY_LABELS,
  SCHEDULE_LABELS,
} from '@apps/runway/constants';
import { describeBillTiming } from '@apps/runway/utils/billText';
import { getExtras } from '@apps/runway/engine/parts';
import { describeFunding } from '@apps/runway/utils/fundingText';
import { formatRange } from '@apps/runway/utils/rangeText';
import type {
  BillSealed,
  EnvelopeSealed,
  GoalSealed,
  GroupSealed,
  PayLineSealed,
  SourceSealed,
} from '@apps/runway/types';

export type ItemPayload =
  | SourceSealed
  | PayLineSealed
  | EnvelopeSealed
  | BillSealed
  | GoalSealed
  | GroupSealed;

/** The name of a group by its id, from the plan's groups. */
export type GroupNamer = (groupId: string) => string;

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

type Part = [label: string, before: string, after: string] | null;

const diff = <T>(
  label: string,
  before: T,
  after: T,
  show: (value: T) => string,
): Part => (same(before, after) ? null : [label, show(before), show(after)]);

const pairingCount = (list: readonly unknown[]) =>
  list.length === 1 ? '1 funded' : `${list.length} funded`;

const getParts = (
  before: ItemPayload,
  after: ItemPayload,
  cardNameOf: (cardId: string | null) => string,
  groupName: GroupNamer,
): Part[] => {
  const base: Part[] = [
    diff('Name', before.name, after.name, (value) => value),
  ];
  if ('startingPriority' in before && 'startingPriority' in after) {
    return [
      ...base,
      diff(
        'Starting priority',
        before.startingPriority,
        after.startingPriority,
        (value) => (value === null ? 'None' : PRIORITY_LABELS[value]),
      ),
      diff(
        'Emoji',
        before.emoji ?? null,
        after.emoji ?? null,
        (value) => value ?? 'none',
      ),
    ];
  }
  if (
    !('schedule' in before) &&
    !('timing' in before) &&
    !('funding' in before)
  ) {
    const sourceBefore = before as SourceSealed;
    const sourceAfter = after as SourceSealed;
    return [
      ...base,
      diff(
        'Paid first',
        sourceBefore.pairings ?? [],
        sourceAfter.pairings ?? [],
        pairingCount,
      ),
    ];
  }
  if ('schedule' in before && 'schedule' in after) {
    const lineBefore = before as PayLineSealed;
    const lineAfter = after as PayLineSealed;
    return [
      ...base,
      diff('Amount', lineBefore.amount, lineAfter.amount, formatRange),
      diff('Repeats', lineBefore.schedule, lineAfter.schedule, (value) =>
        value.anchor === null
          ? SCHEDULE_LABELS[value.kind]
          : `${SCHEDULE_LABELS[value.kind]} from ${formatDateUTC(value.anchor)}`,
      ),
      diff('Ends', lineBefore.ending, lineAfter.ending, (value) =>
        value.onDate !== null
          ? formatDateUTC(value.onDate)
          : value.afterCount !== null
            ? `after ${value.afterCount}`
            : 'never',
      ),
      diff(
        'Range',
        lineBefore.stanceOverride ?? null,
        lineAfter.stanceOverride ?? null,
        (value) => value ?? 'follows the plan',
      ),
      diff(
        'Paid first',
        lineBefore.pairings ?? [],
        lineAfter.pairings ?? [],
        pairingCount,
      ),
    ];
  }
  if ('timing' in before && 'timing' in after) {
    const billBefore = before as BillSealed;
    const billAfter = after as BillSealed;
    return [
      ...base,
      diff('Amount', billBefore.amount, billAfter.amount, formatRange),
      diff(
        'Matters',
        billBefore.priority,
        billAfter.priority,
        (value) => PRIORITY_LABELS[value],
      ),
      diff(
        'Due',
        billBefore.timing.schedule,
        billAfter.timing.schedule,
        describeBillTiming,
      ),
      diff('Ends', billBefore.ending, billAfter.ending, (value) =>
        value.onDate !== null
          ? formatDateUTC(value.onDate)
          : value.afterCount !== null
            ? `after ${value.afterCount}`
            : 'never',
      ),
      diff(
        'Range',
        billBefore.stanceOverride ?? null,
        billAfter.stanceOverride ?? null,
        (value) => value ?? 'follows the plan',
      ),
      diff('Funded from', billBefore.fundedBy, billAfter.fundedBy, (value) =>
        value.kind === 'chosen'
          ? `${value.dayKeys.length} chosen days`
          : 'the days before',
      ),
      diff(
        'Paid by',
        billBefore.paidByCardId ?? null,
        billAfter.paidByCardId ?? null,
        cardNameOf,
      ),
      diff(
        'Emoji',
        billBefore.emoji,
        billAfter.emoji,
        (value) => value ?? 'none',
      ),
      diff(
        GROUP_WORDS.changeLabel,
        billBefore.groupId ?? null,
        billAfter.groupId ?? null,
        (value) => (value === null ? GROUP_WORDS.none : groupName(value)),
      ),
    ];
  }
  if ('funding' in before && 'funding' in after) {
    const goalBefore = before as GoalSealed;
    const goalAfter = after as GoalSealed;
    return [
      ...base,
      diff(
        'Matters',
        goalBefore.priority,
        goalAfter.priority,
        (value) => PRIORITY_LABELS[value],
      ),
      diff(
        'Funding',
        { funding: goalBefore.funding, extras: getExtras(goalBefore) },
        { funding: goalAfter.funding, extras: getExtras(goalAfter) },
        (value) => describeFunding(value.funding, value.extras),
      ),
      ...(!('targetCents' in goalBefore) && !('targetCents' in goalAfter)
        ? [
            diff(
              GROUP_WORDS.changeLabel,
              (goalBefore as EnvelopeSealed).groupId ?? null,
              (goalAfter as EnvelopeSealed).groupId ?? null,
              (value) => (value === null ? GROUP_WORDS.none : groupName(value)),
            ),
          ]
        : []),
      ...(!('targetCents' in goalBefore) && !('targetCents' in goalAfter)
        ? [
            diff(
              'Stops at',
              (goalBefore as EnvelopeSealed).maxCents ?? null,
              (goalAfter as EnvelopeSealed).maxCents ?? null,
              (value) => (value === null ? 'no limit' : formatCents(value)),
            ),
          ]
        : []),
      ...('targetCents' in goalBefore && 'targetCents' in goalAfter
        ? [
            diff(
              'Target',
              goalBefore.targetCents,
              goalAfter.targetCents,
              formatCents,
            ),
            diff('By', goalBefore.targetDate, goalAfter.targetDate, (value) =>
              value === null ? 'no date' : formatDateUTC(value),
            ),
          ]
        : []),
      diff(
        'Emoji',
        goalBefore.emoji,
        goalAfter.emoji,
        (value) => value ?? 'none',
      ),
    ];
  }
  return base;
};

/** True when two payloads say the same thing. */
export const isSamePayload = (a: ItemPayload, b: ItemPayload) => same(a, b);

/** What differs, from and to: "Amount $1,250.00 to $1,300.00; Name Rent to Home rent". */
export function describeChange(
  before: ItemPayload,
  after: ItemPayload,
  cardNameOf: (cardId: string | null) => string,
  groupName: GroupNamer = () => 'a group',
) {
  const result = getParts(before, after, cardNameOf, groupName)
    .flatMap((part) => (part === null ? [] : [part]))
    .map(([label, from, to]) => `${label} ${from} to ${to}`)
    .join('; ');
  return result;
}

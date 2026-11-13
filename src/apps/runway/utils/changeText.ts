import { DAY_MS } from '@apps/runway/engine/dates';
import { getChangedKeys, isSameValue } from '@apps/runway/engine/resolve';
import { formatCents } from '@/utils/moneyUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import {
  ACCOUNT_WORDS,
  AUTO_PAY_WORDS,
  COST_PAID_WORDS,
  FORM_FLOW_WORDS,
  GROUP_WORDS,
  HORIZON_WORDS,
  HOW_OFTEN_WORDS,
  MAKE_BILL_WORDS,
  BILL_PAY_WORDS,
  PAID_FROM_WORDS,
  PRIORITY_LABELS,
  SCHEDULE_LABELS,
} from '@apps/runway/constants';
import {
  describeBillTiming,
  describePayOnDay,
} from '@apps/runway/utils/billText';
import { getExtras } from '@apps/runway/engine/parts';
import { isSavingFor } from '@apps/runway/engine/pace';
import { describeFunding } from '@apps/runway/utils/fundingText';
import {
  describeCostWhen,
  formatDateRangeOrdinalUTC,
} from '@apps/runway/utils/horizonText';
import { formatRange } from '@apps/runway/utils/rangeText';
import type {
  BillSealed,
  CostPaidMark,
  EnvelopeSealed,
  HorizonSealed,
  GoalSealed,
  GroupSealed,
  HorizonCost,
  MoneyRange,
  PayLineSealed,
  SourceSealed,
} from '@apps/runway/types';

/** Names a pay a bill is set to come from, when the plan is at hand. */
export type PayNamer = (
  fundedBy: Extract<BillSealed['fundedBy'], { kind: 'pay' }>,
) => string;

const describeFundedByChange = (
  value: BillSealed['fundedBy'],
  payNameOf: PayNamer | undefined,
) => {
  if (value.kind === 'chosen') return `${value.dayKeys.length} chosen days`;
  if (value.kind === 'lastBefore') return PAID_FROM_WORDS.logLastBefore;
  if (value.kind === 'pay') {
    if (payNameOf) return payNameOf(value);
    return value.monthDay === null
      ? 'one pay you picked'
      : `the pay on ${value.monthDay === 31 ? 'the last day' : `day ${value.monthDay}`}`;
  }
  return PAID_FROM_WORDS.logSpread;
};

export type ItemPayload =
  | SourceSealed
  | PayLineSealed
  | EnvelopeSealed
  | BillSealed
  | GoalSealed
  | GroupSealed
  | HorizonSealed;

/** The name of a group by its id, from the plan's groups. */
export type GroupNamer = (groupId: string) => string;
export type AccountNamer = (accountId: string | null) => string;

const describeAccountId: AccountNamer = (accountId) =>
  accountId === null ? ACCOUNT_WORDS.payFromNone : 'another account';

const same = isSameValue;

/** A label with its before and after, or a whole phrase when the change does not read "label from to". */
type Part = [label: string, before: string, after: string] | string | null;

const diff = <T>(
  label: string,
  before: T,
  after: T,
  show: (value: T) => string,
): Part => (same(before, after) ? null : [label, show(before), show(after)]);

const describeMaxMove = (before: number | null, after: number | null): Part =>
  before === after
    ? null
    : after === null
      ? 'No longer stops filling'
      : before === null
        ? `Stops filling at ${formatCents(after)}`
        : ['Stops filling at', formatCents(before), formatCents(after)];

const pairingCount = (list: readonly unknown[]) =>
  list.length === 1 ? '1 funded' : `${list.length} funded`;

const describeHorizonRest = (value: HorizonSealed['rest']) =>
  value.kind === 'pays'
    ? value.startsOn === null
      ? 'my pays before each cost'
      : `my pays from ${formatDateOrdinalUTC(value.startsOn)}`
    : value.kind === 'onePay'
      ? 'one pay you picked'
      : value.kind === 'outside'
        ? 'outside the plan'
        : "I'll decide later";

/** "$600.00–$800.00" for a range, so "to" in a change line is only the change. */
const formatRangeDash = (range: MoneyRange) =>
  range.lowCents === range.highCents
    ? formatCents(range.lowCents)
    : `${formatCents(range.lowCents)}–${formatCents(range.highCents)}`;

const describeAmountMove = (cost: HorizonCost, old: MoneyRange): Part =>
  same(old, cost.amount)
    ? null
    : HORIZON_WORDS.changeFromTo(
        cost.name,
        formatRangeDash(old),
        formatRangeDash(cost.amount),
      );

const describeTimingMove = (cost: HorizonCost, old: HorizonCost): Part => {
  if (
    same(
      { schedule: old.schedule, ending: old.ending },
      { schedule: cost.schedule, ending: cost.ending },
    )
  ) {
    return null;
  }
  const from = describeCostWhen(old.schedule, old.ending);
  const to = describeCostWhen(cost.schedule, cost.ending);
  return old.schedule.kind === 'once' && cost.schedule.kind === 'once'
    ? HORIZON_WORDS.changeMoved(cost.name, from, to)
    : HORIZON_WORDS.changeFromTo(cost.name, from, to);
};

/** What changed in an event: its own fields, then each cost it still has (a priced cost is named, its figures from and to). */
const getHorizonParts = (
  before: HorizonSealed,
  after: HorizonSealed,
): Part[] => [
  diff('Name', before.name, after.name, (value) => value),
  diff(
    'Emoji',
    before.emoji ?? null,
    after.emoji ?? null,
    (value) => value ?? 'none',
  ),
  diff(
    'Matters',
    before.priority,
    after.priority,
    (value) => PRIORITY_LABELS[value],
  ),
  diff(
    'Date',
    { from: before.happensOn, until: before.happensUntil },
    { from: after.happensOn, until: after.happensUntil },
    ({ from, until }) =>
      until === null
        ? formatDateOrdinalUTC(from)
        : formatDateRangeOrdinalUTC(from, until),
  ),
  diff('The rest', before.rest, after.rest, describeHorizonRest),
  ...after.costs
    .filter((cost) => !before.costs.some(({ id }) => id === cost.id))
    .map((cost): Part =>
      HORIZON_WORDS.changeAdded(
        cost.name,
        formatRangeDash(cost.amount),
        describeCostWhen(cost.schedule, cost.ending),
      ),
    ),
  ...before.costs
    .filter((cost) => !after.costs.some(({ id }) => id === cost.id))
    .map((cost): Part => HORIZON_WORDS.changeRemoved(cost.name)),
  ...after.costs.flatMap((cost): Part[] => {
    const old = before.costs.find(({ id }) => id === cost.id);
    if (!old) return [];
    return [
      diff('Cost name', old.name, cost.name, (value) => value),
      describeAmountMove(cost, old.amount),
      describeTimingMove(cost, old),
      diff(`${cost.name} paid`, old.isOutside, cost.isOutside, (value) =>
        value ? 'outside the plan' : 'like the rest',
      ),
      diff(`${cost.name} priority`, old.priority, cost.priority, (value) =>
        value === null ? 'like the event' : PRIORITY_LABELS[value],
      ),
    ];
  }),
];

const getParts = (
  before: ItemPayload,
  after: ItemPayload,
  cardNameOf: (cardId: string | null) => string,
  groupName: GroupNamer,
  payNameOf?: PayNamer,
  accountNameOf: AccountNamer = describeAccountId,
): Part[] => {
  if ('costs' in before && 'costs' in after) {
    return getHorizonParts(before, after);
  }
  const base: Part[] = [
    diff('Name', before.name, after.name, (value) => value),
  ];
  if ('startingPriority' in before && 'startingPriority' in after) {
    return [
      ...base,
      diff(
        'Bill priority',
        before.startingPriority,
        after.startingPriority,
        (value) => (value === null ? 'None' : PRIORITY_LABELS[value]),
      ),
      diff(
        'Envelope priority',
        before.envelopePriority ?? before.startingPriority,
        after.envelopePriority ?? after.startingPriority,
        (value) => (value === null ? 'None' : PRIORITY_LABELS[value]),
      ),
      diff(
        'Goal priority',
        before.goalPriority ?? null,
        after.goalPriority ?? null,
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
          : `${SCHEDULE_LABELS[value.kind]} from ${formatDateOrdinalUTC(value.anchor)}`,
      ),
      diff('Ends', lineBefore.ending, lineAfter.ending, (value) =>
        value.onDate !== null
          ? formatDateOrdinalUTC(value.onDate)
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
        ACCOUNT_WORDS.landsInLabel,
        lineBefore.accountId ?? null,
        lineAfter.accountId ?? null,
        accountNameOf,
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
      diff(
        FORM_FLOW_WORDS.payOn,
        billBefore.payOnDay ?? null,
        billAfter.payOnDay ?? null,
        (value) => describePayOnDay(value).toLowerCase(),
      ),
      diff('Ends', billBefore.ending, billAfter.ending, (value) =>
        value.onDate !== null
          ? formatDateOrdinalUTC(value.onDate)
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
      diff(
        PAID_FROM_WORDS.label,
        billBefore.fundedBy,
        billAfter.fundedBy,
        (value) => describeFundedByChange(value, payNameOf),
      ),
      diff(
        BILL_PAY_WORDS.label,
        billBefore.paidByCardId ?? null,
        billAfter.paidByCardId ?? null,
        cardNameOf,
      ),
      diff(
        ACCOUNT_WORDS.payFromLabel,
        billBefore.accountId ?? null,
        billAfter.accountId ?? null,
        accountNameOf,
      ),
      diff(
        AUTO_PAY_WORDS.changeLabel,
        billBefore.paysItself === true,
        billAfter.paysItself === true,
        (value) => (value ? 'on' : 'off'),
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
        (value) =>
          value.funding.cadence.kind === 'none'
            ? HOW_OFTEN_WORDS.idleInChange
            : describeFunding(value.funding, value.extras),
      ),
      diff(
        GROUP_WORDS.changeLabel,
        (goalBefore as EnvelopeSealed | GoalSealed).groupId ?? null,
        (goalAfter as EnvelopeSealed | GoalSealed).groupId ?? null,
        (value) => (value === null ? GROUP_WORDS.none : groupName(value)),
      ),
      ...(!('targetCents' in goalBefore) && !('targetCents' in goalAfter)
        ? [
            describeMaxMove(
              (goalBefore as EnvelopeSealed).maxCents ?? null,
              (goalAfter as EnvelopeSealed).maxCents ?? null,
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
              value === null ? 'no date' : formatDateOrdinalUTC(value),
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

const MONEYLESS_KEYS = [
  'name',
  'emoji',
  'groupId',
  'paidByCardId',
  'accountId',
  'paysItself',
  'spillTo',
];

/** A goal or envelope nothing goes into: paused, not being saved for yet, or with nothing set to go in. */
export const isIdleItem = (payload: ItemPayload | null | undefined) => {
  if (!payload || !('funding' in payload)) return false;
  if ('targetCents' in payload) return !isSavingFor(payload);
  return payload.funding.cadence.kind === 'none';
};

/** A change to only a name, emoji, group, card or account: it moves no money on any income day. */
export const isMoneylessChange = (before: ItemPayload, after: ItemPayload) => {
  const changed = getChangedKeys(before, after) as string[];
  return (
    changed.length > 0 && changed.every((key) => MONEYLESS_KEYS.includes(key))
  );
};

/** True when two payloads say the same thing. */
export const isSamePayload = (a: ItemPayload, b: ItemPayload) => same(a, b);

/** What differs, from and to: "Amount $1,250.00 to $1,300.00; Name Rent to Home rent". */
export function describeChange(
  before: ItemPayload,
  after: ItemPayload,
  cardNameOf: (cardId: string | null) => string,
  groupName: GroupNamer = () => 'a group',
  payNameOf?: PayNamer,
  accountNameOf: AccountNamer = describeAccountId,
) {
  const result = getParts(
    before,
    after,
    cardNameOf,
    groupName,
    payNameOf,
    accountNameOf,
  )
    .flatMap((part) => (part === null ? [] : [part]))
    .map((part) =>
      typeof part === 'string' ? part : `${part[0]} ${part[1]} to ${part[2]}`,
    )
    .join('; ');
  return result;
}

/** What an edit from a day on replaces: "This replaces your change from Jan 1, 2027 (Amount $1,250.00 to $1,300.00)."; null when it replaces nothing. */
export function describeReplaced(
  replaced: readonly {
    effectiveFrom: number;
    effectiveUntil: number | null;
    before: ItemPayload;
    after: ItemPayload;
    isReturn?: boolean;
  }[],
  cardNameOf: (cardId: string | null) => string,
) {
  const [first] = replaced;
  if (!first) return null;
  const more = replaced.length - 1;
  if (first.isReturn)
    return `This replaces going back to what it was on ${formatDateOrdinalUTC(first.effectiveFrom)}${more > 0 ? ` and ${more} more change${more === 1 ? '' : 's'}` : ''}.`;
  const result = `This replaces your change from ${formatDateOrdinalUTC(first.effectiveFrom)}${first.effectiveUntil === null ? '' : ` through ${formatDateOrdinalUTC(first.effectiveUntil - DAY_MS)}`} (${describeChange(first.before, first.after, cardNameOf)})${more > 0 ? ` and ${more} more` : ''}.`;
  return result;
}

/** The change-log line for a cost made a bill, with the money that went along or to Free to Spend: "Moving: Storage unit became a bill, $100.00. Monthly from Feb 1st. Brought $200.00 from Moving." */
export const describeCostMadeBill = (
  item: string,
  cost: string,
  bill: BillSealed,
  broughtCents: number,
  freeCents: number,
) =>
  [
    MAKE_BILL_WORDS.summary(
      item,
      cost,
      formatRange(bill.amount),
      describeBillTiming(bill.timing.schedule),
    ),
    broughtCents > 0
      ? MAKE_BILL_WORDS.summaryBrought(formatCents(broughtCents), item)
      : null,
    freeCents > 0
      ? MAKE_BILL_WORDS.summaryFree(formatCents(freeCents), item)
      : null,
  ]
    .filter(Boolean)
    .join(' ');

/** The change-log line for a cost's payment marked paid: "Marked Movers paid on Moving: $600.00 due Jan 15th." */
export const describeCostPaid = (
  cost: string,
  item: string,
  dueOn: number,
  amountCents: number,
  mark: CostPaidMark,
) =>
  (mark === 'outside'
    ? COST_PAID_WORDS.outsideSummary
    : COST_PAID_WORDS.summary)(
    cost,
    item,
    formatDateOrdinalUTC(dueOn),
    formatCents(amountCents),
  );

/** Where a taken-back payment's money returns, one part for each place that gets any ("Moving gets $50.00 back and $470.00 goes back to Free to Spend"); a payment made by a purchase adds that the purchase is removed. Null when nothing moves. */
export const describeCostGivesBack = (
  item: string,
  amountCents: number,
  fromFreeCents: number,
  mark: CostPaidMark,
  fromGoal: { name: string; cents: number } | null = null,
) => {
  const goal = mark === 'outside' || fromGoal === null ? 0 : fromGoal.cents;
  const fromItem = mark === 'outside' ? 0 : amountCents - fromFreeCents - goal;
  const free = mark === 'outside' ? 0 : fromFreeCents;
  const parts = [
    goal > 0 &&
      fromGoal !== null &&
      COST_PAID_WORDS.givesBackGoal(fromGoal.name, formatCents(goal)),
    fromItem > 0 && COST_PAID_WORDS.givesBackItem(item, formatCents(fromItem)),
    free > 0 && COST_PAID_WORDS.givesBackFree(formatCents(free)),
    mark === 'purchase' && COST_PAID_WORDS.purchaseRemoved,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.length > 2
    ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
    : parts.join(' and ');
};

/** The sentence that says what taking a cost's payment back restores, for the toast and the log. */
export const describeCostTakenBack = (
  cost: string,
  item: string,
  dueOn: number,
  amountCents: number,
  fromFreeCents: number,
  mark: CostPaidMark,
  fromGoal: { name: string; cents: number } | null = null,
) =>
  COST_PAID_WORDS.undoText(
    cost,
    item,
    formatDateOrdinalUTC(dueOn),
    describeCostGivesBack(item, amountCents, fromFreeCents, mark, fromGoal),
  );

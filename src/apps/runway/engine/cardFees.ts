import type {
  BillSealed,
  CardAnnualFee,
  Cents,
  DateOnly,
  Priority,
  Schedule,
} from '@apps/runway/types';

import { addUtcDays } from './dates';
import { occurrences } from './schedule';

/** The one group every card's annual fee bill joins; its id is fixed so every device writes the same group. */
export const CARD_FEE_GROUP_ID = 'group_cardFees';

export const isCardFeeGroup = (groupId: string | null | undefined) =>
  groupId === CARD_FEE_GROUP_ID;

/** Whether a bill follows a card's annual fee, so only the card changes its name, amount, date, group and card. */
export const isCardFeeBill = (bill: Pick<BillSealed, 'cardFeeOf'>) =>
  (bill.cardFeeOf ?? null) !== null;

export const getFeeSchedule = (firstDueOn: DateOnly): Schedule => ({
  kind: 'everyMonths',
  anchor: firstDueOn,
  monthDays: [],
  intervalMonths: 12,
});

/** The fee's next date, today included. */
export function getNextFeeOn(firstDueOn: DateOnly, today: DateOnly): DateOnly {
  const [next] = occurrences(
    getFeeSchedule(firstDueOn),
    { onDate: null, afterCount: null },
    today,
    addUtcDays(today, 366),
  );
  return next ?? firstDueOn;
}

export interface FeeBillInput {
  cardId: string;
  name: string;
  cents: Cents;
  firstDueOn: DateOnly;
  priority: Priority;
  orderIndex: number;
}

/** A new fee bill: yearly on its date, saved up across the pays, charged to its card on its own. */
export const buildFeeBill = (input: FeeBillInput): BillSealed => ({
  name: input.name,
  emoji: null,
  priority: input.priority,
  orderIndex: input.orderIndex,
  amount: { lowCents: input.cents, highCents: input.cents },
  timing: { kind: 'date', schedule: getFeeSchedule(input.firstDueOn) },
  ending: { onDate: null, afterCount: null },
  fundedBy: { kind: 'suggested' },
  stanceOverride: null,
  groupId: CARD_FEE_GROUP_ID,
  paidByCardId: input.cardId,
  accountId: null,
  paysItself: true,
  cardFeeOf: input.cardId,
});

/** The card's fields a fee bill takes; a later version keeps every other field it has. */
export const getFeeFields = (
  cardId: string,
  name: string,
  fee: Pick<CardAnnualFee, 'cents' | 'firstDueOn'>,
): Pick<
  BillSealed,
  'name' | 'amount' | 'timing' | 'groupId' | 'paidByCardId' | 'cardFeeOf'
> => ({
  name,
  amount: { lowCents: fee.cents, highCents: fee.cents },
  timing: { kind: 'date', schedule: getFeeSchedule(fee.firstDueOn) },
  groupId: CARD_FEE_GROUP_ID,
  paidByCardId: cardId,
  cardFeeOf: cardId,
});

export type FeeStep = 'none' | 'create' | 'change' | 'end';

/**
 * What a card save does to its fee bill: adds one for a new fee (or a fee whose bill is gone), changes
 * it when the card's name, fee or date moved, ends it when the fee is cleared or the card archived.
 */
export function getFeeStep(input: {
  before: CardAnnualFee | null;
  after: Pick<CardAnnualFee, 'cents' | 'firstDueOn'> | null;
  isBillLive: boolean;
  /** The bill's name, amount and date as they read today, against what the card now says. */
  isBillCurrent: boolean;
}): FeeStep {
  const { before, after, isBillLive, isBillCurrent } = input;
  if (after === null) return before !== null && isBillLive ? 'end' : 'none';
  if (before === null || !isBillLive) return 'create';
  return isBillCurrent ? 'none' : 'change';
}

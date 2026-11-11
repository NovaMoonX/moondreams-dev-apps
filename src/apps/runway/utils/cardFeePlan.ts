import type { RootState } from '@/store';
import { generateUuid } from '@/utils/idUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { CARD_FEE_WORDS } from '@apps/runway/constants';
import {
  CARD_FEE_GROUP_ID,
  buildFeeBill,
  getFeeFields,
  getFeeStep,
  getNextFeeOn,
} from '@apps/runway/engine/cardFees';
import type { HeldChoice } from '@apps/runway/engine/endings';
import { getNextTierRank } from '@apps/runway/engine/priorities';
import {
  applyFieldChanges,
  getVersionStretches,
  isSameValue,
  resolveCurrentOrNext,
} from '@apps/runway/engine/resolve';
import type { FeePlan } from '@apps/runway/store/actions/cardFeeActions';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  BillSealed,
  BillVersion,
  CardAnnualFee,
  Cents,
  DateOnly,
  GroupVersion,
} from '@apps/runway/types';

export interface FeePlanInput {
  cardId: string;
  /** The card's name as the lists show it, which the bill is named after. */
  cardName: string;
  before: CardAnnualFee | null;
  /** What the card says after the save; null when it has no fee or is archived. */
  after: { cents: Cents; firstDueOn: DateOnly } | null;
  heldChoice: HeldChoice | null;
  today: DateOnly;
}

export type FeePlanResult =
  | { kind: 'ready'; plan: FeePlan | null; annualFee: CardAnnualFee | null }
  | { kind: 'loading' };

/** Whether the fee bill is still in the plan today; an ended or archived one is replaced by a new bill. */
export const isFeeBillLive = (
  state: RootState,
  billId: string,
  today: DateOnly,
) => {
  const header = state.runway.items.find((item) => item.id === billId);
  return (
    header !== undefined &&
    header.archivedAt === null &&
    (header.endedAt === null || header.endedAt >= today)
  );
};

/** What the money set aside for a card's fee bill is, or 0 when it has none. */
export const getFeeHeldCents = (
  assignedByItem: Record<string, number>,
  fee: CardAnnualFee | null | undefined,
) => (fee ? Math.max(0, assignedByItem[fee.billId] ?? 0) : 0);

/**
 * Works a card save's fee into the write that keeps its bill in step: a new bill (and the group, the
 * first time), a version per stretch from today carrying only the card's fields, or the bill's end.
 */
export function getFeePlan(
  state: RootState,
  input: FeePlanInput,
): FeePlanResult {
  const { runway } = state;
  if (!runway.isItemsLoaded || !runway.isVersionsLoaded)
    return { kind: 'loading' };
  const { before, after, today } = input;
  const billName = CARD_FEE_WORDS.billName(input.cardName);
  const billVersions = runway.versions.filter(
    (version): version is BillVersion => version.kind === 'bill',
  );
  const isBillLive =
    before !== null && isFeeBillLive(state, before.billId, today);
  const stretches =
    before === null || !isBillLive
      ? []
      : getVersionStretches<BillVersion, BillSealed>(
          billVersions,
          before.billId,
          today,
        );
  const current = stretches[0]?.payload ?? null;
  const fields =
    after === null ? null : getFeeFields(input.cardId, billName, after);
  const isBillCurrent =
    current !== null &&
    fields !== null &&
    stretches.every(
      ({ payload }) =>
        payload.name === fields.name &&
        isSameValue(payload.amount, fields.amount) &&
        isSameValue(payload.timing, fields.timing),
    );
  const step = getFeeStep({
    before,
    after,
    isBillLive: isBillLive && current !== null,
    isBillCurrent,
  });

  if (step === 'none') {
    const annualFee =
      after === null || before === null
        ? null
        : { ...after, billId: before.billId };
    return { kind: 'ready', plan: null, annualFee };
  }
  if (step === 'end' && before !== null) {
    return {
      kind: 'ready',
      annualFee: null,
      plan: {
        kind: 'end',
        billId: before.billId,
        endedOn: today,
        heldChoice: input.heldChoice,
        summary: CARD_FEE_WORDS.billEnded(current?.name ?? billName),
      },
    };
  }
  if (after === null) return { kind: 'ready', plan: null, annualFee: null };

  if (step === 'create') {
    const group = resolveCurrentOrNext(
      runway.versions.filter(
        (version): version is GroupVersion => version.kind === 'group',
      ),
      CARD_FEE_GROUP_ID,
      today,
    );
    const priority = group?.payload.startingPriority ?? 'should';
    const billId = generateUuid();
    const bill = buildFeeBill({
      cardId: input.cardId,
      name: billName,
      cents: after.cents,
      firstDueOn: after.firstDueOn,
      priority,
      orderIndex: getNextTierRank(
        [
          ...selectBills(state, today),
          ...selectEnvelopes(state, today),
          ...selectGoals(state, today),
        ],
        priority,
      ),
    });
    return {
      kind: 'ready',
      annualFee: { ...after, billId },
      plan: {
        kind: 'create',
        billId,
        bill,
        startDate: today,
        group: {
          name: CARD_FEE_WORDS.groupName,
          startingPriority: null,
          envelopePriority: null,
          goalPriority: null,
          emoji: null,
        },
        groupSummary: CARD_FEE_WORDS.groupStarted,
        summary: CARD_FEE_WORDS.billAdded(
          billName,
          formatCents(after.cents),
          formatDateOrdinalUTC(getNextFeeOn(after.firstDueOn, today)),
        ),
      },
    };
  }

  if (before === null || current === null || fields === null)
    return { kind: 'ready', plan: null, annualFee: null };
  const candidate: BillSealed = { ...current, ...fields };
  const isMoneyMoved =
    !isSameValue(current.amount, fields.amount) ||
    !isSameValue(current.timing, fields.timing);
  const parts = [
    current.name === billName
      ? null
      : CARD_FEE_WORDS.billRenamed(current.name, billName),
    isSameValue(current.amount, fields.amount)
      ? null
      : CARD_FEE_WORDS.billChanged(
          billName,
          CARD_FEE_WORDS.billAmount(
            formatCents(current.amount.highCents),
            formatCents(after.cents),
          ),
          formatDateOrdinalUTC(today),
        ),
    current.timing.schedule.anchor === after.firstDueOn
      ? null
      : CARD_FEE_WORDS.billChanged(
          billName,
          CARD_FEE_WORDS.billDate(
            current.timing.schedule.anchor === null
              ? CARD_FEE_WORDS.changeNoFee
              : formatDateOrdinalUTC(current.timing.schedule.anchor),
            formatDateOrdinalUTC(after.firstDueOn),
          ),
          formatDateOrdinalUTC(today),
        ),
  ].filter((part) => part !== null);
  return {
    kind: 'ready',
    annualFee: { ...after, billId: before.billId },
    plan: {
      kind: 'change',
      billId: before.billId,
      stretches: applyFieldChanges(stretches, current, candidate),
      effectiveFrom: isMoneyMoved ? today : null,
      summary: parts.join(' '),
    },
  };
}

import { getVersionStretches } from '@apps/runway/engine/resolve';
import { changeItem } from '@apps/runway/store/actions/itemActions';
import type {
  BillSealed,
  BillVersion,
  MoneyRange,
  RunwayEncryption,
} from '@apps/runway/types';

/** A bill's amount is not what the action being taken back set it to. */
export class BillAmountChanged extends Error {
  constructor() {
    super('The amount was changed again since, so nothing was taken back.');
  }
}

/** Each stretch's amount before a write, by the day the stretch starts. */
export type BillAmountBefore = { effectiveFrom: number; amount: MoneyRange }[];

const getStretches = (
  versions: readonly BillVersion[],
  billId: string,
  today: number,
) => getVersionStretches<BillVersion, BillSealed>(versions, billId, today);

const holds = (payload: BillSealed, amount: MoneyRange) =>
  payload.amount.lowCents === amount.lowCents &&
  payload.amount.highCents === amount.highCents;

/** Sets a bill's amount from today on, in every stretch it already has, so a later version and its end are kept. Returns each stretch's amount before, or null when every stretch already holds it and nothing was written. */
export async function writeBillAmount(
  uid: string,
  encryption: RunwayEncryption,
  input: {
    billId: string;
    versions: readonly BillVersion[];
    today: number;
    amount: MoneyRange;
    summary: string;
  },
): Promise<BillAmountBefore | null> {
  const stretches = getStretches(input.versions, input.billId, input.today);
  if (
    stretches.length === 0 ||
    stretches.every((stretch) => holds(stretch.payload, input.amount))
  ) {
    return null;
  }
  const set = (payload: BillSealed): BillSealed => ({
    ...payload,
    amount: { ...input.amount },
  });
  await changeItem(uid, encryption, {
    itemId: input.billId,
    kind: 'bill',
    payload: set(stretches[0].payload),
    summary: input.summary,
    note: null,
    effectiveFrom: input.today,
    stretches: stretches.map((stretch) => ({
      ...stretch,
      payload: set(stretch.payload),
    })),
  });
  return stretches.map((stretch) => ({
    effectiveFrom: stretch.effectiveFrom,
    amount: stretch.payload.amount,
  }));
}

/** Takes back an amount this action wrote, restoring each stretch's own earlier amount (a stretch that did not exist then takes the nearest earlier one); refuses when any stretch was changed again since. */
export async function revertBillAmount(
  uid: string,
  encryption: RunwayEncryption,
  input: {
    billId: string;
    versions: readonly BillVersion[];
    today: number;
    wrote: MoneyRange;
    back: BillAmountBefore;
    summary: string;
  },
): Promise<void> {
  const stretches = getStretches(input.versions, input.billId, input.today);
  if (
    stretches.length === 0 ||
    input.back.length === 0 ||
    stretches.some((stretch) => !holds(stretch.payload, input.wrote))
  ) {
    throw new BillAmountChanged();
  }
  const backFor = (from: number): MoneyRange =>
    (
      [...input.back]
        .filter((entry) => entry.effectiveFrom <= from)
        .sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0] ?? input.back[0]
    ).amount;
  const restored = stretches.map((stretch) => ({
    ...stretch,
    payload: { ...stretch.payload, amount: backFor(stretch.effectiveFrom) },
  }));
  await changeItem(uid, encryption, {
    itemId: input.billId,
    kind: 'bill',
    payload: restored[0].payload,
    summary: input.summary,
    note: null,
    effectiveFrom: input.today,
    stretches: restored,
  });
}

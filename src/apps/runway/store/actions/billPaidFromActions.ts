import { withFundedBy } from '@apps/runway/engine/billShare';
import { getVersionStretches } from '@apps/runway/engine/resolve';
import { changeItem } from '@apps/runway/store/actions/itemActions';
import type {
  BillFundedBy,
  BillSealed,
  BillVersion,
  RunwayEncryption,
} from '@apps/runway/types';

/** A bill's Paid from is not what the action being taken back set it to. */
export class FundedByChanged extends Error {
  constructor() {
    super('Paid from was changed again since, so nothing was taken back.');
  }
}

const isSame = (a: BillFundedBy, b: BillFundedBy) =>
  JSON.stringify(a) === JSON.stringify(b);

const getStretches = (
  versions: readonly BillVersion[],
  billId: string,
  today: number,
) => getVersionStretches<BillVersion, BillSealed>(versions, billId, today);

/** Sets a bill's Paid from from today on, in every stretch it already has, so a later version and its end are kept. Returns false when it already says so and nothing was written. */
export async function writeFundedBy(
  uid: string,
  encryption: RunwayEncryption,
  input: {
    billId: string;
    versions: readonly BillVersion[];
    today: number;
    next: BillFundedBy;
    summary: string;
  },
): Promise<boolean> {
  const stretches = getStretches(input.versions, input.billId, input.today);
  if (
    stretches.length === 0 ||
    stretches.every((stretch) => isSame(stretch.payload.fundedBy, input.next))
  ) {
    return false;
  }
  await changeItem(uid, encryption, {
    itemId: input.billId,
    kind: 'bill',
    payload: { ...stretches[0].payload, fundedBy: input.next },
    summary: input.summary,
    note: null,
    effectiveFrom: input.today,
    stretches: withFundedBy(stretches, input.next),
  });
  return true;
}

/** Takes back a Paid from this action wrote, reading the bill as it is now and changing only that field; refuses when it was changed again since. */
export async function revertFundedBy(
  uid: string,
  encryption: RunwayEncryption,
  input: {
    billId: string;
    versions: readonly BillVersion[];
    today: number;
    wrote: BillFundedBy;
    back: BillFundedBy;
    summary: string;
  },
): Promise<void> {
  const stretches = getStretches(input.versions, input.billId, input.today);
  if (
    stretches.length === 0 ||
    stretches.some((stretch) => !isSame(stretch.payload.fundedBy, input.wrote))
  ) {
    throw new FundedByChanged();
  }
  await changeItem(uid, encryption, {
    itemId: input.billId,
    kind: 'bill',
    payload: { ...stretches[0].payload, fundedBy: input.back },
    summary: input.summary,
    note: null,
    effectiveFrom: input.today,
    stretches: withFundedBy(stretches, input.back),
  });
}

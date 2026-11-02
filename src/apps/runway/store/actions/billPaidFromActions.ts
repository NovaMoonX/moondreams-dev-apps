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

const isSame = (a: BillFundedBy, b: BillFundedBy) => {
  if (a.kind === 'chosen' && b.kind === 'chosen') {
    return (
      a.dayKeys.length === b.dayKeys.length &&
      a.dayKeys.every((key, index) => key === b.dayKeys[index])
    );
  }
  if (a.kind === 'pay' && b.kind === 'pay') {
    return a.payLineId === b.payLineId && a.monthDay === b.monthDay;
  }
  return a.kind === b.kind;
};

/** Each stretch's Paid from before a write, by the day the stretch starts. */
export type FundedByBefore = {
  effectiveFrom: number;
  fundedBy: BillFundedBy;
}[];

const getStretches = (
  versions: readonly BillVersion[],
  billId: string,
  today: number,
) => getVersionStretches<BillVersion, BillSealed>(versions, billId, today);

/** What each stretch from today on says now, for an Undo to put back. */
export const getFundedByBefore = (
  versions: readonly BillVersion[],
  billId: string,
  today: number,
): FundedByBefore =>
  getStretches(versions, billId, today).map((stretch) => ({
    effectiveFrom: stretch.effectiveFrom,
    fundedBy: stretch.payload.fundedBy,
  }));

/** Sets a bill's Paid from from today on, in every stretch it already has, so a later version and its end are kept. Returns what each stretch said before, or null when it already says so and nothing was written. */
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
): Promise<FundedByBefore | null> {
  const stretches = getStretches(input.versions, input.billId, input.today);
  if (
    stretches.length === 0 ||
    stretches.every((stretch) => isSame(stretch.payload.fundedBy, input.next))
  ) {
    return null;
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
  return stretches.map((stretch) => ({
    effectiveFrom: stretch.effectiveFrom,
    fundedBy: stretch.payload.fundedBy,
  }));
}

/** Takes back a Paid from this action wrote, reading the bill as it is now and restoring each stretch's own earlier value (a stretch that did not exist then takes the nearest earlier one); refuses when it was changed again since. */
export async function revertFundedBy(
  uid: string,
  encryption: RunwayEncryption,
  input: {
    billId: string;
    versions: readonly BillVersion[];
    today: number;
    wrote: BillFundedBy;
    back: FundedByBefore;
    summary: string;
  },
): Promise<void> {
  const stretches = getStretches(input.versions, input.billId, input.today);
  if (
    stretches.length === 0 ||
    input.back.length === 0 ||
    stretches.some((stretch) => !isSame(stretch.payload.fundedBy, input.wrote))
  ) {
    throw new FundedByChanged();
  }
  const backFor = (from: number) =>
    [...input.back]
      .filter((entry) => entry.effectiveFrom <= from)
      .sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0]?.fundedBy ??
    input.back[0].fundedBy;
  const restored = stretches.map((stretch) => ({
    ...stretch,
    payload: {
      ...stretch.payload,
      fundedBy: backFor(stretch.effectiveFrom),
    },
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

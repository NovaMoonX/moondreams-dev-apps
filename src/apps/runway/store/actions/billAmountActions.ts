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

/** Only stretches holding today's amount are written, so a later planned change survives. */
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
  const current = stretches[0]?.payload.amount;
  const touched = current
    ? stretches.filter(
        (stretch) =>
          holds(stretch.payload, current) &&
          !holds(stretch.payload, input.amount),
      )
    : [];
  if (touched.length === 0) return null;
  const set = (payload: BillSealed): BillSealed => ({
    ...payload,
    amount: { ...input.amount },
  });
  await changeItem(uid, encryption, {
    itemId: input.billId,
    kind: 'bill',
    payload: set(touched[0].payload),
    summary: input.summary,
    note: null,
    effectiveFrom: touched[0].effectiveFrom,
    stretches: touched.map((stretch) => ({
      ...stretch,
      payload: set(stretch.payload),
    })),
  });
  return touched.map((stretch) => ({
    effectiveFrom: stretch.effectiveFrom,
    amount: stretch.payload.amount,
  }));
}

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
  const restored = input.back.map((entry) => ({
    entry,
    stretch: stretches.find(
      (stretch) => stretch.effectiveFrom === entry.effectiveFrom,
    ),
  }));
  if (
    restored.length === 0 ||
    restored.some(
      ({ stretch }) => !stretch || !holds(stretch.payload, input.wrote),
    )
  ) {
    throw new BillAmountChanged();
  }
  const writes = restored.flatMap(({ entry, stretch }) =>
    stretch
      ? [
          {
            ...stretch,
            payload: { ...stretch.payload, amount: entry.amount },
          },
        ]
      : [],
  );
  await changeItem(uid, encryption, {
    itemId: input.billId,
    kind: 'bill',
    payload: writes[0].payload,
    summary: input.summary,
    note: null,
    effectiveFrom: writes[0].effectiveFrom,
    stretches: writes,
  });
}

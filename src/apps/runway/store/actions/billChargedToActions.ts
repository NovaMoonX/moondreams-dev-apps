import type { ChargedPlace } from '@apps/runway/engine/chargedTo';
import { getVersionStretches } from '@apps/runway/engine/resolve';
import { changeItem } from '@apps/runway/store/actions/itemActions';
import type {
  BillSealed,
  BillVersion,
  RunwayEncryption,
} from '@apps/runway/types';

/** A bill's card or account is not what the action being taken back set it to. */
export class ChargedToChanged extends Error {
  constructor() {
    super(
      'What it is charged to was changed again since, so nothing was taken back.',
    );
  }
}

/** What a stretch names as its card and account. */
interface Named {
  paidByCardId: string | null;
  accountId: string | null;
}

/** Each stretch's card and account before a write, by the day the stretch starts. */
export type ChargedToBefore = (Named & { effectiveFrom: number })[];

const getStretches = (
  versions: readonly BillVersion[],
  billId: string,
  today: number,
) => getVersionStretches<BillVersion, BillSealed>(versions, billId, today);

const getNamed = (payload: BillSealed): Named => ({
  paidByCardId: payload.paidByCardId ?? null,
  accountId: payload.accountId ?? null,
});

/** The bill as it reads once charged to the place: a card leaves its account alone, an account clears the card. */
export const withChargedTo = (
  payload: BillSealed,
  place: ChargedPlace,
): BillSealed =>
  place.kind === 'card'
    ? { ...payload, paidByCardId: place.id }
    : { ...payload, paidByCardId: null, accountId: place.id };

const holds = (payload: BillSealed, place: ChargedPlace) =>
  place.kind === 'card'
    ? getNamed(payload).paidByCardId === place.id
    : getNamed(payload).paidByCardId === null &&
      getNamed(payload).accountId === place.id;

/** Charges a bill to a card or account from today on, in every stretch it already has, so a later version and its end are kept. Returns what each stretch named before, or null when every stretch already says so and nothing was written. */
export async function writeChargedTo(
  uid: string,
  encryption: RunwayEncryption,
  input: {
    billId: string;
    versions: readonly BillVersion[];
    today: number;
    place: ChargedPlace;
    summary: string;
  },
): Promise<ChargedToBefore | null> {
  const stretches = getStretches(input.versions, input.billId, input.today);
  if (
    stretches.length === 0 ||
    stretches.every((stretch) => holds(stretch.payload, input.place))
  ) {
    return null;
  }
  await changeItem(uid, encryption, {
    itemId: input.billId,
    kind: 'bill',
    payload: withChargedTo(stretches[0].payload, input.place),
    summary: input.summary,
    note: null,
    effectiveFrom: input.today,
    stretches: stretches.map((stretch) => ({
      ...stretch,
      payload: withChargedTo(stretch.payload, input.place),
    })),
  });
  return stretches.map((stretch) => ({
    effectiveFrom: stretch.effectiveFrom,
    ...getNamed(stretch.payload),
  }));
}

/** Takes back a charge this action wrote, reading the bill as it is now and restoring each stretch's own earlier card and account (a stretch that did not exist then takes the nearest earlier one); refuses when any stretch was changed again since. */
export async function revertChargedTo(
  uid: string,
  encryption: RunwayEncryption,
  input: {
    billId: string;
    versions: readonly BillVersion[];
    today: number;
    wrote: ChargedPlace;
    back: ChargedToBefore;
    summary: string;
  },
): Promise<void> {
  const stretches = getStretches(input.versions, input.billId, input.today);
  if (
    stretches.length === 0 ||
    input.back.length === 0 ||
    stretches.some((stretch) => !holds(stretch.payload, input.wrote))
  ) {
    throw new ChargedToChanged();
  }
  const backFor = (from: number): Named => {
    const found =
      [...input.back]
        .filter((entry) => entry.effectiveFrom <= from)
        .sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0] ?? input.back[0];
    return { paidByCardId: found.paidByCardId, accountId: found.accountId };
  };
  const restored = stretches.map((stretch) => ({
    ...stretch,
    payload: { ...stretch.payload, ...backFor(stretch.effectiveFrom) },
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

/** One printed line of a bill: what it is and what it cost in total (quantity already multiplied out), in integer cents. */
export interface ReceiptLine {
  id: string;
  name: string;
  priceCents: number;
}

export type TipSplit = 'EVEN' | 'PROPORTIONAL';

export interface ReceiptSplitInput {
  lines: ReceiptLine[];
  /** Who had each line; a line with several people is shared equally among them. */
  claims: Record<string, string[]>;
  /** Everyone who may owe something, in a stable order. */
  people: string[];
  taxCents: number;
  /** Service, delivery and other charges added on top. */
  feesCents: number;
  /** A reduction taken off the bill, as a positive number. */
  discountCents: number;
  tipCents: number;
  tipSplit: TipSplit;
}

export interface ReceiptPersonTotal {
  itemsCents: number;
  taxCents: number;
  feesCents: number;
  /** Negative: what the discount takes off. */
  discountCents: number;
  tipCents: number;
  totalCents: number;
}

export interface ReceiptSplitResult {
  totals: Record<string, ReceiptPersonTotal>;
  /** Everyone who owes something, in `people` order. */
  participants: string[];
  /** Lines nobody has claimed yet. */
  unclaimedLineIds: string[];
  /** What the whole bill comes to; the per-person totals add up to exactly this. */
  totalCents: number;
}

/** Splits `amountCents` by weight into whole cents that add back up to it exactly (largest remainder; ties go to the earlier entry). */
export function allocateByWeight(
  amountCents: number,
  weights: [string, number][],
): Record<string, number> {
  if (weights.length === 0) {
    return {};
  }
  const sign = amountCents < 0 ? -1 : 1;
  const amount = Math.abs(amountCents);
  const weightSum = weights.reduce((sum, [, weight]) => sum + weight, 0);
  const effective = weightSum > 0 ? weights : weights.map(([id]): [string, number] => [id, 1]);
  const effectiveSum = weightSum > 0 ? weightSum : effective.length;
  const shares = effective.map(([id, weight], index) => {
    const exact = (amount * weight) / effectiveSum;
    return { id, index, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  const leftover = amount - shares.reduce((sum, share) => sum + share.floor, 0);
  const luckyIds = new Set(
    [...shares]
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
      .slice(0, leftover)
      .map((share) => share.id),
  );
  const result = Object.fromEntries(
    shares.map((share) => [share.id, sign * (share.floor + (luckyIds.has(share.id) ? 1 : 0))]),
  );
  return result;
}

export const sumLinesCents = (lines: ReceiptLine[]) => lines.reduce((sum, line) => sum + line.priceCents, 0);

/** What the bill comes to once its charges, discount and tip are counted. */
export function getReceiptTotalCents(
  lines: ReceiptLine[],
  charges: Pick<ReceiptSplitInput, 'taxCents' | 'feesCents' | 'discountCents' | 'tipCents'>,
) {
  const total = sumLinesCents(lines) + charges.taxCents + charges.feesCents - charges.discountCents + charges.tipCents;
  return total;
}

/** A tip as a percent of what was ordered (after any discount, before tax), in whole cents. */
export function getTipFromPercent(lines: ReceiptLine[], discountCents: number, percent: number) {
  const basis = Math.max(0, sumLinesCents(lines) - discountCents);
  const tip = Math.round((basis * percent) / 100);
  return tip;
}

const emptyTotal = (): ReceiptPersonTotal => ({
  itemsCents: 0,
  taxCents: 0,
  feesCents: 0,
  discountCents: 0,
  tipCents: 0,
  totalCents: 0,
});

/** Works out what each person owes: their items (shared lines split equally), then tax, fees and the discount in proportion to those items, and the tip evenly or in proportion. Nothing is lost to rounding. */
export function splitReceipt(input: ReceiptSplitInput): ReceiptSplitResult {
  const { lines, claims, people, tipSplit } = input;
  const validClaims = (line: ReceiptLine) => (claims[line.id] ?? []).filter((uid) => people.includes(uid));
  const unclaimedLineIds = lines.filter((line) => validClaims(line).length === 0).map((line) => line.id);

  const itemCents = lines.reduce<Record<string, number>>((acc, line) => {
    const holders = validClaims(line);
    const shares = allocateByWeight(
      line.priceCents,
      holders.map((uid): [string, number] => [uid, 1]),
    );
    return Object.entries(shares).reduce((next, [uid, cents]) => ({ ...next, [uid]: (next[uid] ?? 0) + cents }), acc);
  }, {});

  const participants = people.filter((uid) => uid in itemCents);
  const pool = participants.length > 0 ? participants : people;
  const byItems = pool.map((uid): [string, number] => [uid, Math.max(0, itemCents[uid] ?? 0)]);
  const tax = allocateByWeight(input.taxCents, byItems);
  const fees = allocateByWeight(input.feesCents, byItems);
  const discount = allocateByWeight(-input.discountCents, byItems);
  const tip = allocateByWeight(
    input.tipCents,
    tipSplit === 'EVEN' ? pool.map((uid): [string, number] => [uid, 1]) : byItems,
  );

  const totals = Object.fromEntries(
    pool.map((uid) => {
      const person: ReceiptPersonTotal = {
        ...emptyTotal(),
        itemsCents: itemCents[uid] ?? 0,
        taxCents: tax[uid] ?? 0,
        feesCents: fees[uid] ?? 0,
        discountCents: discount[uid] ?? 0,
        tipCents: tip[uid] ?? 0,
      };
      const totalCents = person.itemsCents + person.taxCents + person.feesCents + person.discountCents + person.tipCents;
      return [uid, { ...person, totalCents }];
    }),
  );

  const result: ReceiptSplitResult = {
    totals,
    participants: pool,
    unclaimedLineIds,
    totalCents: getReceiptTotalCents(lines, input),
  };
  return result;
}

export const MAX_ITEMIZED_QUANTITY = 12;

/** A line bought in a quantity as one entry per unit ("Ramen (1 of 2)"), the price shared so the units add back up to the line. A quantity that isn't a small whole number stays one entry that says it ("0.5× Ramen"). */
export function itemizeLine(name: string, quantity: number, priceCents: number): { name: string; priceCents: number }[] {
  const isItemizable = Number.isInteger(quantity) && quantity >= 2 && quantity <= MAX_ITEMIZED_QUANTITY;
  if (!isItemizable) {
    return [{ name: quantity === 1 ? name : `${quantity}× ${name}`, priceCents }];
  }
  const prices = allocateByWeight(
    priceCents,
    Array.from({ length: quantity }, (_, index): [string, number] => [String(index), 1]),
  );
  const units = Array.from({ length: quantity }, (_, index) => ({
    name: `${name} (${index + 1} of ${quantity})`,
    priceCents: prices[String(index)] ?? 0,
  }));
  return units;
}

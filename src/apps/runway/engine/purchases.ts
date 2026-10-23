import { allocate } from '@apps/runway/engine/money';
import type {
  Cents,
  DateOnly,
  OpenPurchase,
  PurchaseLine,
  TrackingPeriod,
} from '@apps/runway/types';

const FREE_ID = 'free';

/** `total` shared equally by largest remainder; a cent that does not divide goes to the lowest ids first. */
export function splitEvenly(total: Cents, ids: readonly string[]): Cents[] {
  const result = allocate(
    total,
    ids.map(() => 1),
    ids,
  );
  return result;
}

export const sumLines = (lines: readonly PurchaseLine[]): Cents =>
  lines.reduce((sum, line) => sum + line.cents, 0);

/** A purchase's lines as the person chose them; a share of nothing is left out. */
export function toChosenLines(
  shares: readonly { envelopeId: string | null; cents: Cents }[],
): PurchaseLine[] {
  const result = shares
    .filter((share) => share.cents !== 0)
    .map((share): PurchaseLine => ({
      envelopeId: share.envelopeId,
      cents: share.cents,
      via: share.envelopeId === null ? 'free' : 'chosen',
    }));
  return result;
}

/** A day inside any stretch of tracking, either end included. */
export function isInTrackingPeriods(
  periods: readonly TrackingPeriod[],
  date: DateOnly,
): boolean {
  const result = periods.some(
    (period) =>
      date >= period.from && (period.to === null || date <= period.to),
  );
  return result;
}

/** How much of a purchase a refund can still return: what it cost, less the refunds already made against it. */
export function getRefundableCents(
  original: OpenPurchase,
  purchases: readonly OpenPurchase[],
): Cents {
  const refunded = purchases
    .filter((purchase) => purchase.refundOfId === original.id)
    .reduce((sum, purchase) => sum - purchase.amountCents, 0);
  const result = Math.max(0, original.amountCents - refunded);
  return result;
}

export type RefundReturn =
  { kind: 'lines'; lines: PurchaseLine[] } | { kind: 'pick' };

/** A refund (a positive amount) goes back to the envelopes the purchase took from, in the proportions it took them; otherwise the person picks. */
export function getRefundLines(
  refundCents: Cents,
  original: OpenPurchase,
  isLive: (envelopeId: string) => boolean,
): RefundReturn {
  const taken = original.lines.filter((line) => line.cents > 0);
  const isReturnable =
    taken.length > 0 &&
    taken.every((line) => line.envelopeId === null || isLive(line.envelopeId));
  if (!isReturnable) return { kind: 'pick' };

  const ids = taken.map((line) => line.envelopeId ?? FREE_ID);
  const shares = allocate(
    refundCents,
    taken.map((line) => line.cents),
    ids,
  );
  const lines = taken.flatMap((line, index) =>
    shares[index] === 0
      ? []
      : [
          {
            envelopeId: line.envelopeId,
            cents: 0 - shares[index],
            via: line.via,
          } satisfies PurchaseLine,
        ],
  );
  return { kind: 'lines', lines };
}

export interface LineEffect {
  /** What the envelope holds after the line; below zero when it is over. */
  afterCents: Cents;
  overCents: Cents;
  /** How much Free to spend falls by (it rises when negative): an envelope covers a purchase while it has money, and the rest comes out of Free to spend. */
  freeDropCents: Cents;
}

/** What taking `cents` (negative for a refund) from an envelope that holds `leftCents` does to it and to Free to spend. */
export function getLineEffect(leftCents: Cents, cents: Cents): LineEffect {
  const afterCents = leftCents - cents;
  const covered = Math.max(0, leftCents) - Math.max(0, afterCents);
  const result: LineEffect = {
    afterCents,
    overCents: Math.max(0, -afterCents),
    freeDropCents: cents - covered,
  };
  return result;
}

export interface PurchaseEffect {
  freeDropCents: Cents;
  /** The envelopes the purchase leaves over, with how far. */
  over: { envelopeId: string; overCents: Cents }[];
}

/** The effect of a set of lines on the envelopes they name and on Free to spend. */
export function getPurchaseEffect(
  lines: readonly PurchaseLine[],
  leftById: Readonly<Record<string, Cents>>,
): PurchaseEffect {
  const effects = lines.map((line) =>
    line.envelopeId === null
      ? {
          envelopeId: null,
          effect: {
            afterCents: 0,
            overCents: 0,
            freeDropCents: line.cents,
          } satisfies LineEffect,
        }
      : {
          envelopeId: line.envelopeId,
          effect: getLineEffect(leftById[line.envelopeId] ?? 0, line.cents),
        },
  );
  const result: PurchaseEffect = {
    freeDropCents: effects.reduce(
      (sum, entry) => sum + entry.effect.freeDropCents,
      0,
    ),
    over: effects.flatMap((entry) =>
      entry.envelopeId !== null && entry.effect.overCents > 0
        ? [{ envelopeId: entry.envelopeId, overCents: entry.effect.overCents }]
        : [],
    ),
  };
  return result;
}

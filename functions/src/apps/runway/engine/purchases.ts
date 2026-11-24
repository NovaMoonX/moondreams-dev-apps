// Generated from src/apps/runway/engine/purchases.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import { getOpenPeriod } from './level.js';
import { allocate } from './money.js';
import type {
  Cents,
  DateOnly,
  OpenPurchase,
  PlanItemDoc,
  PurchaseAssignedBy,
  PurchaseLine,
  PurchaseSealed,
  TrackingPeriod,
} from '../runwayTypes.js';

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

/** The sealed fields of a waiting purchase sent to its envelopes: everything it had, now unpaired, with its lines and who placed it. */
export const toAssignedSealed = (
  previous: OpenPurchase,
  lines: PurchaseLine[],
  ruleId: string | null,
  assignedBy: PurchaseAssignedBy | null,
): Required<PurchaseSealed> => ({
  amountCents: previous.amountCents,
  merchant: previous.merchant,
  merchantLogo: previous.merchantLogo ?? null,
  bankName: previous.bankName ?? null,
  category: previous.category,
  ruleId,
  label: previous.label,
  note: previous.note,
  lines,
  refundOfId: previous.refundOfId,
  paidByCardId: previous.paidByCardId ?? null,
  link: previous.link,
  receiptText: previous.receiptText,
  costRef: previous.costRef ?? null,
  billRef: previous.billRef ?? null,
  notSameAs: previous.notSameAs,
  incomeDayId: null,
  assignedBy,
  pairedWithId: null,
  pairKind: null,
  cardPaymentMoveId: null,
  tickedDayKey: null,
  storeEmail: previous.storeEmail ?? null,
  orderLog: previous.orderLog ?? null,
});

/** Whether an envelope or horizon can still take a purchase's lines: it exists and is neither archived nor finished. */
export const isEnvelopeLive = (item: PlanItemDoc | undefined): boolean =>
  item !== undefined &&
  (item.kind === 'envelope' || item.kind === 'horizon') &&
  item.archivedAt === null &&
  !(item.kind === 'horizon' && item.endedAt !== null);

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

/** The day the figures count purchases from: the start of the stretch tracking is on for now. An earlier stretch has its own, older base, so a day there would be listed and never counted. */
export function getCountedFrom(
  periods: readonly TrackingPeriod[],
): DateOnly | null {
  const result = getOpenPeriod(periods)?.from ?? null;
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

/** A refund (a positive amount) goes back to the envelopes the purchase took from, in the proportions of what each still has to get back after the refunds already made; otherwise the person picks. */
export function getRefundLines(
  refundCents: Cents,
  original: OpenPurchase,
  isLive: (envelopeId: string) => boolean,
  purchases: readonly OpenPurchase[] = [],
): RefundReturn {
  const taken = original.lines.filter((line) => line.cents > 0);
  const isReturnable =
    taken.length > 0 &&
    taken.every((line) => line.envelopeId === null || isLive(line.envelopeId));
  if (!isReturnable) return { kind: 'pick' };

  const returned = purchases
    .filter((purchase) => purchase.refundOfId === original.id)
    .flatMap((purchase) => purchase.lines);
  const keyOf = (line: PurchaseLine) => line.envelopeId ?? FREE_ID;
  const remaining = taken.reduce<number[]>((acc, line, index) => {
    const key = keyOf(line);
    const own = taken
      .map((entry, at) => ({ entry, at }))
      .filter(({ entry }) => keyOf(entry) === key);
    if (own[0].at !== index) return acc;
    const back = returned
      .filter((entry) => keyOf(entry) === key)
      .reduce((sum, entry) => sum + entry.cents, 0);
    const pool = Math.max(
      0,
      own.reduce((sum, { entry }) => sum + entry.cents, 0) + back,
    );
    const parts = allocate(
      pool,
      own.map(({ entry }) => entry.cents),
      own.map(({ at }) => String(at)),
    );
    own.forEach(({ at }, part) => {
      acc[at] = parts[part];
    });
    return acc;
  }, []);
  const canFollowRemaining =
    remaining.reduce((sum, cents) => sum + cents, 0) >= refundCents;
  const ids = taken.map((line) => line.envelopeId ?? FREE_ID);
  const shares = allocate(
    refundCents,
    canFollowRemaining ? remaining : taken.map((line) => line.cents),
    ids,
  );
  const lines = taken.flatMap((line, index) =>
    shares[index] === 0
      ? []
      : [
          {
            envelopeId: line.envelopeId,
            cents: 0 - shares[index],
            via:
              line.via === 'spill'
                ? line.envelopeId === null
                  ? 'free'
                  : 'chosen'
                : line.via,
          } satisfies PurchaseLine,
        ],
  );
  return { kind: 'lines', lines };
}

export interface LineEffect {
  /** What the envelope holds after the line; below zero when it is over. */
  afterCents: Cents;
  overCents: Cents;
  /** How much Free to Spend falls by (it rises when negative): an envelope covers a purchase while it has money, and the rest comes out of Free to Spend. */
  freeDropCents: Cents;
}

/** What taking `cents` (negative for a refund) from an envelope that holds `leftCents` does to it and to Free to Spend. */
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

/** The effect of a set of lines on the envelopes they name and on Free to Spend. */
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

/** Whether an email or bank charge sits in Free to Spend with nobody having placed it. */
export function isOpenToPlace(purchase: OpenPurchase): boolean {
  const result =
    !purchase.needsHome &&
    (purchase.source === 'link' || purchase.source === 'email') &&
    purchase.amountCents > 0 &&
    purchase.lines.length > 0 &&
    purchase.lines.every(
      (line) => line.envelopeId === null && line.via === 'free',
    ) &&
    purchase.assignedBy === null &&
    purchase.ruleId === null &&
    (purchase.billRef ?? null) === null &&
    purchase.pairedWithId === null &&
    purchase.refundOfId === null &&
    purchase.incomeDayId === null;
  return result;
}

import { applyHeldWrites, type HeldWrite } from '@/utils/heldWrites';
import type { DateOnly, OpenPurchase } from '@apps/runway/types';

interface PurchaseListsInput {
  window: OpenPurchase[];
  needsHome: OpenPurchase[];
  period: OpenPurchase[];
  deliveredAt: {
    window: number | null;
    needsHome: number | null;
    period: number | null;
  };
  purchasesFrom: DateOnly | null;
  periodFor: string | null;
  held: HeldWrite<OpenPurchase>[];
  /** The lists each hold (`id/token`) has already landed in; a hold never comes back over one of them. */
  landed: Record<string, PurchaseList[]>;
  now?: number;
}

export type PurchaseList = 'window' | 'needsHome' | 'period';

const keyOf = (hold: HeldWrite<OpenPurchase>) => `${hold.id}/${hold.token}`;

const readPeriod = (
  periodFor: string | null,
): { from: number; to: number } | null => {
  if (periodFor === null) return null;
  const [from, to] = periodFor.split(':').map(Number);
  return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
};

/** A hold stays only in a list its purchase belongs to; in any other it is a removal, which lands at once. */
export const forList = (
  held: HeldWrite<OpenPurchase>[],
  belongs: (item: OpenPurchase) => boolean,
): HeldWrite<OpenPurchase>[] =>
  held.map((hold) =>
    hold.item === null || belongs(hold.item)
      ? hold
      : { ...hold, item: null, fields: [], fingerprint: '' },
  );

/** The window, Needs a home and the period's lists with the held purchases laid over each; a hold stays while any list still waits for it. */
export const layPurchaseLists = ({
  window,
  needsHome,
  period,
  deliveredAt,
  purchasesFrom,
  periodFor,
  held,
  landed,
  now,
}: PurchaseListsInput) => {
  const range = readPeriod(periodFor);
  const lay = (
    list: PurchaseList,
    incoming: OpenPurchase[],
    belongs: (item: OpenPurchase) => boolean,
  ) => {
    const waiting = forList(held, belongs).filter(
      (hold) => !landed[keyOf(hold)]?.includes(list),
    );
    const result = applyHeldWrites(incoming, waiting, (item) => item.id, {
      deliveredAt: deliveredAt[list],
      now,
    });
    const kept = new Set(result.held.map(keyOf));
    return {
      list: result.list,
      kept,
      landedNow: waiting.map(keyOf).filter((key) => !kept.has(key)),
    };
  };
  const results = {
    window: lay(
      'window',
      window,
      (item) => purchasesFrom !== null && item.date >= purchasesFrom,
    ),
    needsHome: lay('needsHome', needsHome, (item) => item.needsHome === true),
    period: lay(
      'period',
      period,
      (item) =>
        range !== null && item.date >= range.from && item.date < range.to,
    ),
  };
  const entries = Object.entries(results) as [
    PurchaseList,
    (typeof results)[PurchaseList],
  ][];
  const keptHeld = held.filter((hold) =>
    entries.some(([, result]) => result.kept.has(keyOf(hold))),
  );
  return {
    purchases: results.window.list,
    needsHome: results.needsHome.list,
    periodPurchases: results.period.list,
    held: keptHeld,
    landed: Object.fromEntries(
      keptHeld.map((hold) => {
        const key = keyOf(hold);
        return [
          key,
          [
            ...(landed[key] ?? []),
            ...entries.flatMap(([list, result]) =>
              result.landedNow.includes(key) ? [list] : [],
            ),
          ],
        ];
      }),
    ),
  };
};

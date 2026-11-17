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
  now?: number;
}

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
  now,
}: PurchaseListsInput) => {
  const range = readPeriod(periodFor);
  const lay = (
    incoming: OpenPurchase[],
    belongs: (item: OpenPurchase) => boolean,
    at: number | null,
  ) =>
    applyHeldWrites(incoming, forList(held, belongs), (item) => item.id, {
      deliveredAt: at,
      now,
    });
  const inWindow = lay(
    window,
    (item) => purchasesFrom !== null && item.date >= purchasesFrom,
    deliveredAt.window,
  );
  const inNeedsHome = lay(
    needsHome,
    (item) => item.needsHome === true,
    deliveredAt.needsHome,
  );
  const inPeriod = lay(
    period,
    (item) => range !== null && item.date >= range.from && item.date < range.to,
    deliveredAt.period,
  );
  const kept = new Set(
    [inWindow, inNeedsHome, inPeriod].flatMap((result) =>
      result.held.map((hold) => `${hold.id}/${hold.token}`),
    ),
  );
  return {
    purchases: inWindow.list,
    needsHome: inNeedsHome.list,
    periodPurchases: inPeriod.list,
    held: held.filter((hold) => kept.has(`${hold.id}/${hold.token}`)),
  };
};

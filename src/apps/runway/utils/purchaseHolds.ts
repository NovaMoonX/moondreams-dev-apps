import { layHeldLists, type HeldWrite } from '@/utils/heldWrites';
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
  landed: Record<string, PurchaseList[]>;
  now?: number;
}

export type PurchaseList = 'window' | 'needsHome' | 'period';

const readPeriod = (
  periodFor: string | null,
): { from: number; to: number } | null => {
  if (periodFor === null) return null;
  const [from, to] = periodFor.split(':').map(Number);
  return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
};

/** The window, Needs a home and the period's lists with the held purchases laid over each. */
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
  const laid = layHeldLists<OpenPurchase, PurchaseList>({
    lists: {
      window: {
        incoming: window,
        deliveredAt: deliveredAt.window,
        belongs: (item) => purchasesFrom !== null && item.date >= purchasesFrom,
      },
      needsHome: {
        incoming: needsHome,
        deliveredAt: deliveredAt.needsHome,
        belongs: (item) => item.needsHome === true,
      },
      period: {
        incoming: period,
        deliveredAt: deliveredAt.period,
        belongs: (item) =>
          range !== null && item.date >= range.from && item.date < range.to,
      },
    },
    held,
    landed,
    idOf: (item) => item.id,
    now,
  });
  return {
    purchases: laid.lists.window,
    needsHome: laid.lists.needsHome,
    periodPurchases: laid.lists.period,
    held: laid.held,
    landed: laid.landed,
  };
};

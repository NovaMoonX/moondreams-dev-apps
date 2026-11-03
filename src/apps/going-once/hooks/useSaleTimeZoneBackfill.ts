import { useEffect } from 'react';

import { backfillSaleTimeZone } from '@apps/going-once/store/actions/saleActions';
import { isSaleSeller } from '@apps/going-once/utils/roles';
import type { Sale } from '@apps/going-once/types';

const tried = new Set<string>();

/** When the seller opens a sale that has no time zone yet, saves theirs; one try per sale per visit; if it fails the push reads UTC. */
export function useSaleTimeZoneBackfill(sale: Sale | null, uid: string | null) {
  const saleId = sale?.id ?? null;
  const isMissing = sale !== null && sale.timeZone === null;
  const isSeller = uid !== null && isSaleSeller(sale, uid);

  useEffect(() => {
    if (saleId === null || !isMissing || !isSeller || tried.has(saleId)) return;
    tried.add(saleId);
    backfillSaleTimeZone(saleId).catch(() => undefined);
  }, [saleId, isMissing, isSeller]);
}

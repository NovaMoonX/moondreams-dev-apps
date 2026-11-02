import { useEffect, useRef } from 'react';

import { useAppSelector } from '@/store';
import {
  cancelInvite,
  joinSale,
} from '@apps/going-once/store/actions/memberActions';
import {
  selectMyInvites,
  selectSales,
  selectSalesStatus,
} from '@apps/going-once/store/selectors';

/**
 * Joins each sale the person's verified email was invited to; an invitation for a sale they joined after it was made
 * is deleted instead, so it can never bring them back once removed. Each invitation is tried once per membership state.
 */
export function useJoinFromInvites(uid: string | null) {
  const invites = useAppSelector(selectMyInvites);
  const sales = useAppSelector(selectSales);
  const isSalesReady = useAppSelector(selectSalesStatus) === 'ready';
  const tried = useRef(new Set<string>());

  useEffect(() => {
    if (!uid || !isSalesReady) return;
    invites.forEach((invite) => {
      const sale = sales.find((found) => found.id === invite.saleId) ?? null;
      const key = `${invite.saleId}_${invite.email}:${invite.createdAt}:${sale !== null}`;
      if (tried.current.has(key)) return;
      tried.current.add(key);
      if (sale === null) {
        joinSale(uid, invite).catch(() => undefined);
        return;
      }
      if ((sale.memberJoinedAt[uid] ?? 0) >= invite.createdAt)
        cancelInvite(invite).catch(() => undefined);
    });
  }, [uid, invites, sales, isSalesReady]);
}

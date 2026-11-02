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
 * Joins each sale the person's verified email was invited to, once per invitation at a time. An invitation for a sale
 * they are already on is deleted instead, so it can never bring them back after they are removed. A refused join or
 * delete (the seller took it back a second ago) is dropped quietly and may be tried again on the next change.
 */
export function useJoinFromInvites(uid: string | null) {
  const invites = useAppSelector(selectMyInvites);
  const sales = useAppSelector(selectSales);
  const isSalesReady = useAppSelector(selectSalesStatus) === 'ready';
  const tried = useRef(new Set<string>());

  useEffect(() => {
    if (!uid || !isSalesReady) return;
    const waiting = new Set(
      invites.map((invite) => `${invite.saleId}_${invite.email}`),
    );
    tried.current.forEach((id) => {
      if (!waiting.has(id)) tried.current.delete(id);
    });
    invites.forEach((invite) => {
      const id = `${invite.saleId}_${invite.email}`;
      if (tried.current.has(id)) return;
      tried.current.add(id);
      const isMember = sales.some((sale) => sale.id === invite.saleId);
      (isMember ? cancelInvite(invite) : joinSale(uid, invite)).catch(() =>
        tried.current.delete(id),
      );
    });
  }, [uid, invites, sales, isSalesReady]);
}

import { useEffect, useRef } from 'react';

import { useAppSelector } from '@/store';
import { joinSale } from '@apps/going-once/store/actions/memberActions';
import { selectMyInvites } from '@apps/going-once/store/selectors';

/** Joins each sale the person's verified email was invited to, once per invitation per session; a join the rules refuse (the seller took it back a second ago) is dropped quietly. */
export function useJoinFromInvites(uid: string | null) {
  const invites = useAppSelector(selectMyInvites);
  const tried = useRef(new Set<string>());

  useEffect(() => {
    if (!uid) return;
    invites.forEach((invite) => {
      const id = `${invite.saleId}_${invite.email}`;
      if (tried.current.has(id)) return;
      tried.current.add(id);
      joinSale(uid, invite).catch(() => undefined);
    });
  }, [uid, invites]);
}

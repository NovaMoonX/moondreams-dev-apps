import { onIdTokenChanged } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';

import { auth, db } from '@/lib/firebase/config';
import { normalizeEmail } from '@/utils/emailUtils';
import type { SaleEmailInvite } from '@apps/going-once/types';

const INVITES = collection(db, 'apps', 'going-once', 'emailInvites');

const toInvite = (data: DocumentData): SaleEmailInvite => {
  const invite = data as Partial<SaleEmailInvite>;
  return {
    saleId: invite.saleId ?? '',
    email: invite.email ?? '',
    invitedBy: invite.invitedBy ?? '',
    saleName: invite.saleName ?? '',
    inviterName: invite.inviterName ?? '',
    createdAt: invite.createdAt ?? 0,
  };
};

const listen = (
  invitesQuery: Query,
  onChange: (invites: SaleEmailInvite[]) => void,
) =>
  onSnapshot(
    invitesQuery,
    (snapshot) =>
      onChange(snapshot.docs.map((entry) => toInvite(entry.data()))),
    // A failed read says nothing about what is there, so the last list stands; someone whose email isn't verified never had one.
    () => undefined,
  );

/** Invitations addressed to this verified email. It listens again whenever the sign-in token is renewed, so an email verified a moment ago is picked up. */
export function startMyInvitesListener(
  email: string,
  onChange: (invites: SaleEmailInvite[]) => void,
): Unsubscribe {
  const invitesQuery = query(
    INVITES,
    where('email', '==', normalizeEmail(email)),
  );
  const stopReading = { current: () => {} };
  const stopTokens = onIdTokenChanged(auth, () => {
    stopReading.current();
    stopReading.current = listen(invitesQuery, onChange);
  });
  return () => {
    stopTokens();
    stopReading.current();
  };
}

/** The open sale's invitations, for its sellers. */
export function startSaleInvitesListener(
  saleId: string,
  onChange: (invites: SaleEmailInvite[]) => void,
): Unsubscribe {
  return listen(query(INVITES, where('saleId', '==', saleId)), onChange);
}

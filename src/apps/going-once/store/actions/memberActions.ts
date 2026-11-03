import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { normalizeEmail } from '@/utils/emailUtils';
import type { Sale, SaleEmailInvite } from '@apps/going-once/types';

const saleRef = (saleId: string) =>
  doc(db, 'apps', 'going-once', 'sales', saleId);

const inviteRef = (saleId: string, email: string) =>
  doc(db, 'apps', 'going-once', 'emailInvites', `${saleId}_${email}`);

/** The seller's Add: nothing is sent, the person joins when they open Going Once signed in with this email. */
export async function addCoSeller(
  sale: Pick<Sale, 'id' | 'name'>,
  uid: string,
  inviterName: string,
  email: string,
): Promise<SaleEmailInvite> {
  const invite: SaleEmailInvite = {
    saleId: sale.id,
    email: normalizeEmail(email),
    invitedBy: uid,
    saleName: sale.name,
    inviterName,
    createdAt: Date.now(),
  };
  await setDoc(inviteRef(invite.saleId, invite.email), invite);
  return invite;
}

/** Takes a waiting email off the sale. */
export const cancelInvite = (invite: SaleEmailInvite): Promise<void> =>
  deleteDoc(inviteRef(invite.saleId, invite.email));

/** Puts a cancelled invitation back exactly as it was. */
export const restoreInvite = (invite: SaleEmailInvite): Promise<void> =>
  setDoc(inviteRef(invite.saleId, invite.email), invite);

/**
 * The invited person joins and the invitation is used up in one commit. They cannot read the sale yet,
 * so their uid is written by path and by array union rather than read and rewritten.
 */
export async function joinSale(
  uid: string,
  invite: SaleEmailInvite,
): Promise<void> {
  const now = Date.now();
  const batch = writeBatch(db);
  batch.update(
    saleRef(invite.saleId),
    'members',
    arrayUnion(uid),
    new FieldPath('memberJoinedAt', uid),
    now,
    'lastEditedAt',
    now,
  );
  batch.delete(inviteRef(invite.saleId, invite.email));
  await batch.commit();
}

/** Takes one person off the sale (the seller removing a co-seller, or a co-seller leaving), touching only the member lists and the edit time. */
export const removeMember = (
  saleId: string,
  memberUid: string,
): Promise<void> =>
  updateDoc(
    saleRef(saleId),
    'members',
    arrayRemove(memberUid),
    new FieldPath('memberJoinedAt', memberUid),
    deleteField(),
    'lastEditedAt',
    Date.now(),
  );

import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { sealJson } from '@apps/runway/security';
import type {
  ExpenseSealed,
  OpenExpense,
  RunwayEncryption,
} from '@apps/runway/types';

const expenseRef = (uid: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'expenses', id);

export async function renameExpense(
  uid: string,
  encryption: RunwayEncryption,
  expense: OpenExpense,
  name: string,
): Promise<void> {
  await updateDoc(expenseRef(uid, expense.id), {
    updatedAt: Math.max(Date.now(), expense.updatedAt + 1),
    sealed: await sealJson(
      { name: name.trim(), note: expense.note } satisfies ExpenseSealed,
      encryption,
    ),
  });
}

/** Removes the group and takes it off each purchase in it; each purchase's `updatedAt` moves on, so an edit already open elsewhere is refused rather than putting the group back. */
export async function deleteExpense(
  uid: string,
  expense: OpenExpense,
): Promise<void> {
  const members = await getDocs(
    query(
      collection(db, 'apps', 'runway', 'plans', uid, 'purchases'),
      where('expenseId', '==', expense.id),
    ),
  );
  const batch = writeBatch(db);
  const now = Date.now();
  members.docs.forEach((entry) =>
    batch.update(entry.ref, {
      expenseId: null,
      updatedAt: Math.max(now, (entry.get('updatedAt') as number) + 1),
    }),
  );
  batch.delete(expenseRef(uid, expense.id));
  await batch.commit();
}

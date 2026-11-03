import { deleteDoc, doc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';

const inquiryRef = (saleId: string, inquiryId: string) =>
  doc(db, 'apps', 'going-once', 'sales', saleId, 'inquiries', inquiryId);

/** Marks an inquiry Handled by this person; touches only the three fields the rules allow. */
export const markHandled = (
  saleId: string,
  inquiryId: string,
  uid: string,
): Promise<void> =>
  updateDoc(inquiryRef(saleId, inquiryId), {
    status: 'HANDLED',
    handledBy: uid,
    handledAt: Date.now(),
  });

/** Puts a Handled inquiry back in New. */
export const backToNew = (saleId: string, inquiryId: string): Promise<void> =>
  updateDoc(inquiryRef(saleId, inquiryId), {
    status: 'NEW',
    handledBy: null,
    handledAt: null,
  });

export const deleteInquiry = (
  saleId: string,
  inquiryId: string,
): Promise<void> => deleteDoc(inquiryRef(saleId, inquiryId));

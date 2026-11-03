import { deleteDoc, doc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { queryClient } from '@/lib/query/queryClient';
import { inquiryQueryKeys } from '@apps/going-once/queries/inquiryQueries';

/** Older Handled pages and the Handled count are one-shot reads, so a change to which inquiries are Handled marks them stale. */
const refreshHandled = () =>
  void queryClient.invalidateQueries({ queryKey: inquiryQueryKeys.all });

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
  }).then(refreshHandled);

/** Puts a Handled inquiry back in New. */
export const backToNew = (saleId: string, inquiryId: string): Promise<void> =>
  updateDoc(inquiryRef(saleId, inquiryId), {
    status: 'NEW',
    handledBy: null,
    handledAt: null,
  }).then(refreshHandled);

export const deleteInquiry = (
  saleId: string,
  inquiryId: string,
): Promise<void> =>
  deleteDoc(inquiryRef(saleId, inquiryId)).then(refreshHandled);

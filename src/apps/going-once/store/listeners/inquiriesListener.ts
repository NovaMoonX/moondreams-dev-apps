import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { HANDLED_INBOX_LIMIT } from '@apps/going-once/constants';
import type { Inquiry } from '@apps/going-once/types';

/** Reads a stored inquiry, defaulting what an older document may lack. */
export function toInquiry(
  id: string,
  saleId: string,
  data: DocumentData,
): Inquiry {
  const inquiry = data as Partial<Inquiry>;
  return {
    id,
    saleId,
    itemId: inquiry.itemId ?? '',
    itemTitleAtSend: inquiry.itemTitleAtSend ?? '',
    name: inquiry.name ?? null,
    email: inquiry.email ?? null,
    phone: inquiry.phone ?? null,
    message: inquiry.message ?? null,
    status: inquiry.status === 'HANDLED' ? 'HANDLED' : 'NEW',
    handledBy: inquiry.handledBy ?? null,
    handledAt: inquiry.handledAt ?? null,
    sendCount: inquiry.sendCount ?? 1,
    createdAt: inquiry.createdAt ?? 0,
    lastSentAt: inquiry.lastSentAt ?? 0,
    contactClearedAt: inquiry.contactClearedAt ?? null,
  };
}

const inquiriesOf = (saleId: string) =>
  collection(db, 'apps', 'going-once', 'sales', saleId, 'inquiries');

const listen = (
  saleId: string,
  inquiriesQuery: Query<DocumentData>,
  onChange: (inquiries: Inquiry[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe =>
  onSnapshot(
    inquiriesQuery,
    (snapshot) =>
      onChange(
        snapshot.docs.map((entry) => toInquiry(entry.id, saleId, entry.data())),
      ),
    onError,
  );

/** Every New inquiry of the sale on screen, newest sent first. */
export const startNewInquiriesListener = (
  saleId: string,
  onChange: (inquiries: Inquiry[]) => void,
  onError: (error: unknown) => void,
) =>
  listen(
    saleId,
    query(
      inquiriesOf(saleId),
      where('status', '==', 'NEW'),
      orderBy('lastSentAt', 'desc'),
    ),
    onChange,
    onError,
  );

/** The newest Handled inquiries of the sale on screen, most recently handled first. */
export const startHandledInquiriesListener = (
  saleId: string,
  onChange: (inquiries: Inquiry[]) => void,
  onError: (error: unknown) => void,
) =>
  listen(
    saleId,
    query(
      inquiriesOf(saleId),
      where('status', '==', 'HANDLED'),
      orderBy('handledAt', 'desc'),
      limit(HANDLED_INBOX_LIMIT),
    ),
    onChange,
    onError,
  );

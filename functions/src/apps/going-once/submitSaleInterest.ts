import { createHash, randomBytes } from 'node:crypto';

import { getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';

import {
  INQUIRY_LIMITS,
  readContact,
  toDayKey,
  toInquiryId,
} from './inquiryView.js';
import { linkRef, saleRef } from './saleLinkStore.js';
import {
  FINISHED_SALE_STATUS,
  PUBLIC_STATUSES,
  isLinkId,
  isListable,
  isRecord,
  isSafeId,
} from './salePageView.js';

export type SaleInterestResult =
  | { status: 'sent'; contact: 'email' | 'phone' }
  | {
      status: 'not_found' | 'not_available' | 'busy' | 'full' | 'slow_down';
    }
  | { status: 'invalid'; field: 'name' | 'contact' | 'message' };

const refuse = (
  status: 'not_found' | 'not_available' | 'busy' | 'full' | 'slow_down',
): SaleInterestResult => ({ status });
const invalidField = (
  field: 'name' | 'contact' | 'message',
): SaleInterestResult => ({ status: 'invalid', field });

const MAX_TRACKED_SENDERS = 5000;

// Held in this instance's memory only, under a hash that changes on every cold start: the address itself is never kept, stored or logged.
const throttleSalt = randomBytes(16);
const recentSends = new Map<string, number[]>();

/** Counts this sender's send and says whether it is one too many for the window. */
function isThrottled(address: string, now: number): boolean {
  const key = createHash('sha256')
    .update(throttleSalt)
    .update(address)
    .digest('hex');
  const recent = (recentSends.get(key) ?? []).filter(
    (at) => now - at < INQUIRY_LIMITS.THROTTLE_WINDOW_MS,
  );
  recentSends.delete(key);
  recentSends.set(key, [...recent, now]);
  [...recentSends.keys()]
    .slice(0, Math.max(0, recentSends.size - MAX_TRACKED_SENDERS))
    .forEach((oldest) => recentSends.delete(oldest));
  return recent.length >= INQUIRY_LIMITS.THROTTLE_SENDS;
}

const toText = (value: unknown, max: number) =>
  typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, max)
    : null;

async function send(
  linkId: string,
  itemId: string,
  name: string,
  contact: NonNullable<ReturnType<typeof readContact>>,
  message: string | null,
  now: number,
): Promise<SaleInterestResult> {
  const link = await linkRef(linkId).get();
  const saleId = link.get('saleId');
  if (!link.exists || !isSafeId(saleId)) {
    return refuse('not_found');
  }

  const sale = await saleRef(saleId).get();
  if (
    !sale.exists ||
    sale.get('publicLinkId') !== linkId ||
    sale.get('status') === FINISHED_SALE_STATUS
  ) {
    return refuse('not_found');
  }

  const firestore = getFirestore();
  const item = await saleRef(saleId).collection('items').doc(itemId).get();
  const itemData: unknown = item.data();
  if (
    !item.exists ||
    !isRecord(itemData) ||
    !PUBLIC_STATUSES.some((status) => status === itemData.status) ||
    !isListable(itemData) ||
    typeof itemData.title !== 'string'
  ) {
    return refuse('not_available');
  }

  const inquiries = saleRef(saleId).collection('inquiries');
  const inquiry = inquiries.doc(toInquiryId(itemId, contact.key));
  if (!(await inquiry.get()).exists) {
    const asked = await inquiries.where('itemId', '==', itemId).count().get();
    if (asked.data().count >= INQUIRY_LIMITS.PER_THING) {
      return refuse('full');
    }
  }

  const limits = saleRef(saleId).collection('limits').doc('interest');
  const dayKey = toDayKey(now);
  const itemTitleAtSend = itemData.title.trim().slice(0, 120);
  const isBusy = await firestore.runTransaction(async (transaction) => {
    const [existing, counted] = await Promise.all([
      transaction.get(inquiry),
      transaction.get(limits),
    ]);
    if (existing.exists) {
      const sendCount = Number(existing.get('sendCount') ?? 1);
      const lastSentAt = Number(existing.get('lastSentAt') ?? 0);
      if (
        sendCount >= INQUIRY_LIMITS.MAX_SENDS_PER_INQUIRY ||
        now - lastSentAt < INQUIRY_LIMITS.RESEND_GAP_MS
      ) {
        return false;
      }
      transaction.update(inquiry, {
        name,
        email: contact.email,
        phone: contact.phone,
        message,
        itemTitleAtSend,
        status: 'NEW',
        handledBy: null,
        handledAt: null,
        sendCount: sendCount + 1,
        lastSentAt: now,
        contactClearedAt: null,
      });
      return false;
    }

    const today =
      counted.get('dayKey') === dayKey ? Number(counted.get('count') ?? 0) : 0;
    if (today >= INQUIRY_LIMITS.PER_SALE_PER_DAY) {
      return true;
    }

    transaction.set(limits, { dayKey, count: today + 1 });
    transaction.set(inquiry, {
      id: inquiry.id,
      saleId,
      itemId,
      itemTitleAtSend,
      name,
      email: contact.email,
      phone: contact.phone,
      message,
      status: 'NEW',
      handledBy: null,
      handledAt: null,
      sendCount: 1,
      createdAt: now,
      lastSentAt: now,
      contactClearedAt: null,
    });
    return false;
  });
  return isBusy ? refuse('busy') : { status: 'sent', contact: contact.kind };
}

/**
 * Takes a buyer's interest in a thing from anyone with the page's link, signed in or not, and files it as an inquiry for the sale's members.
 * Every limit answers its own status; the sender's address is only ever a salted hash in this instance's memory and is never stored or logged.
 */
export const submitSaleInterest = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 15,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<SaleInterestResult> => {
    const data: unknown = request.data;
    if (!isRecord(data)) {
      return refuse('not_found');
    }

    if (JSON.stringify(data).length > INQUIRY_LIMITS.MAX_PAYLOAD_BYTES) {
      return invalidField('message');
    }

    const contact = readContact(data.contact);
    if (typeof data.website === 'string' && data.website.trim() !== '') {
      return { status: 'sent', contact: contact?.kind ?? 'phone' };
    }

    const name = toText(data.name, INQUIRY_LIMITS.MAX_NAME_LENGTH);
    const message =
      typeof data.message === 'string' ? data.message.trim() : null;
    if (name === null || name === '') {
      return invalidField('name');
    }
    if (contact === null) {
      return invalidField('contact');
    }
    if (
      message === null ||
      message.length > INQUIRY_LIMITS.MAX_MESSAGE_LENGTH
    ) {
      return invalidField('message');
    }
    if (!isLinkId(data.linkId) || !isSafeId(data.itemId)) {
      return refuse('not_found');
    }

    const now = Date.now();
    if (isThrottled(request.rawRequest.ip ?? `link:${data.linkId}`, now)) {
      return refuse('slow_down');
    }

    return send(
      data.linkId,
      data.itemId,
      name,
      contact,
      message === '' ? null : message,
      now,
    );
  },
);

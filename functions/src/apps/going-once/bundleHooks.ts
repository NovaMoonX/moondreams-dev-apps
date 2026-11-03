import type { DocumentData, Firestore } from 'firebase-admin/firestore';

import type {
  BundleHooks,
  BundleItem,
} from '../../notifications/bundledPush.js';
import { APP_ORIGIN, toAppUrl } from '../../notifications/sendPush.js';
import { FINISHED_SALE_STATUS } from './salePageView.js';

const MAX_NAME_LENGTH = 40;
const MAX_ITEM_AGE_MS = 86_400_000;

/** Thing and sale names on a lock screen are clipped; both are already on the public page. */
export const clipName = (text: unknown, fallback: string) => {
  const name = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
  if (name === '') {
    return fallback;
  }

  return name.length > MAX_NAME_LENGTH
    ? `${name.slice(0, MAX_NAME_LENGTH - 1).trimEnd()}…`
    : name;
};

const toUrl = (path: string) => toAppUrl(path) ?? APP_ORIGIN;

const salePath = (saleId: string) =>
  `/going-once?sale=${encodeURIComponent(saleId)}&tab=inbox`;

/** Where a tap on one inquiry opens: that inquiry in the Inbox. */
export const getInquiryUrl = (saleId: string, inquiryId: string) =>
  toUrl(`${salePath(saleId)}&inquiry=${encodeURIComponent(inquiryId)}`);

const getNewListUrl = (saleId: string) => toUrl(`${salePath(saleId)}&view=new`);

const YOUR_SALES_URL = toUrl('/going-once');

/** A sale that takes pushes: it exists, is open (a missing status reads as open), and has this person on it. */
export function isSaleListening(
  sale: DocumentData | undefined,
  uid: string,
): boolean {
  if (!sale) {
    return false;
  }

  return (
    sale.status !== FINISHED_SALE_STATUS &&
    Array.isArray(sale.members) &&
    sale.members.includes(uid)
  );
}

/** Whether this person turned the sale's push off. */
export const isPushOff = (
  person: DocumentData | undefined,
  saleId: string,
): boolean =>
  Array.isArray(person?.inquiryPushOffSaleIds) &&
  person.inquiryPushOffSaleIds.includes(saleId);

/** An inquiry still worth telling about: there, New, and its buyer's details not cleared. Whether its thing still exists doesn't matter: the push names the thing as it was sent. */
export function isInquiryWaiting(inquiry: DocumentData | undefined): boolean {
  if (!inquiry || inquiry.status !== 'NEW') {
    return false;
  }

  const isCleared = ['name', 'email', 'phone', 'message'].every(
    (field) => inquiry[field] === null,
  );
  return !isCleared;
}

/** Whether a new or reopened inquiry is worth a push at all. */
export function isNewInterest(
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): boolean {
  if (!after || after.status !== 'NEW') {
    return false;
  }

  return !before || before.status !== 'NEW';
}

/** An item older than a day is no longer news. */
export const isItemFresh = (item: BundleItem, now: number) =>
  now - item.queuedAt <= MAX_ITEM_AGE_MS;

const groupBySale = (items: BundleItem[]) =>
  items.reduce<Map<string, BundleItem[]>>(
    (groups, item) =>
      groups.set(item.groupId, [...(groups.get(item.groupId) ?? []), item]),
    new Map(),
  );

const confirmSaleItems = async (
  firestore: Firestore,
  uid: string,
  saleId: string,
  items: BundleItem[],
  person: DocumentData | undefined,
) => {
  const sale = await firestore.doc(`apps/going-once/sales/${saleId}`).get();
  if (!isSaleListening(sale.data(), uid) || isPushOff(person, saleId)) {
    return [];
  }

  const inquiries = await firestore.getAll(
    ...items.map((item) =>
      firestore.doc(`apps/going-once/sales/${saleId}/inquiries/${item.key}`),
    ),
  );
  return items.filter((_, index) => isInquiryWaiting(inquiries[index].data()));
};

export const goingOnceBundleHooks: BundleHooks = {
  async confirmItems(firestore, uid, items) {
    const person = (
      await firestore.doc(`apps/going-once/people/${uid}`).get()
    ).data();
    const kept = await Promise.all(
      [
        ...groupBySale(items.filter((item) => isItemFresh(item, Date.now()))),
      ].map(([saleId, saleItems]) =>
        confirmSaleItems(firestore, uid, saleId, saleItems, person),
      ),
    );
    return kept.flat();
  },

  summarize(items, { isOvernight }) {
    const newestFirst = [...items].sort(
      (first, second) => second.queuedAt - first.queuedAt,
    );
    const [newest] = newestFirst;
    const open = `${newest.groupLabel} · Open your inbox to reply.`;
    if (items.length === 1) {
      return {
        title: `New interest in ${newest.label}`,
        body: open,
        url: newest.url,
      };
    }

    const count = `${items.length} new inquiries${isOvernight ? ' overnight' : ''}`;
    const more = `${newest.label} and ${items.length - 1} more`;
    const sales = [...new Set(newestFirst.map((item) => item.groupId))];
    if (sales.length === 1) {
      return {
        title: `${count} · ${more}`,
        body: open,
        url: getNewListUrl(newest.groupId),
      };
    }

    const names = [...new Set(newestFirst.map((item) => item.groupLabel))];
    const where =
      names.length <= 2
        ? names.join(' and ')
        : `${names[0]} and ${names.length - 1} more`;
    return {
      title: `${count} in ${where}`,
      body: `${more} · Open Going Once to reply.`,
      url: YOUR_SALES_URL,
    };
  },
};

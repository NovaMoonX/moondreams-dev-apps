import { FINISHED_SALE_STATUS, isRecord } from './salePageView.js';

export const OPEN_SALE_STATUS = 'OPEN';

/** How long after a sale is finished its buyers' details are cleared. */
export const CONTACT_CLEAR_DELAY_MS = 30 * 86_400_000;

export const INQUIRY_CONTACT_FIELDS = [
  'name',
  'email',
  'phone',
  'message',
] as const;

export type FinishAction = 'finish' | 'reopen';

export type Patch = Record<string, unknown>;

export type FinishPlan =
  { isOk: true; fields: Patch } | { isOk: false; message: string };

const readStatus = (sale: unknown) =>
  isRecord(sale) && sale.status === FINISHED_SALE_STATUS
    ? FINISHED_SALE_STATUS
    : OPEN_SALE_STATUS;

/** What a finish or a reopen writes to the sale, or the sentence that says why it can't run now. A missing status reads as open. */
export function planFinish(
  sale: unknown,
  action: FinishAction,
  uid: string,
  now: number,
): FinishPlan {
  const isFinished = readStatus(sale) === FINISHED_SALE_STATUS;
  if (action === 'finish') {
    return isFinished
      ? { isOk: false, message: 'Already finished.' }
      : {
          isOk: true,
          fields: {
            status: FINISHED_SALE_STATUS,
            finishedAt: now,
            finishedBy: uid,
            contactsClearAt: now + CONTACT_CLEAR_DELAY_MS,
            contactsClearedAt: null,
          },
        };
  }

  return isFinished
    ? {
        isOk: true,
        fields: {
          status: OPEN_SALE_STATUS,
          finishedAt: null,
          finishedBy: null,
          contactsClearAt: null,
        },
      }
    : { isOk: false, message: 'Already open.' };
}

/** A finished sale whose clearing day has come. */
export const isDueForClearing = (sale: unknown, now: number): boolean =>
  isRecord(sale) &&
  sale.status === FINISHED_SALE_STATUS &&
  typeof sale.contactsClearAt === 'number' &&
  sale.contactsClearAt <= now;

/** Decided on the contact fields themselves, never on `contactClearedAt`: a resend writes that back to null with new details. */
export const isInquiryCleared = (inquiry: unknown): boolean =>
  isRecord(inquiry) &&
  INQUIRY_CONTACT_FIELDS.every((field) => inquiry[field] === null);

/** What clearing an inquiry writes, or `null` when it is already clear. */
export const scrubInquiry = (inquiry: unknown, now: number): Patch | null =>
  isInquiryCleared(inquiry)
    ? null
    : {
        name: null,
        email: null,
        phone: null,
        message: null,
        contactClearedAt: now,
      };

const hasBuyerName = (record: unknown) =>
  isRecord(record) && typeof record.buyerName === 'string';

const withoutBuyerName = (record: unknown) =>
  hasBuyerName(record) ? { ...(record as Patch), buyerName: null } : record;

/** What clearing a thing writes: the buyer's name out of its hold, its sale record and its history, and nothing else; `null` when none holds one. */
export function scrubItem(item: unknown): Patch | null {
  if (!isRecord(item)) {
    return null;
  }

  const history: unknown[] = Array.isArray(item.statusHistory)
    ? item.statusHistory
    : [];
  const patch: Patch = {
    ...(hasBuyerName(item.pending)
      ? { pending: withoutBuyerName(item.pending) }
      : {}),
    ...(hasBuyerName(item.sale) ? { sale: withoutBuyerName(item.sale) } : {}),
    ...(history.some(hasBuyerName)
      ? { statusHistory: history.map(withoutBuyerName) }
      : {}),
  };
  return Object.keys(patch).length === 0 ? null : patch;
}

/** What the sale carries once its details are cleared; written last, so a run that stopped halfway is finished by the next. */
export const clearedSaleFields = (now: number): Patch => ({
  contactsClearAt: null,
  contactsClearedAt: now,
});

import {
  formatDateShort,
  formatDateShortUTC,
  formatTime,
} from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import {
  PAYMENT_METHOD_LABELS,
  type STATUS_VIEWS,
} from '@apps/going-once/constants';
import type {
  Item,
  ItemSaleRecord,
  ItemStatus,
  StatusChange,
} from '@apps/going-once/types';

export type StatusView = (typeof STATUS_VIEWS)[number];

export type ThingOffer = 'FINISH' | 'MARK_PENDING' | 'MARK_SOLD' | 'PUT_BACK';

/** The drawer's one primary for a thing: the next step in its life, or finishing it first while buyers can't see it. */
export function getThingOffer(
  status: ItemStatus,
  isListed: boolean,
): ThingOffer | null {
  if (status === 'WITHDRAWN') return 'PUT_BACK';
  if (status === 'SOLD') return null;
  if (status === 'PENDING') return 'MARK_SOLD';
  return isListed ? 'MARK_PENDING' : 'FINISH';
}

const pickupDayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  timeZone: 'UTC',
});

/** "Sat, Nov 7" for a date-only pickup day. */
export const formatPickupDay = (pickupOn: number) =>
  pickupDayFormatter.format(new Date(pickupOn));

export const formatPickupWeekday = (pickupOn: number) =>
  weekdayFormatter.format(new Date(pickupOn));

/** Sold for less than the floor price; derived, never stored. */
export const isUnderFloor = (
  item: Pick<Item, 'floorPriceCents' | 'sale'>,
): boolean =>
  item.sale !== null &&
  item.floorPriceCents !== null &&
  item.sale.priceCents < item.floorPriceCents;

const joinParts = (parts: (string | null)[]) =>
  parts.filter((part) => part !== null).join(' · ');

const getSoldParts = (sale: ItemSaleRecord) => [
  formatCentsShort(sale.priceCents),
  sale.method === null ? null : PAYMENT_METHOD_LABELS[sale.method],
  formatDateShortUTC(sale.soldOn),
];

/** What follows the status word in a sticker line: "for Nate · pickup Sat, Nov 7", "$170 · Venmo · Oct 31". A row names the pickup day by its weekday. */
export function getStatusFacts(
  item: Pick<Item, 'status' | 'pending' | 'sale'>,
  isShort = false,
): string {
  const { pending, sale } = item;
  if (item.status === 'PENDING' && pending !== null)
    return joinParts([
      pending.buyerName === null ? null : `for ${pending.buyerName}`,
      pending.pickupOn === null
        ? null
        : `pickup ${(isShort ? formatPickupWeekday : formatPickupDay)(pending.pickupOn)}`,
    ]);
  if (item.status === 'SOLD' && sale !== null)
    return joinParts(getSoldParts(sale));
  return '';
}

/** Why a view opened for one status can't go on once the live thing has moved to another; `null` while the status is still one it expects. */
export function describeMovedOn(
  item: Pick<Item, 'status' | 'sale'>,
  expected: ItemStatus[],
): string | null {
  if (expected.includes(item.status)) return null;
  if (item.status === 'SOLD')
    return `This was just marked sold for ${formatCentsShort(item.sale?.priceCents ?? 0)}.`;
  if (item.status === 'PENDING') return 'This was just marked pending.';
  if (item.status === 'WITHDRAWN') return 'This was just taken off the list.';
  return 'This is available again.';
}

/** "of $245 asked": what the sold things were asking beside what was collected. */
export const formatOfAsked = (askedCents: number) =>
  `of ${formatCentsShort(askedCents)} asked`;

/** "Collected $225 of $245 asked". */
export const formatCollected = (collectedCents: number, askedCents: number) =>
  `Collected ${formatCentsShort(collectedCents)} ${formatOfAsked(askedCents)}`;

/** "Collected goes from $225 to $215". */
export const formatCollectedChange = (fromCents: number, toCents: number) =>
  `Collected goes from ${formatCentsShort(fromCents)} to ${formatCentsShort(toCents)}`;

const describePendingChange = (change: StatusChange) => {
  const when =
    change.pickupOn === null
      ? null
      : `pickup ${formatPickupWeekday(change.pickupOn)}`;
  if (change.buyerName !== null)
    return joinParts([`Held for ${change.buyerName}`, when]);
  return joinParts([when === null ? 'Marked pending' : 'Held', when]);
};

const describeHoldChange = (change: StatusChange) => {
  const hold = [
    change.buyerName,
    change.pickupOn === null ? null : formatPickupWeekday(change.pickupOn),
  ]
    .filter((part) => part !== null)
    .join(', ');
  return `Changed the hold: ${hold === '' ? 'no name or day' : hold}`;
};

/** What a history row says happened. */
export function describeStatusChange(change: StatusChange): string {
  const paid =
    change.priceCents === null ? null : formatCentsShort(change.priceCents);
  const was =
    change.fromPriceCents === null
      ? null
      : formatCentsShort(change.fromPriceCents);
  if (change.kind === 'MARK_PENDING') return describePendingChange(change);
  if (change.kind === 'CHANGE_HOLD') return describeHoldChange(change);
  if (change.kind === 'MARK_SOLD')
    return paid === null ? 'Sold' : `Sold for ${paid}`;
  if (change.kind === 'CHANGE_PAID')
    return `Changed what was paid ${was ?? ''} → ${paid ?? ''}`;
  if (change.kind === 'NOT_SOLD')
    return was === null ? 'Not sold after all' : `Sale of ${was} undone`;
  if (change.kind === 'RESTORE_SALE')
    return paid === null ? 'Sale restored' : `Sale of ${paid} restored`;
  if (change.kind === 'TAKE_OFF') return 'Taken off the list';
  if (change.kind === 'PUT_BACK') return 'Put back on the list';
  return 'Back to available';
}

/** "Oct 31, 6:20 PM": an instant in the viewer's time zone. */
export const formatChangeTime = (at: number) =>
  `${formatDateShort(at)}, ${formatTime(at)}`;

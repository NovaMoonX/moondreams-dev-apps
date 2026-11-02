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

/** What follows the status word in the drawer's sticker line: "for Nate · pickup Sat, Nov 7", "$170 · Venmo · Oct 31". */
export function getStatusFacts(
  item: Pick<Item, 'status' | 'pending' | 'sale'>,
): string {
  const { pending, sale } = item;
  if (item.status === 'PENDING' && pending !== null)
    return joinParts([
      pending.buyerName === null ? null : `for ${pending.buyerName}`,
      pending.pickupOn === null
        ? null
        : `pickup ${formatPickupDay(pending.pickupOn)}`,
    ]);
  if (item.status === 'SOLD' && sale !== null)
    return joinParts(getSoldParts(sale));
  return '';
}

/** The muted line of a row that is Pending, Sold or taken off the list; empty for an Available one. */
export function getStatusRowLine(
  item: Pick<
    Item,
    'status' | 'pending' | 'sale' | 'askingPriceCents' | 'floorPriceCents'
  >,
): string {
  const { pending, sale } = item;
  if (item.status === 'WITHDRAWN') return 'Taken off the list';
  if (item.status === 'PENDING') {
    const line = joinParts([
      pending?.buyerName ? `For ${pending.buyerName}` : null,
      pending?.pickupOn
        ? `pickup ${formatPickupWeekday(pending.pickupOn)}`
        : null,
    ]);
    return line === '' ? 'Waiting on pickup' : line;
  }
  if (item.status === 'SOLD' && sale !== null)
    return joinParts([
      item.askingPriceCents !== null &&
      item.askingPriceCents !== sale.priceCents
        ? `Asked ${formatCentsShort(item.askingPriceCents)}`
        : null,
      sale.method === null ? null : PAYMENT_METHOD_LABELS[sale.method],
      formatDateShortUTC(sale.soldOn),
      isUnderFloor(item) ? 'Sold under your floor price' : null,
    ]);
  return '';
}

export interface StatusFigures {
  count: number;
  askedCents: number;
  collectedCents: number;
}

export type StatusSummary = Record<StatusView, StatusFigures>;

/** Counts and sums for the three views in one pass; taken-off things are in none of them. */
export function getStatusSummary(items: Item[]): StatusSummary {
  const empty = (): StatusFigures => ({
    count: 0,
    askedCents: 0,
    collectedCents: 0,
  });
  const summary: StatusSummary = {
    AVAILABLE: empty(),
    PENDING: empty(),
    SOLD: empty(),
  };
  items.forEach((item) => {
    if (item.status === 'WITHDRAWN') return;
    const figures = summary[item.status];
    figures.count += 1;
    figures.askedCents += item.askingPriceCents ?? 0;
    figures.collectedCents += item.sale?.priceCents ?? 0;
  });
  return summary;
}

/** The line under a view's rows: "$800 asked", "Collected $225 of $245 asked". */
export function formatStatusTotal(
  view: StatusView,
  summary: StatusSummary,
): string {
  const { askedCents, collectedCents } = summary[view];
  if (view === 'SOLD')
    return `Collected ${formatCentsShort(collectedCents)} of ${formatCentsShort(askedCents)} asked`;
  return `${formatCentsShort(askedCents)} asked`;
}

/** "Collected goes from $225 to $215". */
export const formatCollectedChange = (fromCents: number, toCents: number) =>
  `Collected goes from ${formatCentsShort(fromCents)} to ${formatCentsShort(toCents)}`;

/** What a history row says happened. */
export function describeStatusChange(change: StatusChange): string {
  if (change.status === 'SOLD') {
    if (change.priceCents === null) return 'Sold';
    if (change.fromPriceCents !== null)
      return `Changed what was paid ${formatCentsShort(change.fromPriceCents)} → ${formatCentsShort(change.priceCents)}`;
    return `Sold for ${formatCentsShort(change.priceCents)}`;
  }
  if (change.status === 'PENDING') return 'Marked pending';
  if (change.status === 'WITHDRAWN') return 'Taken off the list';
  return 'Back to available';
}

/** "Oct 31, 6:20 PM": an instant in the viewer's time zone. */
export const formatChangeTime = (at: number) =>
  `${formatDateShort(at)}, ${formatTime(at)}`;

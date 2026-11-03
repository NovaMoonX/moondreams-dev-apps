import { formatDateShort, formatTime } from '@/utils/formatUtils';
import { MAX_ITEM_TITLE_LENGTH } from '@apps/going-once/constants';
import type { Inquiry, Item } from '@apps/going-once/types';

const DAY_MS = 86_400_000;

const startOfDay = (at: number) => {
  const date = new Date(at);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
};

const keepTogether = (text: string) => text.replace(/\s/g, '\u00a0');

/** When an inquiry was sent, the way a message list says it: the time today, "Yesterday", else the day. Its spaces never break, so a muted line wraps before the date, never inside it. */
export function formatSentAt(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days <= 0) return keepTogether(formatTime(at));
  if (days === 1) return 'Yesterday';
  return keepTogether(formatDateShort(at));
}

/** The thing an inquiry is about, as its row names it: the title it had when sent, then "(Pending)", "(Sold)" or "(No longer listed)" when that is true now. */
export function describeInquiryThing(
  inquiry: Inquiry,
  items: Item[],
  areItemsKnown: boolean,
): string {
  const title =
    inquiry.itemTitleAtSend === '' ? 'A thing' : inquiry.itemTitleAtSend;
  const item = items.find((candidate) => candidate.id === inquiry.itemId);
  if (item === undefined)
    return areItemsKnown ? `${title} (No longer listed)` : title;
  if (item.status === 'PENDING') return `${title} (Pending)`;
  if (item.status === 'SOLD') return `${title} (Sold)`;
  return title;
}

/** Who asked: the name, or "A buyer asked about Gray sofa" once the sale's contacts have been cleared. */
export const getInquirerName = (inquiry: Inquiry, thing: string) =>
  inquiry.contactClearedAt === null
    ? (inquiry.name ?? 'A buyer')
    : `A buyer asked about ${thing}`;

/** The message the interest form starts with, from the title as the server keeps it; a thing someone is already picking up asks in case it falls through. */
export const toPrefilledMessage = (title: string, isPending = false) => {
  const name = title.trim().slice(0, MAX_ITEM_TITLE_LENGTH);
  return isPending
    ? `Hi! If the ${name} falls through, I'm interested.`
    : `Hi! Is the ${name} still available?`;
};

/** Whether the message is just one the form starts with, so a row has nothing of the buyer's own to show. */
export const isPrefilledMessage = (inquiry: Inquiry) =>
  [false, true].some(
    (isPending) =>
      inquiry.message ===
      toPrefilledMessage(inquiry.itemTitleAtSend, isPending),
  );

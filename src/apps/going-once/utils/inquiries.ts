import { formatDateShort, formatTime } from '@/utils/formatUtils';
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

/** When an inquiry was sent, the way a message list says it: the time today, "Yesterday", else the day. */
export function formatSentAt(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days <= 0) return formatTime(at);
  if (days === 1) return 'Yesterday';
  return formatDateShort(at);
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

/** Who asked: the name, or "A buyer" once the sale's contacts have been cleared. */
export const getInquirerName = (inquiry: Inquiry) => inquiry.name ?? 'A buyer';

/** Whether the message is just the one the form starts with, so a row has nothing of the buyer's own to show. */
export const isPrefilledMessage = (inquiry: Inquiry) =>
  inquiry.message === `Hi! Is the ${inquiry.itemTitleAtSend} still available?`;

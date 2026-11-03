import { formatDateShort, formatTime } from '@/utils/formatUtils';
import { MAX_ITEM_TITLE_LENGTH } from '@apps/going-once/constants';
import type { Inquiry, Item, ItemPendingRecord } from '@apps/going-once/types';

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

/** Who asked: the name, or "A buyer" once the sale's contacts have been cleared. */
export const getInquirerName = (inquiry: Inquiry) => inquiry.name ?? 'A buyer';

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

const toNameKey = (name: string | null) => name?.trim().toLowerCase() ?? '';

/** Whether this inquiry is who the thing is held for. An older hold has no inquiry id, so it is matched by the name it kept. */
export function isHolder(
  pending: Pick<ItemPendingRecord, 'inquiryId' | 'buyerName'> | null,
  inquiry: Pick<Inquiry, 'id' | 'name'>,
): boolean {
  if (pending === null) return false;
  if (pending.inquiryId !== null) return pending.inquiryId === inquiry.id;
  const held = toNameKey(pending.buyerName);
  return held !== '' && held === toNameKey(inquiry.name);
}

/** What the buyer wrote of their own, or `null` when it is only the form's starting message. */
export function getOwnMessage(inquiry: Inquiry): string | null {
  const message = inquiry.message?.trim() ?? '';
  return message === '' || isPrefilledMessage(inquiry) ? null : message;
}

export interface AskerPill {
  /** The newest inquiry of this person. */
  id: string;
  /** Every inquiry the pill stands for. */
  inquiryIds: string[];
  name: string;
  label: string;
}

/** One pill per person who asked, newest first. Two inquiries under one name stay apart when their contacts differ, each with the time it was sent. */
export function getAskerPills(inquiries: Inquiry[], now: number): AskerPill[] {
  const named = inquiries
    .filter((inquiry) => toNameKey(inquiry.name) !== '')
    .sort((first, second) => second.createdAt - first.createdAt);
  const groups = named.reduce<Inquiry[][]>((found, inquiry) => {
    const key = (other: Inquiry) =>
      `${toNameKey(other.name)}|${other.phone ?? other.email ?? ''}`;
    const group = found.find((members) => key(members[0]) === key(inquiry));
    if (group === undefined) return [...found, [inquiry]];
    group.push(inquiry);
    return found;
  }, []);
  return groups.map((members) => {
    const [latest] = members;
    const name = (latest.name ?? '').trim();
    const isShared =
      groups.filter(
        (other) => toNameKey(other[0].name) === toNameKey(latest.name),
      ).length > 1;
    return {
      id: latest.id,
      inquiryIds: members.map((member) => member.id),
      name,
      label: isShared
        ? `${name} · ${formatSentAt(latest.createdAt, now)}`
        : name,
    };
  });
}

import { formatDateShort } from '@/utils/formatUtils';
import type { Sale } from '@apps/going-once/types';

const DAY_MS = 86_400_000;

/** Buyers' details clear this long after a sale is finished; the functions hold the same 30 days. */
export const CONTACT_CLEAR_DAYS = 30;

/** "Finished Nov 2 · buyers' details clear Dec 2", or "cleared Dec 2" once they have been; the one line Your sales and the Sale tab share. */
export function describeFinished(
  sale: Pick<Sale, 'finishedAt' | 'contactsClearAt' | 'contactsClearedAt'>,
): string {
  if (sale.finishedAt === null) return 'Finished';
  const finished = `Finished ${formatDateShort(sale.finishedAt)}`;
  if (sale.contactsClearedAt !== null)
    return `${finished} · buyers' details cleared ${formatDateShort(sale.contactsClearedAt)}`;
  if (sale.contactsClearAt !== null)
    return `${finished} · buyers' details clear ${formatDateShort(sale.contactsClearAt)}`;
  return finished;
}

/** What is left, for the Finish confirm: "2 things didn't sell and 1 is still pending." */
export function describeLeftover(unsold: number, pending: number): string {
  const didNotSell = `${unsold} ${unsold === 1 ? 'thing' : 'things'} didn't sell`;
  const isPending = `${pending} ${pending === 1 ? 'is' : 'are'} still pending`;
  if (unsold > 0 && pending > 0) return `${didNotSell} and ${isPending}.`;
  if (unsold > 0) return `${didNotSell}.`;
  if (pending > 0)
    return `${pending} ${pending === 1 ? 'thing is' : 'things are'} still pending.`;
  return 'Nothing is left to sell.';
}

/** The day buyers' details would clear if the sale were finished at `now`. */
export const getClearDay = (now: number) =>
  formatDateShort(now + CONTACT_CLEAR_DAYS * DAY_MS);

/** A record as it may be written: once a sale's details are cleared nothing writes a buyer's name back, since no job clears it again. */
export const withoutBuyerName = <T extends { buyerName: string | null }>(
  record: T | null,
  isCleared: boolean,
): T | null =>
  record === null || !isCleared ? record : { ...record, buyerName: null };

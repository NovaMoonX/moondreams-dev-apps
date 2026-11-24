import type {
  EmailEventRead,
  EmailFilterRead,
} from '@apps/runway/hooks/useEmailPurchases';
import type { EmailSenderKind } from '@apps/runway/types';

export interface EmailSender {
  address: string;
  name: string | null;
  kind: EmailSenderKind;
  count: number;
  lastAt: number;
  hasPurchase: boolean;
}

export interface EmailSenderGroup {
  kind: EmailSenderKind;
  senders: EmailSender[];
}

const KIND_ORDER: EmailSenderKind[] = ['bank', 'store', 'other'];

/** A sender's lowercase address and, when the header had one, the name beside it ("Chase <alerts@chase.com>"). */
export function readSender(from: string): {
  address: string;
  name: string | null;
} {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(from);
  if (match === null) return { address: from.trim().toLowerCase(), name: null };
  return {
    address: match[2].trim().toLowerCase(),
    name: match[1].trim() || null,
  };
}

const isKindRead = (event: EmailEventRead) =>
  event.senderKind !== null &&
  event.outcome !== 'unread' &&
  event.outcome !== 'filtered';

/** The kind of a sender's newest email that was judged; with none (older events), a sender that ever became a purchase was a bank's and any other was not money. */
const readKind = (newestFirst: EmailEventRead[]): EmailSenderKind =>
  newestFirst.find(isKindRead)?.senderKind ??
  (newestFirst.some((event) => event.outcome === 'purchase')
    ? 'bank'
    : 'other');

/** Every sender that reached the address, grouped by the kind of its newest judged email, newest sender first; a forwarding confirmation is setup, not a sender, and a kind with no senders is left out. */
export function groupEmailSenders(
  events: EmailEventRead[],
): EmailSenderGroup[] {
  const byAddress = events
    .filter((event) => event.from !== '' && event.outcome !== 'confirm')
    .sort((a, b) => b.receivedAt - a.receivedAt)
    .reduce((found, event) => {
      const { address } = readSender(event.from);
      found.set(address, [...(found.get(address) ?? []), event]);
      return found;
    }, new Map<string, EmailEventRead[]>());
  const senders = [...byAddress.entries()].map(
    ([address, newestFirst]): EmailSender => ({
      address,
      name:
        newestFirst
          .map((event) => readSender(event.from).name)
          .find((name) => name !== null) ?? null,
      kind: readKind(newestFirst),
      count: newestFirst.length,
      lastAt: newestFirst[0].receivedAt,
      hasPurchase: newestFirst.some((event) => event.outcome === 'purchase'),
    }),
  );
  return KIND_ORDER.map((kind) => ({
    kind,
    senders: senders
      .filter((sender) => sender.kind === kind)
      .sort((a, b) => b.lastAt - a.lastAt),
  })).filter((group) => group.senders.length > 0);
}

/** Whether a filter already drops everything from an address: it names the address and sets nothing else. */
export const isSenderFiltered = (filters: EmailFilterRead[], address: string) =>
  filters.some(
    (filter) =>
      filter.fromAddress !== null &&
      readSender(filter.fromAddress).address === address &&
      filter.subjectTemplate === null &&
      filter.subjectContains.length === 0 &&
      filter.bodyContains.length === 0,
  );

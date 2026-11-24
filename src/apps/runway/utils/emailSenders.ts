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

/** An older event has no kind: one that became a purchase was a bank's, any other was not money. */
const readKind = (event: EmailEventRead): EmailSenderKind =>
  event.senderKind ?? (event.outcome === 'purchase' ? 'bank' : 'other');

/** Every sender that reached the address, grouped by the kind of its newest email, newest sender first; a forwarding confirmation is setup, not a sender, and a kind with no senders is left out. */
export function groupEmailSenders(
  events: EmailEventRead[],
): EmailSenderGroup[] {
  const bySender = events
    .filter((event) => event.from !== '' && event.outcome !== 'confirm')
    .reduce((found, event) => {
      const { address, name } = readSender(event.from);
      const sender = found.get(address);
      if (sender === undefined) {
        found.set(address, {
          address,
          name,
          kind: readKind(event),
          count: 1,
          lastAt: event.receivedAt,
          hasPurchase: event.outcome === 'purchase',
        });
        return found;
      }
      const isNewer = event.receivedAt > sender.lastAt;
      found.set(address, {
        ...sender,
        name: isNewer ? (name ?? sender.name) : (sender.name ?? name),
        kind: isNewer ? readKind(event) : sender.kind,
        count: sender.count + 1,
        lastAt: Math.max(sender.lastAt, event.receivedAt),
        hasPurchase: sender.hasPurchase || event.outcome === 'purchase',
      });
      return found;
    }, new Map<string, EmailSender>());
  return KIND_ORDER.map((kind) => ({
    kind,
    senders: [...bySender.values()]
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

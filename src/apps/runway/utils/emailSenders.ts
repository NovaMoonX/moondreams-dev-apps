import type {
  EmailEventRead,
  EmailFilterRead,
} from '@apps/runway/hooks/useEmailPurchases';
import { toComparable } from '@/utils/optionMatchUtils';
import type { EmailSenderKind } from '@apps/runway/types';

export interface EmailSender {
  address: string;
  name: string | null;
  kind: EmailSenderKind;
  count: number;
  lastAt: number;
  hasPurchase: boolean;
  logo: string | null;
  company: string | null;
}

/** The bank link a purchase's card or account sits on, with that bank's name and logo; null when it is on none, undefined when the purchase isn't loaded. */
export type PurchaseBankLink = (
  purchaseId: string,
) => { linkId: string; name: string; logo: string | null } | null | undefined;

const MIN_LINKED_PURCHASES = 2;

const isSameBank = (company: string, linkName: string) => {
  const a = toComparable(company);
  const b = toComparable(linkName);
  return a !== '' && b !== '' && (a.includes(b) || b.includes(a));
};

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

/** A sender's newest logo, else for a bank with a name the sender's own address vouched for, the linked bank's: only when at least two loaded purchases from its emails all sit on one link that bank's name matches. */
const readLogo = (
  newestFirst: EmailEventRead[],
  kind: EmailSenderKind,
  company: string | null,
  bankLinkOf: PurchaseBankLink,
) => {
  const own = newestFirst.find(
    (event) => event.senderLogo !== null,
  )?.senderLogo;
  if (own !== undefined) return own;
  if (kind !== 'bank' || company === null) return null;
  const links = newestFirst.flatMap((event) => {
    const link =
      event.purchaseId === null ? undefined : bankLinkOf(event.purchaseId);
    return link === undefined ? [] : [link];
  });
  const first = links[0];
  return links.length >= MIN_LINKED_PURCHASES &&
    first !== null &&
    isSameBank(company, first.name) &&
    links.every((link) => link?.linkId === first.linkId)
    ? first.logo
    : null;
};

/** Every sender that reached the address, grouped by the kind of its newest judged email, newest sender first; a forwarding confirmation is setup, not a sender, and a kind with no senders is left out. */
export function groupEmailSenders(
  events: EmailEventRead[],
  bankLinkOf: PurchaseBankLink = () => undefined,
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
    ([address, newestFirst]): EmailSender => {
      const kind = readKind(newestFirst);
      const company =
        newestFirst.find((event) => event.senderCompany !== null)
          ?.senderCompany ?? null;
      return {
        address,
        name:
          newestFirst
            .map((event) => readSender(event.from).name)
            .find((name) => name !== null) ?? null,
        kind,
        count: newestFirst.length,
        lastAt: newestFirst[0].receivedAt,
        hasPurchase: newestFirst.some((event) => event.outcome === 'purchase'),
        logo: readLogo(newestFirst, kind, company, bankLinkOf),
        company,
      };
    },
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

export const splitAddressForWrap = (address: string, prefix = '') =>
  address.split(
    new RegExp(`${prefix === '' ? '' : `(?<=^${prefix})|`}(?<=@)|(?=\\.)`),
  );

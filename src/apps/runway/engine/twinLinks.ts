import type { OpenLink } from '@apps/runway/types';

interface AccountLike {
  name: string;
  mask: string | null;
}

const toBankKey = (value: string) => value.toLowerCase().replace(/\s+/g, '');

/** What tells one bank account apart across sign-ins: its name and mask. Null without a mask. Kept in step with the server's copy. */
export const toAccountKey = (account: AccountLike) =>
  account.mask === null || account.mask === ''
    ? null
    : `${account.mask}|${account.name.trim().replace(/\s+/g, ' ').toLowerCase()}`;

const isFinished = (link: OpenLink) =>
  link.providerAccounts.some(
    (entry) =>
      entry.accountId !== null || entry.cardId !== null || entry.isSkipped,
  );

/** Whether a link at a bank already holds one of these accounts: the same login signed in again, not a second login at the same bank. */
export function isTwinLink(
  link: Pick<OpenLink, 'institutionName' | 'providerAccounts'>,
  institutionName: string,
  accounts: readonly AccountLike[],
) {
  if (toBankKey(link.institutionName) !== toBankKey(institutionName)) {
    return false;
  }
  const held = new Set(
    link.providerAccounts.map(toAccountKey).filter((key) => key !== null),
  );
  return accounts.some((account) => {
    const key = toAccountKey(account);
    return key !== null && held.has(key);
  });
}

/** The person's finished, still-linked sign-in that already holds one of these accounts, or null. */
export const findTwinLink = (
  links: readonly OpenLink[],
  institutionName: string,
  accounts: readonly AccountLike[],
) =>
  links.find(
    (link) =>
      link.status !== 'revoked' &&
      isFinished(link) &&
      isTwinLink(link, institutionName, accounts),
  ) ?? null;

/** Another finished, still-linked sign-in holding the same accounts as this one, which the two can be combined with; null when there is none. */
export const findTwinOf = (link: OpenLink, links: readonly OpenLink[]) =>
  link.status === 'revoked' || !isFinished(link)
    ? null
    : findTwinLink(
        links.filter((entry) => entry.id !== link.id),
        link.institutionName,
        link.providerAccounts,
      );

type ProviderRow = OpenLink['providerAccounts'][number];

const isPlaced = (row: ProviderRow) =>
  row.accountId !== null || row.cardId !== null;

/** Whether every placed account of `drop` matches exactly one account of `keep` that is not placed elsewhere. Mirrors the server's combine plan. */
const canFold = (keep: OpenLink, drop: OpenLink) =>
  drop.providerAccounts.filter(isPlaced).every((row) => {
    const key = toAccountKey(row);
    const matches =
      key === null
        ? []
        : keep.providerAccounts.filter((entry) => toAccountKey(entry) === key);
    return matches.length === 1 && !isPlaced(matches[0]);
  });

/** Whether two twin sign-ins can become one without losing a placed account: false when each brought in its own copy of the same account. */
export const canCombine = (a: OpenLink, b: OpenLink) =>
  canFold(a, b) || canFold(b, a);

import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';

import { LINK_WORDS } from '@apps/runway/constants';
import type { LinkChoice } from '@apps/runway/engine/linkMatch';
import { createAccount } from '@apps/runway/store/actions/accountActions';
import { createCard } from '@apps/runway/store/actions/cardActions';
import type {
  AccountKind,
  Cents,
  NormalizedAccount,
  RunwayEncryption,
} from '@apps/runway/types';

export interface LinkSession {
  linkId: string;
  institutionName: string;
  accounts: NormalizedAccount[];
}

interface AttachChoice {
  providerAccountId: string;
  accountId: string | null;
  cardId: string | null;
}

interface AttachResult {
  attached: number;
  balances: { targetId: string; cents: Cents }[];
}

const createSessionCallable = httpsCallable<
  Record<string, never>,
  { linkToken: string }
>(functions, 'createRunwayLinkSession');
const exchangeCallable = httpsCallable<
  { publicToken: string; institutionName: string | null },
  LinkSession
>(functions, 'exchangeRunwayLink');
const attachCallable = httpsCallable<
  { linkId: string; choices: AttachChoice[] },
  AttachResult
>(functions, 'attachRunwayAccounts');

/** Asks for a one-time token for the bank's window. */
export async function createLinkSession(): Promise<string> {
  const response = await createSessionCallable({});
  return response.data.linkToken;
}

/** Trades what the bank's window handed back for the accounts the bank sent; Functions keep the grant, never the browser. */
export async function exchangeLink(
  publicToken: string,
  institutionName: string | null,
): Promise<LinkSession> {
  const response = await exchangeCallable({ publicToken, institutionName });
  return response.data;
}

const toAccountKind = (subtype: string | null): AccountKind => {
  const text = (subtype ?? '').toLowerCase();
  if (text.includes('saving')) return 'savings';
  if (text.includes('cash')) return 'cashManagement';
  return 'checking';
};

/**
 * Makes a card or account for each "Add as new" row from the bank's name, kind and mask (the bank's name is the
 * issuer or institution), then binds every picked row in one call. A row left out is sent with both ids null.
 */
export async function linkChosenAccounts(
  uid: string,
  encryption: RunwayEncryption,
  session: LinkSession,
  choices: readonly LinkChoice[],
): Promise<AttachResult & { sent: AttachChoice[] }> {
  const sent = await Promise.all(
    session.accounts.map(async (entry, index): Promise<AttachChoice> => {
      const choice = choices[index] ?? { kind: 'skip' };
      const base = {
        providerAccountId: entry.providerAccountId,
        accountId: null,
        cardId: null,
      };
      if (choice.kind === 'skip') return base;
      if (choice.kind === 'existing') {
        return choice.target === 'card'
          ? { ...base, cardId: choice.id }
          : { ...base, accountId: choice.id };
      }
      if (entry.kind === 'credit') {
        const cardId = await createCard(
          uid,
          encryption,
          {
            issuer: session.institutionName,
            name: entry.name,
            dueDay: null,
            lastFour: entry.mask,
            payFromAccountId: null,
            owedCents: 0,
          },
          LINK_WORDS.newCardSummary(entry.name),
        );
        return { ...base, cardId };
      }
      const accountId = await createAccount(uid, encryption, {
        name: entry.name,
        institution: session.institutionName,
        kind: toAccountKind(entry.subtype),
        countedTowardTotal: true,
        isPullAccount: false,
        lastFour: entry.mask,
        balanceCents: null,
        balanceOn: null,
        holds: [],
      });
      return { ...base, accountId };
    }),
  );
  const response = await attachCallable({
    linkId: session.linkId,
    choices: sent,
  });
  return { ...response.data, sent };
}

import { gcmDecrypt, gcmEncrypt } from '../../../appKeys/gcm.js';
import type { HelmKey } from '../helmKey.js';
import type { SyncedCopy } from '../syncedCopies.js';

export interface AliasBook {
  add: (id: string) => string;
  idOf: (alias: string) => string | null;
}

/** Short names for records so the model never sees a document id: t1, t2, … */
export function createAliasBook(prefix: string): AliasBook {
  const byAlias = new Map<string, string>();
  const byId = new Map<string, string>();
  return {
    add: (id) => {
      const known = byId.get(id);
      if (known) return known;
      const alias = `${prefix}${byId.size + 1}`;
      byId.set(id, alias);
      byAlias.set(alias, id);
      return alias;
    },
    idOf: (alias) => byAlias.get(alias) ?? null,
  };
}

const NONCE_BYTES = 12;

/** Aliases that carry the id itself, sealed under the person's key with the uid and prefix as AAD, so a later request opens them with no stored map and no id is ever shown. */
export function createSealedAliasBook(
  prefix: string,
  uid: string,
  key: HelmKey,
): AliasBook {
  const aad = Buffer.from(`${uid}|${prefix}`);
  return {
    add: (id) => {
      const { ciphertext, nonce } = gcmEncrypt(key.key, Buffer.from(id), aad);
      return `${prefix}${Buffer.concat([Buffer.from(nonce, 'base64'), Buffer.from(ciphertext, 'base64')]).toString('base64url')}`;
    },
    idOf: (alias) => {
      if (!alias.startsWith(prefix)) return null;
      try {
        const bytes = Buffer.from(alias.slice(prefix.length), 'base64url');
        if (bytes.length <= NONCE_BYTES) return null;
        return gcmDecrypt(
          key.key,
          bytes.subarray(NONCE_BYTES).toString('base64'),
          bytes.subarray(0, NONCE_BYTES).toString('base64'),
          aad,
        ).toString('utf8');
      } catch {
        return null;
      }
    },
  };
}

export interface ConnectionRef {
  connectorId: string;
  accountId: string;
  name: string;
  label: string | null;
}

export interface SyncedBook {
  add: (copy: SyncedCopy) => string;
  get: (alias: string) => SyncedCopy | null;
  addConnection: (connection: ConnectionRef) => string;
  getConnection: (alias: string) => ConnectionRef | null;
}

/** Aliases for synced copies: e1, e2, … for events and s1, s2, … for everything else a source shares; c1, c2, … for the connections themselves. */
export function createSyncedBook(): SyncedBook {
  const byAlias = new Map<string, SyncedCopy>();
  const byId = new Map<string, string>();
  const connections = new Map<string, ConnectionRef>();
  const connectionAliases = new Map<string, string>();
  return {
    add: (copy) => {
      const known = byId.get(copy.id);
      if (known) return known;
      const prefix = copy.kind === 'event' ? 'e' : 's';
      const alias = `${prefix}${[...byAlias.keys()].filter((name) => name.startsWith(prefix)).length + 1}`;
      byId.set(copy.id, alias);
      byAlias.set(alias, copy);
      return alias;
    },
    get: (alias) => byAlias.get(alias) ?? null,
    addConnection: (connection) => {
      const id = `${connection.connectorId}__${connection.accountId}`;
      const known = connectionAliases.get(id);
      if (known) return known;
      const alias = `c${connections.size + 1}`;
      connectionAliases.set(id, alias);
      connections.set(alias, connection);
      return alias;
    },
    getConnection: (alias) => connections.get(alias) ?? null,
  };
}

/** A record read from another app, split so the screen never has to parse a sentence: its name, a detail line and its amount as written. */
export interface QuoteRecord {
  name: string;
  detail: string | null;
  amount: string;
}

export interface QuoteEntry {
  alias: string;
  connectorId: string;
  accountId: string;
  ref: string;
  title: string;
  from: string;
  at: number | null;
  snippet: string;
  deepLink: string | null;
  record?: QuoteRecord;
}

export interface QuoteBook {
  add: (entry: Omit<QuoteEntry, 'alias'>) => string;
  get: (alias: string) => QuoteEntry | null;
}

/** Aliases for the results of a live search: q1, q2, … One alias per message or passage, however often it is found. */
export function createQuoteBook(): QuoteBook {
  const byAlias = new Map<string, QuoteEntry>();
  const byKey = new Map<string, string>();
  return {
    add: (entry) => {
      const key = `${entry.connectorId}|${entry.accountId}|${entry.ref}|${entry.snippet}`;
      const known = byKey.get(key);
      if (known) return known;
      const alias = `q${byAlias.size + 1}`;
      byKey.set(key, alias);
      byAlias.set(alias, { ...entry, alias });
      return alias;
    },
    get: (alias) => byAlias.get(alias) ?? null,
  };
}

export interface SearchedEntry {
  connectorId: string;
  accountId: string;
  label: string;
  at: number;
  found: number;
  failed: string | null;
}

export interface SearchedLog {
  record: (call: {
    connectorId: string;
    accountId: string;
    label: string;
    found: number;
    failure: string | null;
  }) => void;
  entries: () => SearchedEntry[];
}

/** Every live call of one answer, merged to one entry per account: results summed, the latest time, and a failure kept only while no call to it succeeded. */
export function createSearchedLog(now: () => number = Date.now): SearchedLog {
  const byAccount = new Map<
    string,
    {
      connectorId: string;
      accountId: string;
      label: string;
      at: number;
      found: number;
      successes: number;
      failure: string | null;
    }
  >();
  return {
    record: ({ connectorId, accountId, label, found, failure }) => {
      const key = `${connectorId}|${accountId}`;
      const previous = byAccount.get(key);
      byAccount.set(key, {
        connectorId,
        accountId,
        label,
        at: Math.max(previous?.at ?? 0, now()),
        found: (previous?.found ?? 0) + found,
        successes: (previous?.successes ?? 0) + (failure === null ? 1 : 0),
        failure: failure ?? previous?.failure ?? null,
      });
    },
    entries: () =>
      [...byAccount.values()].map(
        ({ connectorId, accountId, label, at, found, successes, failure }) => ({
          connectorId,
          accountId,
          label,
          at,
          found,
          failed: successes > 0 ? null : failure,
        }),
      ),
  };
}

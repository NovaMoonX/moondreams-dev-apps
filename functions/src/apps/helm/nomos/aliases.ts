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

export interface SyncedBook {
  add: (copy: SyncedCopy) => string;
  get: (alias: string) => SyncedCopy | null;
}

/** Aliases for synced copies: e1, e2, … for events and s1, s2, … for everything else a source shares. */
export function createSyncedBook(): SyncedBook {
  const byAlias = new Map<string, SyncedCopy>();
  const byId = new Map<string, string>();
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
  };
}

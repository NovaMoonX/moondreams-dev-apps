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

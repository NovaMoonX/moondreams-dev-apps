import type { ProviderAccountKind } from '@apps/runway/types';

export interface MatchRow {
  providerAccountId: string;
  kind: ProviderAccountKind;
  mask: string | null;
}

export interface MatchTarget {
  id: string;
  /** The issuer of a card or the institution of an account. */
  bank: string;
  lastFour?: string | null;
  linkId: string | null;
  archivedAt: number | null;
}

export type MatchTargetKind = 'card' | 'account';

/** What a row becomes: one of the person's own, a new one made from the bank's description, or left out. */
export type LinkChoice =
  | { kind: 'existing'; target: MatchTargetKind; id: string }
  | { kind: 'new' }
  | { kind: 'skip' };

interface MatchInput {
  institutionName: string;
  rows: readonly MatchRow[];
  cards: readonly MatchTarget[];
  accounts: readonly MatchTarget[];
  /** The card or account the person started from; preset on the first row of its kind. */
  startedFrom: { target: MatchTargetKind; id: string } | null;
}

const toBankKey = (value: string) => value.toLowerCase().replace(/\s+/g, '');

/** Which of the person's lists a bank's account kind belongs in; `other` belongs in neither. */
export function getTargetKind(
  kind: ProviderAccountKind,
): MatchTargetKind | null {
  if (kind === 'credit') return 'card';
  if (kind === 'depository') return 'account';
  return null;
}

/** A card or account is offered only while it is open and not already linked. */
export const isLinkable = (target: MatchTarget) =>
  target.linkId === null && target.archivedAt === null;

/** Presets each bank row by kind, then the unlinked one at that bank with its last four, else an unambiguous one there, else new. */
export function matchLinkRows(input: MatchInput): LinkChoice[] {
  const bankKey = toBankKey(input.institutionName);
  const offered = (target: MatchTargetKind) =>
    (target === 'card' ? input.cards : input.accounts).filter(isLinkable);

  const started = input.startedFrom;
  const startedTarget =
    started === null
      ? null
      : (offered(started.target).find((entry) => entry.id === started.id) ??
        null);
  const startedRows = input.rows.filter(
    (row) => started !== null && getTargetKind(row.kind) === started.target,
  );
  const startedRow =
    startedTarget === null
      ? null
      : (startedRows.find(
          (row) => row.mask !== null && row.mask === startedTarget.lastFour,
        ) ??
        startedRows[0] ??
        null);

  const isSameBank = (entry: MatchTarget) => toBankKey(entry.bank) === bankKey;
  const exact = input.rows.reduce<{
    ids: (string | null)[];
    used: ReadonlySet<string>;
  }>(
    (state, row) => {
      const kind = getTargetKind(row.kind);
      if (kind === null) return { ...state, ids: [...state.ids, null] };
      const id =
        startedTarget !== null && row === startedRow
          ? startedTarget.id
          : (offered(kind).find(
              (entry) =>
                entry.id !== startedTarget?.id &&
                !state.used.has(`${kind}:${entry.id}`) &&
                row.mask !== null &&
                entry.lastFour === row.mask &&
                isSameBank(entry),
            )?.id ?? null);
      return {
        ids: [...state.ids, id],
        used:
          id === null ? state.used : new Set([...state.used, `${kind}:${id}`]),
      };
    },
    { ids: [], used: new Set<string>() },
  );

  const result = input.rows.reduce<{
    choices: LinkChoice[];
    used: ReadonlySet<string>;
  }>(
    (state, row, index) => {
      const kind = getTargetKind(row.kind);
      if (kind === null) {
        return { ...state, choices: [...state.choices, { kind: 'skip' }] };
      }
      const atBank = offered(kind).filter(isSameBank);
      const id =
        exact.ids[index] ??
        atBank.find(
          (entry) =>
            entry.id !== startedTarget?.id &&
            !state.used.has(`${kind}:${entry.id}`) &&
            (!entry.lastFour || atBank.length === 1),
        )?.id ??
        null;
      if (id === null) {
        return { ...state, choices: [...state.choices, { kind: 'new' }] };
      }
      return {
        choices: [...state.choices, { kind: 'existing', target: kind, id }],
        used: new Set([...state.used, `${kind}:${id}`]),
      };
    },
    { choices: [], used: exact.used },
  );
  return result.choices;
}

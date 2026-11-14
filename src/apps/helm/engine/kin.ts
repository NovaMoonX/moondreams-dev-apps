import {
  KIN_KINDS,
  KIN_ORDERS,
  type KinKind,
  type KinOrder,
  type WhoKin,
} from '@apps/helm/engine/kinKinds';

export interface KinBirthday {
  month: number;
  day: number | null;
  year: number | null;
}

export interface KinWho {
  id: string;
  kin: WhoKin | null;
}

export type KinResolution =
  | { kind: 'one'; id: string }
  | { kind: 'many'; ids: string[] }
  | { kind: 'none' }
  | { kind: 'askOrder'; ids: string[]; shape: 'one' | 'several' | 'extreme' };

const toWord = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');

/** The family word as the fixed list knows it, or null: only an exact kind or its exact spoken or written words, so "bro", "mom" and "half-brother" are never taken. */
export const toKinKind = (value: unknown): KinKind | null => {
  if (typeof value !== 'string') return null;
  const word = toWord(value);
  return (
    KIN_KINDS.find(
      (entry) =>
        entry.kind.toLowerCase() === word.replace(/-/g, '') ||
        entry.written === word ||
        toWord(entry.spoken) === word,
    )?.kind ?? null
  );
};

export const canKinOrder = (kind: KinKind) =>
  KIN_KINDS.find((entry) => entry.kind === kind)?.canOrder === true;

/** A family word and its order from the model's words: the kind only from the list, the order only on a kind that can take one. Null when the kind is not on the list. */
export const normalizeKin = (value: unknown): WhoKin | null => {
  if (typeof value !== 'object' || value === null) return null;
  const { kind: rawKind, order: rawOrder } = value as Record<string, unknown>;
  const kind = toKinKind(rawKind);
  if (!kind) return null;
  const order = KIN_ORDERS.find((entry) => entry === rawOrder) ?? null;
  return { kind, order: order !== null && canKinOrder(kind) ? order : null };
};

/** Every kind a wanted kind stands for: itself and, for a general one, its gendered or step forms. */
const fitsKinds = (kind: KinKind): KinKind[] => [
  kind,
  ...(KIN_KINDS.find((entry) => entry.kind === kind)?.takes ?? []),
];

/** -1 when `a` was born before `b`, 1 when after, null when the years are missing or the days can't tell them apart. */
const compareBirths = (a: KinBirthday | null, b: KinBirthday | null) => {
  if (!a || !b || a.year === null || b.year === null) return null;
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day === null || b.day === null || a.day === b.day) return null;
  return a.day < b.day ? -1 : 1;
};

/** Whether a relative is older or younger than the self by their birth years alone, with the whole years between them; null when either year is missing or the two were born the same year. */
export const deriveKinGap = (
  relative: KinBirthday | null,
  self: KinBirthday | null,
): { side: 'older' | 'younger'; years: number } | null => {
  if (!relative || !self || relative.year === null || self.year === null) {
    return null;
  }
  const years = Math.abs(relative.year - self.year);
  return years === 0
    ? null
    : { side: relative.year < self.year ? 'older' : 'younger', years };
};

const pickResult = (ids: string[]): KinResolution =>
  ids.length === 1 ? { kind: 'one', id: ids[0] } : { kind: 'many', ids };

const isPairOrder = (order: KinOrder) =>
  order === 'older' || order === 'younger';

/** Whether a relative is older or younger than the self: the saved order first, then both birthdays with a year; null when neither can say. */
const relativeTo = (
  who: KinWho,
  self: KinBirthday | null,
  birthdays: Record<string, KinBirthday | null>,
): 'older' | 'younger' | null => {
  const saved = who.kin?.order ?? null;
  if (saved === 'older' || saved === 'younger') return saved;
  const compared = compareBirths(birthdays[who.id] ?? null, self);
  return compared === null ? null : compared < 0 ? 'older' : 'younger';
};

/** Which of the kind is the oldest or youngest: the saved order first, then every one's birthday with a year (the self's is not needed). */
const amongKind = (
  wanted: 'oldest' | 'youngest',
  candidates: KinWho[],
  birthdays: Record<string, KinBirthday | null>,
): KinResolution => {
  const saved = candidates.filter((who) => who.kin?.order === wanted);
  if (saved.length > 0) return pickResult(saved.map((who) => who.id));
  if (candidates.length === 1) return { kind: 'one', id: candidates[0].id };
  const sorted = candidates.every(
    (who) => (birthdays[who.id]?.year ?? null) !== null,
  )
    ? [...candidates].sort(
        (a, b) =>
          compareBirths(birthdays[a.id] ?? null, birthdays[b.id] ?? null) ?? 0,
      )
    : null;
  const edge = sorted
    ? wanted === 'oldest'
      ? [sorted[0], sorted[1]]
      : [sorted[sorted.length - 1], sorted[sorted.length - 2]]
    : null;
  const isClear =
    edge !== null &&
    compareBirths(
      birthdays[edge[0].id] ?? null,
      birthdays[edge[1].id] ?? null,
    ) !== null;
  return edge && isClear
    ? { kind: 'one', id: edge[0].id }
    : {
        kind: 'askOrder',
        ids: candidates.map((who) => who.id),
        shape: 'extreme',
      };
};

/** Which of the person's people "my younger brother" names, decided by code: the order the person said first, then birthdays that have a year, never a question about a birthday. */
export function resolveKin(
  ref: WhoKin,
  whos: KinWho[],
  birthdays: Record<string, KinBirthday | null>,
  selfWhoId: string | null,
): KinResolution {
  const kinds = fitsKinds(ref.kind);
  const candidates = whos.filter(
    (who) => who.id !== selfWhoId && who.kin && kinds.includes(who.kin.kind),
  );
  if (candidates.length === 0) return { kind: 'none' };
  if (ref.order === null) return pickResult(candidates.map((who) => who.id));
  if (ref.order === 'twin') {
    const twins = candidates.filter((who) => who.kin?.order === 'twin');
    return twins.length === 0
      ? { kind: 'none' }
      : pickResult(twins.map((who) => who.id));
  }
  if (!isPairOrder(ref.order))
    return amongKind(ref.order as 'oldest' | 'youngest', candidates, birthdays);
  const self = selfWhoId ? (birthdays[selfWhoId] ?? null) : null;
  const read = candidates.map((who) => ({
    id: who.id,
    side: relativeTo(who, self, birthdays),
  }));
  const fits = read.filter((entry) => entry.side === ref.order);
  if (fits.length > 0) return pickResult(fits.map((entry) => entry.id));
  const unknown = read.filter((entry) => entry.side === null);
  if (unknown.length > 0) {
    return {
      kind: 'askOrder',
      ids: unknown.map((entry) => entry.id),
      shape: unknown.length === 1 ? 'one' : 'several',
    };
  }
  return {
    kind: 'askOrder',
    ids: candidates.map((who) => who.id),
    shape: candidates.length === 1 ? 'one' : 'several',
  };
}

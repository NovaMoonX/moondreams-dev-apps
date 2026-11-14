import { openForHelm, type HelmKey } from '../helmKey.js';
import {
  isPrivateInEffect,
  readPrivacyFacts,
  type PrivacyFacts,
} from '../privacy.js';
import type { SealedPayload } from '../../../appKeys/seal.js';
import { MAX_CONTEXT_PEOPLE, type ContextPerson } from './buildContext.js';
import type { ByWho } from '../keyDateIndex.js';
import { normalizeKin, type KinBirthday } from './kin.js';
import { KIN_KINDS, type WhoKin } from './kinKinds.js';

export interface PersonRecord {
  id: string;
  isSelf: boolean;
  isPrivate: boolean;
  lastMentionedAt: number | null;
  words: {
    name: string;
    aliases: string[];
    relation: string | null;
    kin: unknown;
  };
}

export const toPrivateMark = (value: unknown): PrivacyFacts['privateMark'] =>
  value === 'health' || value === 'care' || value === 'person' ? value : null;

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/** A who document as the context reads it. Privacy comes from the sealed facts, as `readPeople` reads it: a who's mark is sealed, never a readable field. Null when it will not open. */
export const toPersonRecord = (
  key: HelmKey,
  doc: { id: string; get: (field: string) => unknown },
): PersonRecord | null => {
  try {
    const words = openForHelm(key, doc.get('sealed') as SealedPayload);
    if (typeof words.name !== 'string') return null;
    const lastMentionedAt = doc.get('lastMentionedAt');
    return {
      id: doc.id,
      isSelf: doc.get('isSelf') === true,
      isPrivate: isPrivateInEffect(
        readPrivacyFacts({
          privateMark: toPrivateMark(words.privateMark),
          isPrivacyCleared: words.isPrivacyCleared === true,
        }),
      ),
      lastMentionedAt: Number.isFinite(lastMentionedAt)
        ? Number(lastMentionedAt)
        : null,
      words: {
        name: words.name,
        aliases: isStringList(words.aliases) ? words.aliases : [],
        relation: typeof words.relation === 'string' ? words.relation : null,
        kin: words.kin,
      },
    };
  } catch {
    return null;
  }
};

/** "younger brother": the family word as the person says it, with its order first. */
export const toKinText = (kin: WhoKin) =>
  [
    kin.order,
    KIN_KINDS.find((entry) => entry.kind === kin.kind)?.spoken ?? kin.kind,
  ]
    .filter(Boolean)
    .join(' ');

/** The people the model is shown to link a name to: never the self, and on an unattended turn never a private one; those with another name or a family word first, then the most recently named. */
export function toContextPeople(
  records: PersonRecord[],
  options: { isUnattended: boolean },
): ContextPerson[] {
  return records
    .filter(
      (record) =>
        !record.isSelf &&
        record.words.name.trim() !== '' &&
        !(options.isUnattended && record.isPrivate),
    )
    .map((record) => ({
      record,
      kin: normalizeKin(record.words.kin),
    }))
    .sort(
      (a, b) =>
        Number(b.kin !== null || b.record.words.aliases.length > 0) -
          Number(a.kin !== null || a.record.words.aliases.length > 0) ||
        (b.record.lastMentionedAt ?? 0) - (a.record.lastMentionedAt ?? 0),
    )
    .slice(0, MAX_CONTEXT_PEOPLE)
    .map(({ record, kin }) => ({
      id: record.id,
      name: record.words.name,
      alsoCalled: record.words.aliases,
      relation: record.words.relation,
      kin: kin ? toKinText(kin) : null,
    }));
}

/** Each person's birthday from the yearly index (a year only when one was given); a person with none is left out. */
export const toBirthdays = (byWho: ByWho): Record<string, KinBirthday | null> =>
  Object.fromEntries(
    Object.entries(byWho).flatMap(([whoId, entries]) => {
      const birthday = entries.find((entry) => entry[1] === 'birthday');
      return birthday
        ? [[whoId, { month: birthday[2], day: birthday[3], year: birthday[4] }]]
        : [];
    }),
  );

import { toComparable } from '../../../vendor/optionMatchUtils.js';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export const MAX_HEARD_NAMES = 10;
export const MAX_HEARD_CANDIDATES = 2;
export const HEARD_CAP = 60;
export const SOUNDS_LIKE_MAX = 5;
export const SOUNDS_LIKE_CAP = 40;

/** A word the device heard and what it matched to: the known name it swapped to, the record, and the near names that tied. */
export interface HeardName {
  heard: string;
  said: string | null;
  recordId: string | null;
  candidateIds: string[];
}

const toId = (value: unknown) =>
  typeof value === 'string' && ID_RE.test(value) ? value : null;

const toWords = (value: unknown) =>
  typeof value === 'string' ? value.trim().slice(0, HEARD_CAP) : '';

/** A capture's sealed `heardNames`, read defensively: an older capture or a bad shape gives null, and each entry is capped and its ids checked. */
export const readHeardNames = (value: unknown): HeardName[] | null => {
  if (!Array.isArray(value)) return null;
  const read = value.slice(0, MAX_HEARD_NAMES).flatMap((entry): HeardName[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const item = entry as Record<string, unknown>;
    const heard = toWords(item.heard);
    if (heard === '') return [];
    const said = toWords(item.said);
    return [
      {
        heard,
        said: said === '' ? null : said,
        recordId: toId(item.recordId),
        candidateIds: [
          ...new Set(
            (Array.isArray(item.candidateIds) ? item.candidateIds : []).flatMap(
              (id) => toId(id) ?? [],
            ),
          ),
        ].slice(0, MAX_HEARD_CANDIDATES),
      },
    ];
  });
  return read.length > 0 ? read : null;
};

/** Whether `span` is whole words of `text`, ignoring case, accents and punctuation. */
export const isSpanOf = (span: string, text: string) => {
  const wanted = toComparable(span);
  return wanted !== '' && ` ${toComparable(text)} `.includes(` ${wanted} `);
};

/** The heard forms kept for a record: deduped, none equal to one of its names, at most five of at most 40 characters; null when none are left. */
export const mergeSoundsLike = (
  current: string[] | null,
  added: string,
  names: string[],
): string[] | null => {
  const entry = added.trim();
  const key = toComparable(entry);
  const kept = (current ?? []).filter((text) => toComparable(text) !== '');
  return key === '' ||
    entry.length > SOUNDS_LIKE_CAP ||
    names.some((name) => toComparable(name) === key) ||
    kept.some((text) => toComparable(text) === key) ||
    kept.length >= SOUNDS_LIKE_MAX
    ? null
    : [...kept, entry];
};

/** What the model may be told: on a turn nobody is watching, a word that points at someone the context leaves out (a private person) is dropped whole, so neither the name nor the match is told. */
export const toContextHeard = (
  entries: HeardName[],
  visibleIds: Set<string>,
  isUnattended: boolean,
): HeardName[] =>
  isUnattended
    ? entries.filter((entry) =>
        [entry.recordId, ...entry.candidateIds].every(
          (id) => id === null || visibleIds.has(id),
        ),
      )
    : entries;

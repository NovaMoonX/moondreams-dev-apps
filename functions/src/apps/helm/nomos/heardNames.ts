import { toComparable } from '../../../vendor/optionMatchUtils.js';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export const MAX_HEARD_NAMES = 10;
export const MAX_HEARD_CANDIDATES = 2;
export const HEARD_CAP = 60;
export const SOUNDS_LIKE_MAX = 5;
export const SOUNDS_LIKE_CAP = 40;

/** A heard word and what it matched: the swapped name, the record, and any tied near names. */
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

/** A capture's sealed heard names, read defensively; null on an older or bad shape. */
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

const STOP_WORDS = new Set(
  'a an and are as at be but by can did do for from had has have her him his how i if in is it its me my no not of on or our she so that the their them then there they this to up us was we were what when who why will with would yes you your'.split(
    ' ',
  ),
);

/** The heard forms kept for a record, cleaned and capped; null when none are left. */
export const mergeSoundsLike = (
  current: string[] | null,
  added: string,
  names: string[],
  others: string[] = [],
): string[] | null => {
  const entry = added.trim();
  const key = toComparable(entry);
  const kept = (current ?? []).filter((text) => toComparable(text) !== '');
  const isOthers = others.some((name) => {
    const comparable = toComparable(name);
    return comparable === key || comparable.split(' ').includes(key);
  });
  return key.length < 2 ||
    STOP_WORDS.has(key) ||
    entry.length > SOUNDS_LIKE_CAP ||
    isOthers ||
    names.some((name) => toComparable(name) === key) ||
    kept.some((text) => toComparable(text) === key) ||
    kept.length >= SOUNDS_LIKE_MAX
    ? null
    : [...kept, entry];
};

/** What the model may be told of heard names; a word pointing at anyone unlisted is dropped whole. */
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

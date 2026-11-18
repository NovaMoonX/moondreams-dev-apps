export const WHY_VERBATIM_CAP = 1000;
export const WHY_CLEANED_CAP = 400;
export const WHY_SUMMARY_CAP = 120;
export const WHY_TAGS_CAP = 5;

export type WhyCleanedState = 'offered' | 'accepted' | 'declined';

/** A goal's why, inside the project's sealed payload. */
export interface GoalWhy {
  verbatim: string;
  cleaned: string | null;
  cleanedState: WhyCleanedState | null;
  summary: string | null;
  tags: string[];
  basedOn: string;
  saidAt: number;
  editedAt: number | null;
  captureId: string | null;
}

const fnv32 = (text: string, seed: number) =>
  Array.from(text).reduce(
    (hash, char) =>
      Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01000193) >>> 0,
    seed,
  );

/** A short fingerprint of the person's words, so a tidied version or summary made from older words is never shown as current. Change detection only, never a secret. */
export const whyFingerprint = (verbatim: string) =>
  [fnv32(verbatim, 0x811c9dc5), fnv32(verbatim, 0x050c5d1f)]
    .map((part) => part.toString(16).padStart(8, '0'))
    .join('');

/** What a goal shows as its why: the tidied version only once the person chose it and it still matches their words. */
export const readShownWhy = (
  why: GoalWhy | null,
): { text: string; isTidied: boolean } | null => {
  if (!why || why.verbatim.trim() === '') return null;
  const isTidied =
    why.cleanedState === 'accepted' &&
    why.cleaned !== null &&
    why.basedOn === whyFingerprint(why.verbatim);
  return isTidied
    ? { text: why.cleaned ?? why.verbatim, isTidied: true }
    : { text: why.verbatim, isTidied: false };
};

const loose = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** A tidy-up is offered only when it changes more than punctuation and spacing, and never for a short why. */
export const isWorthTidying = (verbatim: string, cleaned: string | null) =>
  cleaned !== null &&
  verbatim.trim().split(/\s+/).length >= 8 &&
  loose(verbatim) !== loose(cleaned);

/** The why as the person's new words leave it: the same words change nothing; new words drop the old tidy-up, summary, tags and fingerprint, since they described other words. */
export const nextWhyFromWords = (
  previous: GoalWhy | null,
  verbatim: string,
  at: number,
  captureId: string | null,
): GoalWhy => {
  const words = verbatim.slice(0, WHY_VERBATIM_CAP);
  if (previous && previous.verbatim === words) return previous;
  return {
    verbatim: words,
    cleaned: null,
    cleanedState: null,
    summary: null,
    tags: [],
    basedOn: '',
    saidAt: previous?.saidAt ?? at,
    editedAt: previous ? at : null,
    captureId: previous?.captureId ?? captureId,
  };
};

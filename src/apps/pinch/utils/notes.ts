import {
  MAX_RECIPE_NOTE_LENGTH,
  NOTE_COOK_CHOICES,
  SOFT_MAX_RECIPE_NOTES,
} from '@apps/pinch/constants';
import type { Cook, RecipeNote } from '@apps/pinch/types';

export interface NoteSummary {
  count: number;
  lastTweakAt: number | null;
}

export type TweakTracking = 'on' | 'full' | 'off';

const byNewest = (a: RecipeNote, b: RecipeNote) =>
  b.createdAt - a.createdAt || a.id.localeCompare(b.id);

export const groupNotesByRecipe = (notes: RecipeNote[]) => {
  const result = [...notes].sort(byNewest).reduce((byRecipe, note) => {
    const list = byRecipe.get(note.recipeId);
    if (list) {
      list.push(note);
    } else {
      byRecipe.set(note.recipeId, [note]);
    }
    return byRecipe;
  }, new Map<string, RecipeNote[]>());

  return result;
};

export const getNoteSummaries = (notes: RecipeNote[]) => {
  const result = notes.reduce((summaries, note) => {
    const known = summaries.get(note.recipeId);
    summaries.set(note.recipeId, {
      count: (known?.count ?? 0) + 1,
      lastTweakAt:
        note.kind === 'TWEAK'
          ? Math.max(known?.lastTweakAt ?? -Infinity, note.createdAt)
          : (known?.lastTweakAt ?? null),
    });
    return summaries;
  }, new Map<string, NoteSummary>());

  return result;
};

export const isNoteHistoryFull = (count: number) =>
  count >= SOFT_MAX_RECIPE_NOTES;

export const isValidNoteText = (text: string) => {
  const trimmed = text.trim();
  return trimmed !== '' && trimmed.length <= MAX_RECIPE_NOTE_LENGTH;
};

/** One journal entry in a line: a note says its day and words, a tweak what changed and why. */
export const getNoteSummary = (
  note: RecipeNote,
  formatDay: (at: number) => string,
) => {
  const day = formatDay(note.createdAt);
  const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
  const body =
    note.kind === 'TWEAK'
      ? [(note.changes ?? []).map(squash).join('; '), squash(note.text ?? '')]
          .filter(Boolean)
          .join('. ')
      : squash(note.text ?? '');
  const title =
    note.kind === 'TWEAK' ? `Changed on ${day}` : `Your latest note (${day})`;

  return { label: body === '' ? title : `${title}:`, body };
};

export const getTweakReason = (text: string) => text.trim() || null;

/** A note written before the recipe's latest tweak was about the earlier version of the recipe, so it says so. */
export const getWrittenBefore = (
  note: RecipeNote,
  lastTweakAt: number | null,
) =>
  note.kind === 'NOTE' && lastTweakAt !== null && note.createdAt < lastTweakAt
    ? lastTweakAt
    : null;

/** The rules want every key on the merged document, so an edit writes back the ones an older note lacks. */
export const getMissingNoteFields = (existing: object) => ({
  ...('text' in existing ? {} : { text: null }),
  ...('changes' in existing ? {} : { changes: [] }),
  ...('cookId' in existing ? {} : { cookId: null }),
});

/** Whether edits to a recipe are recorded as a tweak: the recipe has been cooked, both lists have loaded without error and the journal has room. */
export const getTweakTracking = (state: {
  isCooksReady: boolean;
  isNotesReady: boolean;
  cookCount: number;
  noteCount: number;
}): TweakTracking => {
  if (!state.isCooksReady || !state.isNotesReady || state.cookCount === 0) {
    return 'off';
  }
  return isNoteHistoryFull(state.noteCount) ? 'full' : 'on';
};

/** The latest few cooks (newest first), plus the one a note already follows when it is older than those. */
export const getNoteCookChoices = (
  cooksNewestFirst: Cook[],
  selectedCookId: string | null,
) =>
  cooksNewestFirst.filter(
    (cook, index) => index < NOTE_COOK_CHOICES || cook.id === selectedCookId,
  );

/** A day each, and the time too for a day that appears twice, so two answers never read the same. */
export const getCookChoiceLabels = (
  cooks: Cook[],
  formatDay: (at: number) => string,
  formatDayAndTime: (at: number) => string,
) => {
  const perDay = cooks.reduce(
    (counts, cook) =>
      counts.set(
        formatDay(cook.cookedAt),
        (counts.get(formatDay(cook.cookedAt)) ?? 0) + 1,
      ),
    new Map<string, number>(),
  );

  return cooks.map((cook) =>
    (perDay.get(formatDay(cook.cookedAt)) ?? 0) > 1
      ? formatDayAndTime(cook.cookedAt)
      : formatDay(cook.cookedAt),
  );
};

const NEXT_TIME = /[.!?]\s+(?=next time\b)/i;

/** A note's words from its "Next time…" sentence on, when it has one, so the advice leads and what happened before it is only a "…" away. */
export const leadWithAdvice = (text: string) => {
  const match = NEXT_TIME.exec(text);
  return match ? `…${text.slice(match.index + match[0].length)}` : text;
};

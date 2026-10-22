import {
  MAX_RECIPE_NOTE_LENGTH,
  MAX_SPOKEN_NOTE_CHARS,
  NOTE_COOK_CHOICES,
  NOTE_STEP_ANCHOR_LENGTH,
  SOFT_MAX_RECIPE_NOTES,
} from '@apps/pinch/constants';
import type { Cook, NoteKind, RecipeNote } from '@apps/pinch/types';

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

/** One journal entry in a line: a note says its day and words, a tweak what changed and why, a change what is planned and why. */
export const getNoteSummary = (
  note: RecipeNote,
  formatDay: (at: number) => string,
) => {
  const day = formatDay(note.createdAt);
  const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
  const body = getSummaryBody(note, squash);
  const title = getSummaryTitle(note, day);

  return { label: body === '' ? title : `${title}:`, body };
};

const getSummaryBody = (note: RecipeNote, squash: (text: string) => string) => {
  if (note.kind === 'TWEAK') {
    return [(note.changes ?? []).map(squash).join('; '), squash(note.text ?? '')]
      .filter(Boolean)
      .join('. ');
  }
  if (note.kind === 'CHANGE') {
    return [squash(note.text ?? ''), squash(note.reason ?? '')]
      .filter(Boolean)
      .join('. ');
  }
  return squash(note.text ?? '');
};

const getSummaryTitle = (note: RecipeNote, day: string) => {
  if (note.kind === 'TWEAK') return `Changed on ${day}`;
  if (note.kind === 'CHANGE') return `A change you planned (${day})`;
  if (note.kind === 'TIP') return `A tip (${day})`;
  return `Your latest note (${day})`;
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
  ...('stepIndex' in existing ? {} : { stepIndex: null }),
  ...('stepText' in existing ? {} : { stepText: null }),
  ...('reason' in existing ? {} : { reason: null }),
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

const squashText = (text: string) => text.replace(/\s+/g, ' ').trim();

/** At most `max` characters, the ellipsis included. */
const clipAtWord = (text: string, max: number) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

/** The words an entry keeps to find its step again: the step with its spaces squashed, cut at a word. */
export const getStepAnchorText = (step: string) =>
  clipAtWord(squashText(step), NOTE_STEP_ANCHOR_LENGTH);

/** Whether a step still reads as the words an entry kept: whole when it kept the whole step, else the same beginning, so changing the clip length never strands stored entries. */
const readsAs = (step: string, kept: string) => {
  const squashed = squashText(step);
  if (!kept.endsWith('…')) return squashed === kept;
  const beginning = kept.slice(0, -1);
  return beginning !== '' && squashed.startsWith(beginning);
};

/** Where an entry about a step is written: the step's number (0-based) and its first words, or both null for the whole recipe or a step that does not exist. */
export const getStepAnchor = (steps: string[], index: number | null) => {
  const step = index === null ? undefined : steps[index];
  return step === undefined || index === null
    ? { stepIndex: null, stepText: null }
    : { stepIndex: index, stepText: getStepAnchorText(step) };
};

/**
 * The step an entry is about in the recipe as it is now: its number while that step still reads as it did, the step its words moved to, or null when the entry is for the whole recipe or its step was rewritten or removed (it then reads as a recipe-wide entry that says so).
 * An entry written without the step's words trusts its number.
 */
export const resolveNoteStep = (
  note: Pick<RecipeNote, 'stepIndex' | 'stepText'>,
  steps: string[],
) => {
  const index = note.stepIndex ?? null;
  if (index === null) return null;
  const text = note.stepText ?? null;
  if (text === null) return index < steps.length ? index : null;
  if (steps[index] !== undefined && readsAs(steps[index], text)) {
    return index;
  }
  const moved = steps.flatMap((step, at) =>
    readsAs(step, text) ? [at] : [],
  );
  if (moved.length === 0) return null;
  // Two steps can read the same ("Stir."): the one nearest where the entry was written, the later one when both are, since a step is added more often than taken out.
  return moved.reduce((nearest, at) =>
    Math.abs(at - index) <= Math.abs(nearest - index) ? at : nearest,
  );
};

/** Whether an entry was written about a step that has since been rewritten or removed. */
export const isStepLost = (
  note: Pick<RecipeNote, 'stepIndex' | 'stepText'>,
  steps: string[],
) => (note.stepIndex ?? null) !== null && resolveNoteStep(note, steps) === null;

const KIND_RANK: Record<NoteKind, number> = {
  TIP: 0,
  CHANGE: 1,
  NOTE: 2,
  TWEAK: 3,
};

/** The entries a person writes to be read while cooking (never a tweak), in the order they show: tips, planned changes, then notes, each newest first. */
export const isStepEntry = (note: RecipeNote) => note.kind !== 'TWEAK';

export const sortStepEntries = (notes: RecipeNote[]) =>
  [...notes]
    .filter(isStepEntry)
    .sort(
      (a, b) =>
        KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
        b.createdAt - a.createdAt ||
        a.id.localeCompare(b.id),
    );

const groupedByNotes = new WeakMap<
  RecipeNote[],
  WeakMap<string[], ReturnType<typeof buildEntryGroups>>
>();

const buildEntryGroups = (notes: RecipeNote[], steps: string[]) => {
  const entries = sortStepEntries(notes);
  const byStep = entries.reduce((groups, entry) => {
    const at = resolveNoteStep(entry, steps);
    if (at !== null) groups.set(at, [...(groups.get(at) ?? []), entry]);
    return groups;
  }, new Map<number, RecipeNote[]>());
  const wholeRecipe = entries.filter(
    (entry) => resolveNoteStep(entry, steps) === null,
  );

  return { byStep, wholeRecipe };
};

/** A recipe's tips, changes and notes split by the step they are about, and the ones for the whole recipe. An entry whose step was rewritten lands in the whole recipe. The answer is kept per list of notes and list of steps, which the store replaces only when they change, so a screen that re-renders with a timer never groups again. */
export const groupEntriesByStep = (notes: RecipeNote[], steps: string[]) => {
  const bySteps = groupedByNotes.get(notes) ?? new WeakMap();
  groupedByNotes.set(notes, bySteps);
  const known = bySteps.get(steps);
  if (known) return known;
  const result = buildEntryGroups(notes, steps);
  bySteps.set(steps, result);
  return result;
};

/** The note the cooking screen leads with before the first step: the latest NOTE that is not about one step (a step's own notes show with it). */
export const getLastTimeNote = (notes: RecipeNote[], steps: string[]) =>
  [...notes]
    .filter(
      (note) => note.kind === 'NOTE' && resolveNoteStep(note, steps) === null,
    )
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))[0] ??
  null;

/** The reasons of the changes being applied, as the one reason the tweak keeps: each different one once, in the order the changes were written. */
export const getJoinedChangeReason = (changes: RecipeNote[]) => {
  const reasons = changes
    .map((change) => squashText(change.reason ?? '').replace(/[.!?]+$/, ''))
    .filter((reason, index, all) => reason !== '' && all.indexOf(reason) === index);
  const joined = reasons.join('. ');
  const result = joined === '' ? null : clipAtWord(joined, MAX_RECIPE_NOTE_LENGTH);

  return result;
};

/** What a person hears for the tips or the notes of the step on screen. The tips are advice for any cook; the notes are their own, so each says when it was written. Null when there is nothing to say. */
export const getSpokenEntries = (
  entries: RecipeNote[],
  which: 'TIPS' | 'NOTES',
  formatDay: (at: number) => string,
) => {
  const wanted = entries.filter((entry) =>
    which === 'TIPS' ? entry.kind === 'TIP' : entry.kind !== 'TIP' && isStepEntry(entry),
  );
  if (wanted.length === 0) return null;

  const sentences = wanted.map((entry) => {
    const text = clipAtWord(squashText(entry.text ?? ''), MAX_SPOKEN_NOTE_CHARS);
    const end = (value: string) => (/[.!?]$/.test(value) ? value : `${value}.`);
    if (entry.kind === 'TIP') return `Tip: ${end(text)}`;
    if (entry.kind === 'CHANGE') {
      const reason = squashText(entry.reason ?? '');
      return `A change you planned: ${end(text)}${reason === '' ? '' : ` Because ${end(reason.charAt(0).toLowerCase() + reason.slice(1))}`}`;
    }
    return `Your note from ${formatDay(entry.createdAt)}: ${end(text)}`;
  });

  return sentences.join(' ');
};

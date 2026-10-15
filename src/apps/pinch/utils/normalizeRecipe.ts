import {
  MAX_MINUTES,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_RECIPE_DESCRIPTION_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_STEPS,
  MAX_RECIPE_TITLE_LENGTH,
  MAX_SERVING_AMOUNT,
  MAX_STEP_LENGTH,
  UNITS,
} from '@apps/pinch/constants';
import type { RecipeCare, Unit } from '@apps/pinch/types';
import { toCare } from '@apps/pinch/utils/recipeCare';

export interface ExtractedIngredient {
  name: string;
  amount: number | null;
  unit: Unit | null;
  note: string | null;
}

/** What the reader found. It only ever fills the form; nothing is saved from it. */
export interface ExtractedRecipe {
  title: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  description: string | null;
  ingredients: ExtractedIngredient[];
  steps: string[];
  /** Only what the source says, never a guess. */
  care: RecipeCare | null;
  /** Parts of the recipe the reader could not make out. */
  unread: string[];
}

const asString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
const asNumber = (value: unknown) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= MAX_SERVING_AMOUNT
    ? value
    : null;
const asMinutes = (value: unknown) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= MAX_MINUTES
    ? Math.round(value)
    : null;

const asWholeDays = (value: unknown) =>
  typeof value === 'number' ? Math.floor(value) : null;

const UNMEASURED_TAIL =
  /^(.+?)[\s,;]+(to taste|as needed|as required|for garnish|to garnish|for serving|to serve)\.?$/i;
const UNMEASURED_HEAD =
  /^((?:an?\s+)?(?:(?:small|large|big|generous|good)\s+)?(?:few\s+)?(?:handful|splash|drizzle|sprinkle|knob|dash|bunch|sprig|pinch)(?:e?s)?)\s+of\s+(.+)$/i;
const PAIR = /^([^\d,]+?)\s+(?:and|&)\s+([^\d,]+)$/i;
const MAX_PAIR_WORDS = 4;

const isPairPart = (part: string, other: string) =>
  part.length >= 3 &&
  part.split(/\s+/).length <= MAX_PAIR_WORDS &&
  part.toLowerCase() !== other.toLowerCase();

const sayHowMuch = (head: string) => {
  const words = head.toLowerCase();
  return /^an?\s/.test(words) || words.endsWith('s') ? words : `a ${words}`;
};

const joinNotes = (notes: (string | null)[]) =>
  [
    ...new Map(
      notes.flatMap((note) =>
        note ? [[note.trim().toLowerCase(), note.trim()] as const] : [],
      ),
    ).values(),
  ]
    .join(', ')
    .slice(0, MAX_NOTE_LENGTH) || null;

/** A line with no amount read the way a cook means it: "salt and pepper to taste" is two lines noted "to taste", and "handful of parsley" is parsley noted "a handful". A measured line is left as it was read. */
const readUnmeasured = (line: ExtractedIngredient): ExtractedIngredient[] => {
  if (line.amount !== null) return [line];
  const tail = UNMEASURED_TAIL.exec(line.name);
  const withoutTail = tail ? tail[1] : line.name;
  const head = UNMEASURED_HEAD.exec(withoutTail);
  const name = head ? head[2] : withoutTail;
  const note = joinNotes([
    head ? sayHowMuch(head[1]) : null,
    tail ? tail[2].toLowerCase() : null,
    line.note,
  ]);
  const pair = PAIR.exec(name);
  const names =
    pair && isPairPart(pair[1], pair[2]) && isPairPart(pair[2], pair[1])
      ? [pair[1], pair[2]]
      : [name];

  return names.map((part) => ({
    ...line,
    name: part.trim(),
    unit: null,
    note,
  }));
};

/** Turns whatever the model returned into the safe shape the form takes: wrong types become null, lists are capped, units must be real, and a line with no amount keeps its words ("to taste") as its note. */
export function normalizeExtractedRecipe(raw: unknown): ExtractedRecipe {
  const parsed = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const list = (value: unknown) => (Array.isArray(value) ? value : []);

  return {
    title: asString(parsed.title)?.slice(0, MAX_RECIPE_TITLE_LENGTH) ?? null,
    servings: asNumber(parsed.servings),
    prepMinutes: asMinutes(parsed.prepMinutes),
    cookMinutes: asMinutes(parsed.cookMinutes),
    description:
      asString(parsed.description)?.slice(0, MAX_RECIPE_DESCRIPTION_LENGTH) ??
      null,
    ingredients: list(parsed.ingredients)
      .flatMap((entry) => {
        const item = (
          typeof entry === 'object' && entry !== null ? entry : {}
        ) as Record<string, unknown>;
        const name = asString(item.name)?.slice(0, MAX_NAME_LENGTH);
        return name
          ? readUnmeasured({
              name,
              amount: asNumber(item.amount),
              unit: UNITS.find((unit) => unit === item.unit) ?? null,
              note: asString(item.note)?.slice(0, MAX_NOTE_LENGTH) ?? null,
            })
          : [];
      })
      .slice(0, MAX_RECIPE_INGREDIENTS),
    steps: list(parsed.steps)
      .flatMap((step) =>
        asString(step) ? [asString(step)!.slice(0, MAX_STEP_LENGTH)] : [],
      )
      .slice(0, MAX_RECIPE_STEPS),
    care: toCare({
      fridgeDays: asWholeDays(parsed.fridgeDays),
      freezerDays: asWholeDays(parsed.freezerDays),
      reheat: parsed.reheat,
      tip: parsed.tip,
    }),
    unread: list(parsed.unread)
      .flatMap((entry) =>
        asString(entry) ? [asString(entry)!.slice(0, 200)] : [],
      )
      .slice(0, 10),
  };
}

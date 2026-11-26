import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase/config';
import { clipAtWord } from '@/utils/stringUtils';
import {
  MAX_AMOUNT_TEXT_LENGTH,
  MAX_COLLECTION_LABEL_LENGTH,
  MAX_MINUTES,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_PEPPER_ASK_LENGTH,
  MAX_PEPPER_REPLY_LENGTH,
  MAX_RECIPE_COLLECTIONS,
  MAX_RECIPE_DESCRIPTION_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_TITLE_LENGTH,
  MAX_SERVING_AMOUNT,
  MAX_SOURCE_LABEL_LENGTH,
  UNITS,
} from '@apps/pinch/constants';
import type {
  DishCategory,
  RecipeCare,
  RecipeLinkKind,
  Unit,
} from '@apps/pinch/types';
import { getCategories } from '@apps/pinch/utils/categories';
import { getCollectionKey } from '@apps/pinch/utils/collections';
import { toCare } from '@apps/pinch/utils/recipeCare';
import { cleanGroupName } from '@apps/pinch/utils/ingredientGroups';
import { readSteps } from '@apps/pinch/utils/normalizeRecipe';
import { cleanLinks } from '@apps/pinch/utils/recipeLinks';

export interface RevisionLink {
  kind: RecipeLinkKind;
  label: string | null;
  url: string;
}

export interface RevisionInputLine {
  ref: string;
  name: string;
  /** A line that is not a kitchen ingredient: `name` is its words. */
  isFree: boolean;
  amount: number | null;
  unit: Unit | null;
  amountText: string | null;
  note: string | null;
  group: string | null;
}

/** The recipe as the form holds it right now, as plain data. */
export interface RevisionInput {
  title: string;
  description: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: RevisionInputLine[];
  steps: { text: string; section: string | null }[];
  categories: DishCategory[];
  care: RecipeCare | null;
  /** The label of "Where it's from", or null for none. */
  source: string | null;
  collections: string[];
  links: RevisionLink[];
  /** The person's other collections, which the recipe may be put in. */
  otherCollections: string[];
  ask: string;
  earlierAsks: string[];
}

export interface RevisedLine {
  /** The input ref of a line kept or changed; null for a new line. */
  ref: string | null;
  name: string;
  amount: number | null;
  unit: Unit | null;
  amountText: string | null;
  note: string | null;
  group: string | null;
}

export interface RecipeRevision {
  reply: string;
  isChanged: boolean;
  title: string | null;
  description: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: RevisedLine[];
  steps: { text: string; section: string | null }[];
  categories: DishCategory[];
  care: RecipeCare | null;
  source: string | null;
  collections: string[];
  links: RevisionLink[];
  /** How many links the server left out because its search did not return them. */
  droppedLinks: number;
}

/** A page the round's web search returned, which is shown beside what it found. */
export interface RevisionSource {
  title: string;
  url: string;
}

const asText = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const asAmount = (value: unknown) =>
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

/** Turns the model's answer into the safe shape the merge takes, or throws when it is unusable. */
export function normalizeRevision(
  raw: unknown,
  knownRefs: ReadonlySet<string>,
): RecipeRevision {
  const parsed = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  const reply = asText(parsed.reply);
  if (reply === null || typeof parsed.isChanged !== 'boolean') {
    throw new Error('Pepper returned no reply.');
  }
  if (!Array.isArray(parsed.links)) {
    throw new Error('Pepper returned no links.');
  }
  const links = cleanLinks(parsed.links).map(({ kind, label, url }) => ({
    kind,
    label,
    url,
  }));
  const seen = new Set<string>();
  const ingredients = list(parsed.ingredients)
    .flatMap((entry) => {
      const item = (
        typeof entry === 'object' && entry !== null ? entry : {}
      ) as Record<string, unknown>;
      const name = asText(item.name)?.slice(0, MAX_NAME_LENGTH);
      if (!name) return [];
      const ref =
        typeof item.ref === 'string' &&
        knownRefs.has(item.ref) &&
        !seen.has(item.ref)
          ? item.ref
          : null;
      if (ref !== null) seen.add(ref);
      const amount = asAmount(item.amount);
      const amountText = asText(item.amountText);
      return [
        {
          ref,
          name,
          amount,
          unit: UNITS.find((unit) => unit === item.unit) ?? null,
          amountText:
            amount === null && amountText !== null
              ? clipAtWord(amountText, MAX_AMOUNT_TEXT_LENGTH)
              : null,
          note: asText(item.note)
            ? clipAtWord(asText(item.note)!, MAX_NOTE_LENGTH)
            : null,
          group: cleanGroupName(asText(item.group)),
        },
      ];
    })
    .slice(0, MAX_RECIPE_INGREDIENTS);
  const { steps, stepSections } = readSteps(list(parsed.steps));
  if (parsed.isChanged && ingredients.length === 0 && steps.length === 0) {
    throw new Error('Pepper returned a recipe with nothing in it.');
  }

  return {
    reply: clipAtWord(reply, MAX_PEPPER_REPLY_LENGTH),
    isChanged: parsed.isChanged,
    title: asText(parsed.title)?.slice(0, MAX_RECIPE_TITLE_LENGTH) ?? null,
    description:
      asText(parsed.description)?.slice(0, MAX_RECIPE_DESCRIPTION_LENGTH) ??
      null,
    servings: asAmount(parsed.servings),
    prepMinutes: asMinutes(parsed.prepMinutes),
    cookMinutes: asMinutes(parsed.cookMinutes),
    categories: getCategories({
      categories: list(parsed.categories).filter(
        (value): value is string => typeof value === 'string',
      ),
    }),
    care: toCare(
      typeof parsed.care === 'object' && parsed.care !== null
        ? (parsed.care as Record<string, unknown>)
        : null,
    ),
    source:
      asText(parsed.source)?.slice(0, MAX_SOURCE_LABEL_LENGTH).trim() ?? null,
    collections: [
      ...new Map(
        list(parsed.collections).flatMap((value) => {
          const label =
            typeof value === 'string'
              ? value.trim().slice(0, MAX_COLLECTION_LABEL_LENGTH).trim()
              : '';
          return label === ''
            ? []
            : [[getCollectionKey(label), label] as const];
        }),
      ).values(),
    ].slice(0, MAX_RECIPE_COLLECTIONS),
    links,
    droppedLinks:
      typeof parsed.droppedLinks === 'number' &&
      Number.isFinite(parsed.droppedLinks)
        ? Math.max(0, Math.floor(parsed.droppedLinks))
        : 0,
    ingredients,
    steps: steps.map((text, index) => ({
      text,
      section: stepSections[index] ?? null,
    })),
  };
}

const reviseCallable = httpsCallable<
  {
    recipe: Omit<RevisionInput, 'ask' | 'earlierAsks'>;
    ask: string;
    earlierAsks: string[];
  },
  { revision: unknown; sources: unknown }
>(functions, 'revisePinchRecipe', { timeout: 60_000 });

const toSources = (value: unknown): RevisionSource[] =>
  (Array.isArray(value) ? value : []).flatMap((entry) => {
    const { title, url } = (entry ?? {}) as Record<string, unknown>;
    return typeof url === 'string' && /^https?:\/\//i.test(url)
      ? [
          {
            title: typeof title === 'string' && title !== '' ? title : url,
            url,
          },
        ]
      : [];
  });

/** Asks Pepper to revise a recipe as the person said, searching the web when the ask needs it; it only returns the revision and the pages the search used, nothing is saved. */
export async function reviseRecipe(
  input: RevisionInput,
): Promise<{ revision: RecipeRevision; sources: RevisionSource[] }> {
  const { ask, earlierAsks, ...recipe } = input;
  const { data } = await reviseCallable({
    recipe,
    ask: ask.slice(0, MAX_PEPPER_ASK_LENGTH),
    earlierAsks: earlierAsks.map((earlier) =>
      earlier.slice(0, MAX_PEPPER_ASK_LENGTH),
    ),
  });
  return {
    revision: normalizeRevision(
      data.revision,
      new Set(input.ingredients.map((line) => line.ref)),
    ),
    sources: toSources(data.sources).slice(0, 5),
  };
}

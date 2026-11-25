import { randomUUID } from 'node:crypto';

import type {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';
import { z } from 'zod';

import type { AppActionResult } from '../../../connections/registry.js';
import {
  createOptionMatcher,
  toDisplayCase,
} from '../../../vendor/optionMatchUtils.js';
import {
  getComparableUrl,
  getWebLinkHost,
  toWebLink,
} from '../../../vendor/urlUtils.js';
import { dayToUtcMidnight, getLocalMoment } from '../eatSoonDigest.js';
import { CATALOG_NAMES } from './catalogNames.js';
import { CATALOG_NUTRITION_IDS } from './catalogNutrition.js';
import { cleanGroupName } from './ingredientGroups.js';
import {
  matchIngredientWithNote,
  suggestIngredients,
} from './ingredientMatch.js';
import { planTweakUndo } from './notes.js';
import {
  MAX_IDEA_NOTE_LENGTH,
  MAX_IDEA_SITE_NAME_LENGTH,
  MAX_IDEA_TITLE_LENGTH,
  MAX_IDEA_URL_LENGTH,
  MAX_MEAL_ITEMS,
  MAX_MINUTES,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_RECIPE_DESCRIPTION_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_STEPS,
  MAX_RECIPE_TITLE_LENGTH,
  MAX_SERVING_AMOUNT,
  MAX_SHOPPING_AMOUNT,
  MAX_STEP_LENGTH,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  SOFT_MAX_IDEAS,
  SOFT_MAX_PLANNED_MEALS,
  SOFT_MAX_RECIPE_NOTES,
  SOFT_MAX_RECIPES,
  SOFT_MAX_SHOPPING_ITEMS,
  UNIT_LABELS,
  UNITS,
} from './pinchConstants.js';
import type {
  Idea,
  IngredientRecord,
  MealItem,
  MealType,
  NutritionValues,
  PlannedMeal,
  Recipe,
  RecipeIngredient,
  RecipeNote,
  ResolvedIngredient,
  ShoppingItem,
  Unit,
} from './pinchTypes.js';
import {
  capLines,
  getRecipeChanges,
  getRecipeSnapshot,
  isUnrestoredLine,
} from './recipeChanges.js';
import { toStoredStepSections } from './stepSections.js';

export type OutsideChangeKind =
  | 'recipeUpdated'
  | 'recipeAdded'
  | 'mealPlanned'
  | 'shoppingAdded'
  | 'ideaSaved'
  | 'nutritionFilled';

export type ChangeUndoFrom = 'pinch' | 'helm';

/** `apps/pinch/kitchens/{uid}/outsideChanges/{id}`: written only here, read by the person's own screens. */
export interface OutsideChange {
  id: string;
  kind: OutsideChangeKind;
  by: { kind: 'assistant' | 'nomos'; name: string | null };
  title: string;
  lines: string[];
  recipeId: string | null;
  noteId: string | null;
  plannedMealId: string | null;
  shoppingItemId: string | null;
  /** Merged into an existing item; null when the item was created. */
  addedAmount: number | null;
  createdItem: boolean;
  /** The item as it was before a merge (null when created), so Undo can put a ticked line back. */
  previousItem: { amount: number | null; isChecked: boolean } | null;
  ideaId: string | null;
  /** Custom ingredients this change created: its Undo archives each while nothing else uses it and it is unchanged. */
  createdIngredientIds: string[] | null;
  /** The ingredients a fill gave nutrition, and whether it had to write a catalog ingredient's record. */
  filledNutrition: { ingredientId: string; createdRecord: boolean }[] | null;
  undoneAt: number | null;
  undoneBy: ChangeUndoFrom | null;
  createdAt: number;
}

export interface ChangeActor {
  kind: 'outside' | 'nomos';
  name: string;
}

export interface ChangeContext {
  uid: string;
  actor: ChangeActor;
  now: number;
  timeZone: string;
  /** The share categories the person has on right now: the assistant's reply may quote stored content only from these. */
  allowedCategories: ReadonlySet<string>;
}

/** What the assistant is told: built from what its call sent and the categories that are on, never from the stored before and after text. */
export interface ChangeReply {
  summary: string;
  lines: string[];
}

/** What a change action hands back as `data`: Helm files one execution from `summary`, `lines` and `changes` (the person sees those); only `reply` goes back to the assistant. */
export interface ChangeData {
  summary: string;
  lines: string[];
  reply: ChangeReply;
  changes: { id: string; title: string; lines: string[] }[];
  /** The recipe a change made or edited, to pass on to the recipe tools. */
  recipeId: string | null;
}

/** The ingredients a change reads to match names; a kitchen at the limit may hold more than it saw, so a new one is refused there rather than risk a copy. */
const INGREDIENT_LIMIT = 2000;
const RECIPE_TITLE_LIMIT = 500;
const SAVED_MEAL_LIMIT = 200;
const MAX_ITEMS_PER_CALL = 30;
const PLAN_DAYS_AHEAD = 366;
const DEFAULT_NEW_SERVINGS = 4;

const kitchenPath = (uid: string, collection: string) =>
  `apps/pinch/kitchens/${uid}/${collection}`;

const ref = (
  firestore: Firestore,
  uid: string,
  collection: string,
  id: string,
) => firestore.doc(`${kitchenPath(uid, collection)}/${id}`);

const refused = (message: string): AppActionResult => ({
  status: 'refused',
  message,
});

const ok = (data: ChangeData): AppActionResult => ({
  status: 'ok',
  data,
  heldBack: [],
});

const readText = (value: unknown) =>
  typeof value === 'string' && value !== '' ? value : null;

const readNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const roundAmount = (value: number) => Math.round(value * 100) / 100;

const isValidAmount = (amount: number) =>
  Number.isFinite(amount) && amount > 0 && amount <= MAX_SHOPPING_AMOUNT;

const clipText = (text: string, max: number) => text.trim().slice(0, max);

const toBy = (actor: ChangeActor): OutsideChange['by'] => ({
  kind: actor.kind === 'nomos' ? 'nomos' : 'assistant',
  name: actor.name.trim() === '' ? null : actor.name.trim(),
});

const changeRecord = (
  ctx: ChangeContext,
  fields: Pick<OutsideChange, 'kind' | 'title' | 'lines'> &
    Partial<
      Pick<
        OutsideChange,
        | 'recipeId'
        | 'noteId'
        | 'plannedMealId'
        | 'shoppingItemId'
        | 'addedAmount'
        | 'createdItem'
        | 'previousItem'
        | 'ideaId'
        | 'createdIngredientIds'
        | 'filledNutrition'
      >
    >,
): OutsideChange => ({
  id: randomUUID(),
  by: toBy(ctx.actor),
  recipeId: null,
  noteId: null,
  plannedMealId: null,
  shoppingItemId: null,
  addedAmount: null,
  createdItem: false,
  previousItem: null,
  ideaId: null,
  createdIngredientIds: null,
  filledNutrition: null,
  undoneAt: null,
  undoneBy: null,
  createdAt: ctx.now,
  ...fields,
  lines: capLines(fields.lines),
});

const toData = (
  summary: string,
  records: OutsideChange[],
  reply: ChangeReply,
): ChangeData => ({
  summary,
  reply,
  lines: records.flatMap((record) => record.lines),
  changes: records.map(({ id, title, lines }) => ({ id, title, lines })),
  recipeId: records[0]?.recipeId ?? null,
});

const UNIT_WORDS: Record<string, Unit> = {
  ...Object.fromEntries(
    UNITS.map((unit) => [UNIT_LABELS[unit].toLowerCase(), unit]),
  ),
  gram: 'G',
  grams: 'G',
  kilogram: 'KG',
  kilograms: 'KG',
  ounce: 'OZ',
  ounces: 'OZ',
  pound: 'LB',
  pounds: 'LB',
  lbs: 'LB',
  milliliter: 'ML',
  milliliters: 'ML',
  millilitre: 'ML',
  millilitres: 'ML',
  liter: 'L',
  liters: 'L',
  litre: 'L',
  litres: 'L',
  teaspoon: 'TSP',
  teaspoons: 'TSP',
  tablespoon: 'TBSP',
  tablespoons: 'TBSP',
  cups: 'CUP',
  'fluid ounce': 'FL_OZ',
  'fluid ounces': 'FL_OZ',
  floz: 'FL_OZ',
  pinches: 'PINCH',
  count: 'EACH',
  piece: 'EACH',
  pieces: 'EACH',
  whole: 'EACH',
};

const UNIT_HELP = `Use one of: ${UNITS.filter((unit) => unit !== 'EACH')
  .map((unit) => UNIT_LABELS[unit])
  .join(', ')}; leave the unit out for a plain count.`;

/** The unit a word names, EACH for none, or null when it isn't one Pinch uses. */
const readUnit = (word: string | null | undefined): Unit | null => {
  const key = (word ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (key === '') return 'EACH';
  return Object.hasOwn(UNIT_WORDS, key) ? UNIT_WORDS[key] : null;
};

const toChoice = (
  id: string,
  name: string,
  isCustom: boolean,
): ResolvedIngredient => ({
  id,
  name,
  familyId: null,
  aliases: [],
  per100g: { calories: null, protein: null, carbs: null, fat: null },
  serving: { amount: 100, unit: 'G' },
  gramsPerMl: null,
  gramsEach: null,
  isCustom,
  isAdjusted: false,
  isArchived: false,
});

interface IngredientBook {
  /** What a name can match: the catalog and the person's own, archived ones left out. */
  choices: ResolvedIngredient[];
  /** The person's archived custom ingredients, for telling "archived" from "not in the kitchen". */
  archivedChoices: ResolvedIngredient[];
  /** Every ingredient id the kitchen knows, for naming lines in a change summary. */
  names: Map<string, { name: string }>;
  /** How many ingredient documents the kitchen holds, for the cap on new ones. */
  count: number;
  /** The nutrition each stored record carries (a custom ingredient's, or a catalog one the person adjusted), null when it has none. */
  nutrition: Map<string, NutritionValues | null>;
}

const hasAnyNutrition = (values: unknown) =>
  typeof values === 'object' &&
  values !== null &&
  Object.values(values).some((value) => typeof value === 'number');

const readIngredientBook = async (
  firestore: Firestore,
  uid: string,
): Promise<IngredientBook> => {
  const snapshot = await firestore
    .collection(kitchenPath(uid, 'ingredients'))
    .select('name', 'catalogId', 'isArchived', 'nutritionPer100g')
    .limit(INGREDIENT_LIMIT)
    .get();
  const records = new Map(snapshot.docs.map((doc) => [doc.id, doc]));
  const catalog = Object.entries(CATALOG_NAMES).map(([id, name]) =>
    toChoice(id, readText(records.get(id)?.get('name')) ?? name, false),
  );
  const customs = snapshot.docs.flatMap((doc) => {
    const name = readText(doc.get('name'));
    return doc.get('catalogId') == null && name !== null
      ? [
          {
            ...toChoice(doc.id, name, true),
            isArchived: doc.get('isArchived') === true,
          },
        ]
      : [];
  });
  const choices = [
    ...catalog,
    ...customs.filter((choice) => !choice.isArchived),
  ];
  const archivedChoices = customs.filter((choice) => choice.isArchived);
  return {
    choices,
    archivedChoices,
    names: new Map(
      [...choices, ...archivedChoices].map(
        (choice) => [choice.id, { name: choice.name }] as const,
      ),
    ),
    count: snapshot.size,
    nutrition: new Map(
      snapshot.docs.map((doc) => {
        const values = doc.get('nutritionPer100g') as NutritionValues | null;
        return [doc.id, values ?? null] as const;
      }),
    ),
  };
};

/** Whether an ingredient has any nutrition: a custom one's own, or a catalog one's record when the person set it, else the catalog's. */
const hasNutritionIn = (choice: ResolvedIngredient, stored: unknown) =>
  choice.isCustom || (stored ?? null) !== null
    ? hasAnyNutrition(stored)
    : CATALOG_NUTRITION_IDS.has(choice.id);

const lineShape = z.object({
  name: z
    .string()
    .min(1)
    .max(MAX_NAME_LENGTH)
    .describe(
      'The plain everyday ingredient, singular, with no amount or brand: "Ground beef", not "2 lb lean ground beef". Cut, leanness, variety, brand and preparation (bone-in, skinless, diced, fresh, 93% lean) go in the note: "Ground beef" with note "93% lean". Call pinch_find_ingredients first and use the names the kitchen already has.',
    ),
  amount: z
    .number()
    .positive()
    .nullish()
    .describe('How much; leave it out for "to taste".'),
  unit: z
    .string()
    .max(20)
    .nullish()
    .describe(`The unit of the amount. ${UNIT_HELP}`),
  note: z
    .string()
    .max(MAX_NOTE_LENGTH)
    .nullish()
    .describe(
      'A short note: a preparation such as "finely chopped", the cut, leanness or variety ("93% lean"), or the brand.',
    ),
  group: z
    .string()
    .max(80)
    .nullish()
    .describe('A heading the line sits under, such as "For the sauce".'),
  isNewIngredient: z
    .boolean()
    .nullish()
    .describe(
      'Set true for a real food the person buys that the kitchen does not have yet (pinch_find_ingredients says match is null): Pinch adds it to their ingredients, and its Undo takes it back while nothing else uses it. Leave it out for anything that is not an ingredient to buy, such as "reserved pasta water": that stays a plain line.',
    ),
});

const stepShape = z.object({
  text: z.string().min(1).max(MAX_STEP_LENGTH),
  section: z
    .string()
    .max(80)
    .nullish()
    .describe('A heading the step sits under, such as "Cook the chicken".'),
});

type LineInput = z.infer<typeof lineShape>;
type StepInput = z.infer<typeof stepShape>;

type Built<T> = { kind: 'ok'; value: T } | { kind: 'refused'; message: string };

const lineKey = (
  line: Pick<RecipeIngredient, 'ingredientId' | 'freeText' | 'group'>,
) =>
  `${line.ingredientId ?? `free:${(line.freeText ?? '').toLowerCase()}`}|${(cleanGroupName(line.group) ?? '').toLowerCase()}`;

interface NewIngredient {
  id: string;
  name: string;
}

interface BuiltLines {
  lines: RecipeIngredient[];
  /** The custom ingredients the lines need that the kitchen lacks, to be written with the change. */
  created: NewIngredient[];
  /** Lines that matched a kitchen ingredient once descriptor words were ignored, for the reply and the record. */
  matches: { asked: string; name: string; noteWords: string[] }[];
}

const joinNote = (noteWords: string[], note: string | null | undefined) => {
  const have = (note ?? '').toLowerCase();
  const added = noteWords.filter((word) => !have.includes(word));
  return (
    clipText(
      [added.join(' '), (note ?? '').trim()].filter(Boolean).join(', '),
      MAX_NOTE_LENGTH,
    ) || null
  );
};

/** Lines matched to the person's ingredients and the catalog, on the full name and then with descriptor words ignored (those go to the front of the note). A name that matches nothing becomes a new custom ingredient only when the line says `isNewIngredient`; otherwise it stays a kitchen-free line. A line that is the same as one the recipe has keeps its id, so the recorded change names only what really changed. */
const buildLines = (
  input: LineInput[],
  book: IngredientBook,
  existing: RecipeIngredient[],
): Built<BuiltLines> => {
  if (input.length > MAX_RECIPE_INGREDIENTS) {
    return {
      kind: 'refused',
      message: `A recipe holds up to ${MAX_RECIPE_INGREDIENTS} ingredient lines.`,
    };
  }
  const pool = existing.reduce(
    (byKey, line) =>
      byKey.set(lineKey(line), [...(byKey.get(lineKey(line)) ?? []), line.id]),
    new Map<string, string[]>(),
  );
  const problem = input.flatMap((entry) => {
    if (readUnit(entry.unit) === null) {
      return [`"${entry.unit}" isn't a unit Pinch uses. ${UNIT_HELP}`];
    }
    const amount = entry.amount ?? null;
    return amount !== null && !isValidAmount(amount)
      ? [`The amount for ${entry.name} is off. Use a number above zero.`]
      : [];
  })[0];
  if (problem !== undefined) return { kind: 'refused', message: problem };
  const built = input.reduce(
    (state, entry) => {
      const amount = entry.amount ?? null;
      const name = entry.name.replace(/\s+/g, ' ').trim();
      const found = matchIngredientWithNote(name, state.choices);
      const fresh: NewIngredient | null =
        found || entry.isNewIngredient !== true
          ? null
          : {
              id: randomUUID(),
              name: toDisplayCase(name, {
                style: 'sentence',
                keepAcronyms: true,
              }),
            };
      const ingredientId = found?.ingredient.id ?? fresh?.id ?? null;
      const noteWords = found?.noteWords ?? [];
      const base = {
        ingredientId,
        freeText: ingredientId === null ? name : null,
        group: cleanGroupName(entry.group),
      };
      const reusable = state.pool.get(lineKey(base)) ?? [];
      const line: RecipeIngredient = {
        id: reusable[0] ?? randomUUID(),
        ...base,
        amount: amount === null ? null : Math.round(amount * 10_000) / 10_000,
        unit: amount === null ? 'EACH' : (readUnit(entry.unit) ?? 'EACH'),
        note: joinNote(noteWords, entry.note),
        adaptedFrom: null,
      };
      return {
        pool: new Map(state.pool).set(lineKey(base), reusable.slice(1)),
        lines: [...state.lines, line],
        choices: fresh
          ? [...state.choices, toChoice(fresh.id, fresh.name, true)]
          : state.choices,
        created: fresh ? [...state.created, fresh] : state.created,
        matches:
          found && noteWords.length > 0
            ? [
                ...state.matches,
                { asked: name, name: found.ingredient.name, noteWords },
              ]
            : state.matches,
      };
    },
    {
      pool,
      lines: [] as RecipeIngredient[],
      choices: book.choices,
      created: [] as NewIngredient[],
      matches: [] as BuiltLines['matches'],
    },
  );
  if (built.created.length + book.count > INGREDIENT_LIMIT) {
    return {
      kind: 'refused',
      message: `Pinch's ingredient list is full, so nothing was added. The person can remove ingredients they don't use in Pinch first.`,
    };
  }
  return {
    kind: 'ok',
    value: {
      lines: built.lines,
      created: built.created,
      matches: built.matches,
    },
  };
};

const toNewIngredientRecord = (
  ctx: ChangeContext,
  created: NewIngredient,
): IngredientRecord => ({
  id: created.id,
  catalogId: null,
  name: created.name,
  familyId: null,
  iconKey: null,
  nutritionPer100g: null,
  servingAmount: null,
  servingUnit: null,
  gramsPerMl: null,
  gramsEach: null,
  defaultProductId: null,
  isArchived: false,
  addedBy: toBy(ctx.actor),
  nutritionBy: null,
  createdAt: ctx.now,
  updatedAt: ctx.now,
});

const newIngredientsLines = (created: NewIngredient[]) =>
  created.length === 0
    ? []
    : [
        `Added ${countOf(created.length, 'new ingredient')}: ${created.map((entry) => entry.name).join(', ')}`,
      ];

/** What an assistant is told about the ingredients its lines made and matched: the words it sent, and the kitchen's own names only while ingredients are shared. */
const toIngredientReply = (
  ctx: ChangeContext,
  built: Pick<BuiltLines, 'created' | 'matches'>,
) => [
  ...newIngredientsLines(built.created),
  ...(ctx.allowedCategories.has('recipeIngredients')
    ? built.matches.map(
        ({ asked, name, noteWords }) =>
          `Used your ${name} for '${asked}', ${noteWords.join(' ')} in the note`,
      )
    : []),
];

const buildSteps = (
  input: StepInput[],
): Built<Pick<Recipe, 'steps' | 'stepSections'>> => {
  if (input.length > MAX_RECIPE_STEPS) {
    return {
      kind: 'refused',
      message: `A recipe holds up to ${MAX_RECIPE_STEPS} steps.`,
    };
  }
  const steps = input.map((step) => step.text.trim());
  if (steps.some((step) => step === '')) {
    return { kind: 'refused', message: 'A step can not be empty.' };
  }
  return {
    kind: 'ok',
    value: {
      steps,
      stepSections: toStoredStepSections(
        steps,
        input.map((step) => step.section ?? null),
      ),
    },
  };
};

const recipeFields = {
  title: z
    .string()
    .min(1)
    .max(MAX_RECIPE_TITLE_LENGTH)
    .describe('The recipe name.'),
  servings: z
    .number()
    .positive()
    .max(MAX_SERVING_AMOUNT)
    .describe('How many servings the ingredient amounts make.'),
  prepMinutes: z.number().int().min(0).max(MAX_MINUTES).nullish(),
  cookMinutes: z.number().int().min(0).max(MAX_MINUTES).nullish(),
  description: z
    .string()
    .max(MAX_RECIPE_DESCRIPTION_LENGTH)
    .nullish()
    .describe('One or two sentences about the dish; null or empty clears it.'),
  ingredients: z
    .array(lineShape)
    .max(MAX_RECIPE_INGREDIENTS)
    .describe(
      "The whole ingredient list, not only what changes: it replaces the recipe's list. Names that match one of the person's ingredients or the catalog are linked to it; others are kept as plain lines.",
    ),
  steps: z
    .array(stepShape)
    .max(MAX_RECIPE_STEPS)
    .describe(
      "All the steps in order, not only what changes: it replaces the recipe's steps.",
    ),
};

export const UPDATE_RECIPE_SHAPE = {
  recipeId: z
    .string()
    .min(1)
    .max(128)
    .describe(
      'A recipe id exactly as pinch_search_recipes or pinch_get_meal_plan returned it.',
    ),
  title: recipeFields.title.optional(),
  servings: recipeFields.servings.optional(),
  prepMinutes: recipeFields.prepMinutes,
  cookMinutes: recipeFields.cookMinutes,
  description: recipeFields.description,
  ingredients: recipeFields.ingredients.optional(),
  steps: recipeFields.steps.optional(),
  basedOn: z
    .number()
    .optional()
    .describe(
      'The version pinch_get_recipe returned. Required whenever ingredients or steps are sent, because they replace the whole list: if the recipe was changed in Pinch since you read it, nothing is written and you are told to read it again.',
    ),
};

export const ADD_RECIPE_SHAPE = {
  title: recipeFields.title,
  servings: recipeFields.servings.optional(),
  prepMinutes: recipeFields.prepMinutes,
  cookMinutes: recipeFields.cookMinutes,
  description: recipeFields.description,
  ingredients: recipeFields.ingredients.optional(),
  steps: recipeFields.steps.optional(),
};

export const PLAN_MEAL_SHAPE = {
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe(
      "The day, YYYY-MM-DD, in the person's own time zone; today or later.",
    ),
  mealType: z
    .string()
    .describe(
      `The slot: ${MEAL_TYPES.map((type) => type.toLowerCase()).join(', ')}.`,
    ),
  recipeId: z
    .string()
    .max(128)
    .nullish()
    .describe('A recipe id from pinch_search_recipes.'),
  name: z
    .string()
    .max(MAX_RECIPE_TITLE_LENGTH)
    .nullish()
    .describe(
      "Used only when there is no recipeId: the name of one of the person's saved meals or recipes.",
    ),
  servings: z
    .number()
    .positive()
    .max(MAX_SERVING_AMOUNT)
    .nullish()
    .describe("How many servings; a recipe's own servings when left out."),
};

export const ADD_TO_SHOPPING_LIST_SHAPE = {
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(MAX_NAME_LENGTH),
        amount: z.number().positive().nullish(),
        unit: z
          .string()
          .max(20)
          .nullish()
          .describe(`The unit of the amount. ${UNIT_HELP}`),
      }),
    )
    .min(1)
    .max(MAX_ITEMS_PER_CALL)
    .describe(
      'What to add. The same ingredient in the same unit is added to the line already on the list.',
    ),
};

const readRecipe = (data: FirebaseFirestore.DocumentData): Recipe => ({
  ...(data as Recipe),
  ingredients: Array.isArray(data.ingredients)
    ? (data.ingredients as RecipeIngredient[])
    : [],
  steps: Array.isArray(data.steps) ? (data.steps as string[]) : [],
});

const readLiveRecipe = async (
  transaction: Transaction,
  recipeRef: DocumentReference,
) => {
  const snapshot = await transaction.get(recipeRef);
  const data = snapshot.data();
  return snapshot.exists &&
    data !== undefined &&
    readText(data.title) !== null &&
    data.isArchived !== true
    ? { id: snapshot.id, recipe: readRecipe(data) }
    : null;
};

const NOT_FOUND_RECIPE =
  'No recipe has that id. Use an id from pinch_search_recipes.';

const patchOf = (input: Record<string, unknown>, key: string) =>
  Object.hasOwn(input, key) && input[key] !== undefined;

const META_KEYS = [
  'title',
  'servings',
  'prepMinutes',
  'cookMinutes',
  'description',
] as const;

const countOf = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Lines for the assistant: what its call sent, plus the stored before text only for the categories that are on (a removed step quotes the old step only with full recipes on). */
const toRecipeReply = (
  ctx: ChangeContext,
  input: Record<string, unknown>,
  book: IngredientBook,
  before: ReturnType<typeof getRecipeSnapshot>,
  after: ReturnType<typeof getRecipeSnapshot>,
) => {
  const diff = (part: Partial<typeof after>) =>
    getRecipeChanges(before, { ...before, ...part }, book.names);
  const minutes = (label: string, key: 'prepMinutes' | 'cookMinutes') =>
    !patchOf(input, key)
      ? []
      : [
          after[key] === null
            ? `${label} removed`
            : `${label} set to ${after[key]} min`,
        ];
  const sentMeta = [
    ...(patchOf(input, 'title') ? [`Renamed to “${after.title}”`] : []),
    ...(patchOf(input, 'servings') ? [`Serves ${after.servings}`] : []),
    ...minutes('Prep time', 'prepMinutes'),
    ...minutes('Cook time', 'cookMinutes'),
    ...(patchOf(input, 'description') ? ['Description changed'] : []),
  ];
  const isDescriptionOn = ctx.allowedCategories.has('fullRecipes');
  const meta = ctx.allowedCategories.has('recipes')
    ? [
        ...diff(
          Object.fromEntries(
            META_KEYS.filter(
              (key) =>
                patchOf(input, key) &&
                (key !== 'description' || isDescriptionOn),
            ).map((key) => [key, after[key]]),
          ),
        ),
        ...(patchOf(input, 'description') && !isDescriptionOn
          ? ['Description changed']
          : []),
      ]
    : sentMeta;
  const ingredients = !patchOf(input, 'ingredients')
    ? []
    : ctx.allowedCategories.has('recipeIngredients')
      ? diff({ ingredients: after.ingredients })
      : [`Ingredients replaced (${after.ingredients.length})`];
  const steps = !patchOf(input, 'steps')
    ? []
    : ctx.allowedCategories.has('fullRecipes')
      ? diff({ steps: after.steps, stepSections: after.stepSections })
      : [`Steps replaced (${countOf(after.steps.length, 'step')})`];
  return capLines([...meta, ...ingredients, ...steps]);
};

/** Edits only what was sent, in one transaction that also records it as a change in the recipe's history, so Pinch's own history and Undo treat it like a device save. */
export const updateRecipe = async (
  firestore: Firestore,
  ctx: ChangeContext,
  input: Record<string, unknown>,
): Promise<AppActionResult> => {
  const recipeId = typeof input.recipeId === 'string' ? input.recipeId : '';
  if (recipeId === '' || recipeId.includes('/')) {
    return { status: 'notFound', message: NOT_FOUND_RECIPE };
  }
  const book = await readIngredientBook(firestore, ctx.uid);
  const recipeRef = ref(firestore, ctx.uid, 'recipes', recipeId);
  return firestore.runTransaction(async (transaction) => {
    const [found, notes] = await Promise.all([
      readLiveRecipe(transaction, recipeRef),
      transaction.get(
        firestore.collection(kitchenPath(ctx.uid, 'notes')).count(),
      ),
    ]);
    if (!found) return { status: 'notFound', message: NOT_FOUND_RECIPE };
    if (patchOf(input, 'ingredients') || patchOf(input, 'steps')) {
      const basedOn = readNumber(input.basedOn);
      if (basedOn === null) {
        return refused(
          'Ingredients and steps replace the whole list, so send basedOn: the version pinch_get_recipe returned for this recipe. Read it first, then send every line you want kept.',
        );
      }
      if (basedOn !== (readNumber(found.recipe.updatedAt) ?? 0)) {
        return refused(
          'This recipe was changed in Pinch since you read it, so nothing was written. Read it again with pinch_get_recipe and send your edit based on what it says now.',
        );
      }
    }
    if (notes.data().count >= SOFT_MAX_RECIPE_NOTES) {
      return refused(
        `Pinch keeps up to ${SOFT_MAX_RECIPE_NOTES} entries in its recipe notes and history, and it is full, so this edit can't be recorded. The person can clear old notes in Pinch first.`,
      );
    }
    const before = getRecipeSnapshot(found.recipe);
    const lines = patchOf(input, 'ingredients')
      ? buildLines(
          (input.ingredients ?? []) as LineInput[],
          book,
          found.recipe.ingredients,
        )
      : null;
    const steps = patchOf(input, 'steps')
      ? buildSteps((input.steps ?? []) as StepInput[])
      : null;
    const failed = [lines, steps].find((built) => built?.kind === 'refused');
    if (failed?.kind === 'refused') return refused(failed.message);
    const made = lines?.kind === 'ok' ? lines.value : null;
    const created = made?.created ?? [];
    const liveBook: IngredientBook = {
      ...book,
      names: new Map([
        ...book.names,
        ...created.map((entry) => [entry.id, { name: entry.name }] as const),
      ]),
    };
    const title = patchOf(input, 'title')
      ? clipText(String(input.title), MAX_RECIPE_TITLE_LENGTH)
      : null;
    if (title === '') return refused('The title can not be empty.');
    const after = {
      ...before,
      ...(title !== null && { title }),
      ...(patchOf(input, 'servings') && { servings: Number(input.servings) }),
      ...(patchOf(input, 'prepMinutes') && {
        prepMinutes: readNumber(input.prepMinutes),
      }),
      ...(patchOf(input, 'cookMinutes') && {
        cookMinutes: readNumber(input.cookMinutes),
      }),
      ...(patchOf(input, 'description') && {
        description: readText(
          clipText(
            String(input.description ?? ''),
            MAX_RECIPE_DESCRIPTION_LENGTH,
          ),
        ),
      }),
      ...(made && { ingredients: made.lines }),
      ...(steps?.kind === 'ok' && steps.value),
    };
    const changes = getRecipeChanges(before, after, liveBook.names);
    const isTitleShown = ctx.allowedCategories.has('recipes');
    if (changes.length === 0) {
      const summary = `Nothing needed changing: ${isTitleShown ? found.recipe.title : 'the recipe'} already reads that way.`;
      return ok({
        summary,
        reply: { summary, lines: [] },
        lines: [],
        changes: [],
        recipeId,
      });
    }
    const noteId = randomUUID();
    const note: RecipeNote = {
      id: noteId,
      recipeId,
      kind: 'TWEAK',
      text: null,
      changes,
      cookId: null,
      stepIndex: null,
      stepText: null,
      reason: null,
      previous: changes.every(isUnrestoredLine) ? null : before,
      by: toBy(ctx.actor),
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
    const record = changeRecord(ctx, {
      kind: 'recipeUpdated',
      title: after.title,
      lines: [...changes, ...newIngredientsLines(created)],
      recipeId,
      noteId,
      createdIngredientIds:
        created.length === 0 ? null : created.map((entry) => entry.id),
    });
    transaction.update(recipeRef, {
      title: after.title,
      categories: after.categories,
      description: after.description,
      servings: after.servings,
      prepMinutes: after.prepMinutes,
      cookMinutes: after.cookMinutes,
      ingredients: after.ingredients,
      steps: after.steps,
      stepSections: toStoredStepSections(after.steps, after.stepSections),
      care: after.care,
      links: after.links,
      nutritionOverride: after.nutritionOverride,
      sourceId: after.sourceId,
      updatedAt: ctx.now,
      ...('isArchived' in found.recipe ? {} : { isArchived: false }),
    });
    transaction.create(ref(firestore, ctx.uid, 'notes', noteId), note);
    created.forEach((entry) =>
      transaction.create(
        ref(firestore, ctx.uid, 'ingredients', entry.id),
        toNewIngredientRecord(ctx, entry),
      ),
    );
    transaction.create(
      ref(firestore, ctx.uid, 'outsideChanges', record.id),
      record,
    );
    return ok(
      toData(`Changed ${after.title} in Pinch.`, [record], {
        summary: `Changed ${isTitleShown ? after.title : 'the recipe'} in Pinch.`,
        lines: capLines([
          ...toIngredientReply(ctx, { created, matches: made?.matches ?? [] }),
          ...toRecipeReply(ctx, input, liveBook, before, after),
        ]),
      }),
    );
  });
};

export const addRecipe = async (
  firestore: Firestore,
  ctx: ChangeContext,
  input: Record<string, unknown>,
): Promise<AppActionResult> => {
  const title = clipText(String(input.title ?? ''), MAX_RECIPE_TITLE_LENGTH);
  if (title === '') return refused('The recipe needs a title.');
  const book = await readIngredientBook(firestore, ctx.uid);
  const lines = buildLines((input.ingredients ?? []) as LineInput[], book, []);
  const steps = buildSteps((input.steps ?? []) as StepInput[]);
  if (lines.kind === 'refused') return refused(lines.message);
  if (steps.kind === 'refused') return refused(steps.message);
  const id = randomUUID();
  const recipe: Recipe = {
    id,
    title,
    categories: [],
    description: readText(
      clipText(String(input.description ?? ''), MAX_RECIPE_DESCRIPTION_LENGTH),
    ),
    servings: readNumber(input.servings) ?? DEFAULT_NEW_SERVINGS,
    prepMinutes: readNumber(input.prepMinutes),
    cookMinutes: readNumber(input.cookMinutes),
    coverPath: null,
    coverUrl: null,
    ingredients: lines.value.lines,
    steps: steps.value.steps,
    stepSections: steps.value.stepSections,
    care: null,
    links: [],
    nutritionOverride: null,
    source: 'MANUAL',
    sourceId: null,
    collectionIds: [],
    isArchived: false,
    isFavorite: false,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  const record = changeRecord(ctx, {
    kind: 'recipeAdded',
    title,
    lines: [
      `Added the recipe ${title}`,
      `${countOf(lines.value.lines.length, 'ingredient')}, ${countOf(steps.value.steps.length, 'step')}`,
      ...newIngredientsLines(lines.value.created),
    ],
    recipeId: id,
    createdIngredientIds:
      lines.value.created.length === 0
        ? null
        : lines.value.created.map((entry) => entry.id),
  });
  const isFull = await firestore.runTransaction(async (transaction) => {
    const count = await transaction.get(
      firestore.collection(kitchenPath(ctx.uid, 'recipes')).count(),
    );
    if (count.data().count >= SOFT_MAX_RECIPES) return true;
    transaction.create(ref(firestore, ctx.uid, 'recipes', id), recipe);
    lines.value.created.forEach((entry) =>
      transaction.create(
        ref(firestore, ctx.uid, 'ingredients', entry.id),
        toNewIngredientRecord(ctx, entry),
      ),
    );
    transaction.create(
      ref(firestore, ctx.uid, 'outsideChanges', record.id),
      record,
    );
    return false;
  });
  if (isFull) {
    return refused(
      `Pinch keeps up to ${SOFT_MAX_RECIPES} recipes and it is full, so nothing was added. The person can delete some in Pinch first.`,
    );
  }
  const summary = `Added ${title} to Pinch's recipes.`;
  return ok(
    toData(summary, [record], {
      summary,
      lines: [
        `${countOf(lines.value.lines.length, 'ingredient')}, ${countOf(steps.value.steps.length, 'step')}`,
        ...toIngredientReply(ctx, lines.value),
      ],
    }),
  );
};

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const nameMatcher = createOptionMatcher<{ id: string; name: string }>({
  names: (option) => [option.name],
});

/** Puts a recipe, or one of the person's saved meals, on a day and slot as its own copy of the plate, the way the planner does. */
export const planMeal = async (
  firestore: Firestore,
  ctx: ChangeContext,
  input: Record<string, unknown>,
): Promise<AppActionResult> => {
  const day = String(input.date ?? '');
  const date = dayToUtcMidnight(day);
  const today = dayToUtcMidnight(getLocalMoment(ctx.now, ctx.timeZone).day);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(date)) {
    return refused('The date must be a day written YYYY-MM-DD.');
  }
  if (date < today) {
    return refused('Pinch plans from today on; that day has already passed.');
  }
  if (date > today + PLAN_DAYS_AHEAD * 86_400_000) {
    return refused('That day is more than a year ahead.');
  }
  const mealType = MEAL_TYPES.find(
    (type) =>
      type ===
      String(input.mealType ?? '')
        .trim()
        .toUpperCase(),
  );
  if (!mealType) {
    return refused(
      `The slot must be one of: ${MEAL_TYPES.map((type) => type.toLowerCase()).join(', ')}.`,
    );
  }
  const servings = readNumber(input.servings);
  const recipeId = readText(input.recipeId);
  const name = readText(input.name);
  if (recipeId === null && name === null) {
    return refused(
      'Say which recipe: a recipeId from pinch_search_recipes, or the name of a saved meal or recipe.',
    );
  }
  const planned = await resolvePlate(
    firestore,
    ctx.uid,
    recipeId,
    name,
    servings,
    {
      isRecipesOn: ctx.allowedCategories.has('recipes'),
      isSavedMealsOn: ctx.allowedCategories.has('savedMeals'),
    },
  );
  if (planned.kind === 'refused') return planned.result;
  const id = randomUUID();
  const rows: MealItem[] = planned.items.map((item) => ({
    id: randomUUID(),
    ...item,
  }));
  const meal: PlannedMeal = {
    id,
    date,
    mealType,
    name: planned.savedMeal?.name ?? null,
    sourceMealId: planned.savedMeal?.id ?? null,
    items: rows,
    refIds: Array.from(new Set(rows.map((row) => row.refId))),
    snapshot: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  const record = changeRecord(ctx, {
    kind: 'mealPlanned',
    title: planned.title,
    lines: [
      `${MEAL_TYPE_LABELS[mealType as MealType]} on ${dayFormatter.format(date)}`,
    ],
    plannedMealId: id,
    recipeId: planned.recipeId,
  });
  const isFull = await firestore.runTransaction(async (transaction) => {
    const count = await transaction.get(
      firestore.collection(kitchenPath(ctx.uid, 'plannedMeals')).count(),
    );
    if (count.data().count >= SOFT_MAX_PLANNED_MEALS) return true;
    transaction.create(ref(firestore, ctx.uid, 'plannedMeals', id), meal);
    transaction.create(
      ref(firestore, ctx.uid, 'outsideChanges', record.id),
      record,
    );
    return false;
  });
  if (isFull) {
    return refused(
      `Pinch's plan holds up to ${SOFT_MAX_PLANNED_MEALS} meals and it is full, so nothing was planned. The person can clear old days in Pinch first.`,
    );
  }
  const when = `${MEAL_TYPE_LABELS[mealType as MealType].toLowerCase()} on ${dayFormatter.format(date)}`;
  return ok(
    toData(`Planned ${planned.title} for ${when}.`, [record], {
      summary: `Planned ${planned.replyTitle} for ${when}.`,
      lines: [],
    }),
  );
};

type Plate =
  | {
      kind: 'ok';
      title: string;
      /** What the assistant may be told: the stored name only when its category is on. */
      replyTitle: string;
      recipeId: string | null;
      savedMeal: { id: string; name: string } | null;
      items: Omit<MealItem, 'id'>[];
    }
  | { kind: 'refused'; result: AppActionResult };

const resolvePlate = async (
  firestore: Firestore,
  uid: string,
  recipeId: string | null,
  name: string | null,
  servings: number | null,
  open: { isRecipesOn: boolean; isSavedMealsOn: boolean },
): Promise<Plate> => {
  const unknown = (what: string): Plate => ({
    kind: 'refused',
    result: refused(
      `${what} isn't in Pinch. Use a recipeId from pinch_search_recipes, or the exact name of a saved meal or recipe.`,
    ),
  });
  const planRecipe = async (id: string): Promise<Plate> => {
    if (id.includes('/')) return unknown('That recipe');
    const snapshot = await ref(firestore, uid, 'recipes', id).get();
    const title = readText(snapshot.get('title'));
    if (
      !snapshot.exists ||
      title === null ||
      snapshot.get('isArchived') === true
    ) {
      return unknown('That recipe');
    }
    return {
      kind: 'ok',
      title,
      replyTitle: open.isRecipesOn ? title : 'the recipe',
      recipeId: id,
      savedMeal: null,
      items: [
        {
          kind: 'RECIPE',
          refId: id,
          servings: servings ?? readNumber(snapshot.get('servings')) ?? 1,
        },
      ],
    };
  };
  if (recipeId !== null) return planRecipe(recipeId);
  if (!open.isRecipesOn && !open.isSavedMealsOn) {
    return {
      kind: 'refused',
      result: refused(
        'Pinch can only place a meal by name when this assistant may read the person\'s apps and they share their recipes or saved meals. Use a recipeId from pinch_search_recipes, or ask the person to turn on "Read your apps" for this assistant in Helm > Settings > Connected assistants.',
      ),
    };
  }
  const [meals, recipes] = await Promise.all([
    open.isSavedMealsOn
      ? firestore
          .collection(kitchenPath(uid, 'meals'))
          .limit(SAVED_MEAL_LIMIT)
          .get()
      : null,
    open.isRecipesOn
      ? firestore
          .collection(kitchenPath(uid, 'recipes'))
          .select('title', 'isArchived')
          .limit(RECIPE_TITLE_LIMIT)
          .get()
      : null,
  ]);
  const wanted = name ?? '';
  const meal = nameMatcher.match(
    wanted,
    (meals?.docs ?? []).flatMap((doc) => {
      const mealName = readText(doc.get('name'));
      return mealName === null ? [] : [{ id: doc.id, name: mealName }];
    }),
  );
  if (meal) {
    const items = (
      (meals?.docs.find((doc) => doc.id === meal.id)?.get('items') ??
        []) as Partial<MealItem>[]
    ).flatMap((item) =>
      (item.kind === 'RECIPE' || item.kind === 'INGREDIENT') &&
      typeof item.refId === 'string'
        ? [
            {
              kind: item.kind,
              refId: item.refId,
              servings: readNumber(item.servings) ?? 1,
            },
          ]
        : [],
    );
    return items.length === 0 || items.length > MAX_MEAL_ITEMS
      ? unknown(`The saved meal ${meal.name}`)
      : {
          kind: 'ok',
          title: meal.name,
          replyTitle: meal.name,
          recipeId: null,
          savedMeal: meal,
          items,
        };
  }
  const recipe = nameMatcher.match(
    wanted,
    (recipes?.docs ?? []).flatMap((doc) => {
      const title = readText(doc.get('title'));
      return title === null || doc.get('isArchived') === true
        ? []
        : [{ id: doc.id, name: title }];
    }),
  );
  return recipe ? planRecipe(recipe.id) : unknown(`"${wanted}"`);
};

interface ShoppingWrite {
  line: WantedLine;
  record: OutsideChange | null;
}

interface WantedLine {
  id: string;
  ingredientId: string;
  unit: Unit;
  amount: number | null;
  name: string;
  /** The name of an ingredient this add creates for a word nothing matched. */
  newName: string | null;
}

interface ShoppingLineInput {
  name: string;
  amount?: number | null;
  unit?: string | null;
}

/** Adds to the list the way Pinch's own add does and never ticks or removes: an open line gains the amount, a ticked one starts again with just this amount, a missing one is created. Each line is its own recorded change, so Undo can take back one. */
export const addToShoppingList = async (
  firestore: Firestore,
  ctx: ChangeContext,
  input: Record<string, unknown>,
): Promise<AppActionResult> => {
  const requested = (
    Array.isArray(input.items) ? input.items : []
  ) as ShoppingLineInput[];
  if (requested.length === 0) return refused('Pick something to add.');
  if (requested.length > MAX_ITEMS_PER_CALL) {
    return refused(`Add up to ${MAX_ITEMS_PER_CALL} things at a time.`);
  }
  const book = await readIngredientBook(firestore, ctx.uid);
  const problem = requested.flatMap((entry) => {
    if (readUnit(entry.unit) === null) {
      return [`"${entry.unit}" isn't a unit Pinch uses. ${UNIT_HELP}`];
    }
    const amount = entry.amount ?? null;
    return amount !== null && !isValidAmount(roundAmount(amount))
      ? [`The amount for ${entry.name} is off. Use a number above zero.`]
      : [];
  })[0];
  if (problem !== undefined) return refused(problem);
  const { wanted } = requested.reduce(
    (built, entry) => {
      const amount = entry.amount ?? null;
      const typed = entry.name.replace(/\s+/g, ' ').trim();
      const match =
        matchIngredientWithNote(typed, book.choices)?.ingredient ?? null;
      const freshKey = typed.toLowerCase();
      const freshId = built.freshIds.get(freshKey) ?? randomUUID();
      const ingredientId = match?.id ?? freshId;
      const name =
        match?.name ??
        toDisplayCase(typed, { style: 'sentence', keepAcronyms: true });
      const lineUnit =
        amount === null ? 'EACH' : (readUnit(entry.unit) ?? 'EACH');
      const id = `${ingredientId}__${lineUnit}`;
      const known = built.wanted.get(id);
      return {
        freshIds: match
          ? built.freshIds
          : new Map(built.freshIds).set(freshKey, freshId),
        wanted: new Map(built.wanted).set(id, {
          id,
          ingredientId,
          unit: lineUnit,
          amount:
            amount === null && (known?.amount ?? null) === null
              ? null
              : Math.min(
                  roundAmount((known?.amount ?? 0) + (amount ?? 0)),
                  MAX_SHOPPING_AMOUNT,
                ),
          name,
          newName: match ? null : name,
        }),
      };
    },
    {
      freshIds: new Map<string, string>(),
      wanted: new Map<string, WantedLine>(),
    },
  );
  const sums = [...wanted.values()];
  const outcome = await firestore.runTransaction(async (transaction) => {
    const [snapshots, count] = await Promise.all([
      Promise.all(
        sums.map((line) =>
          transaction.get(ref(firestore, ctx.uid, 'shoppingItems', line.id)),
        ),
      ),
      transaction.get(
        firestore.collection(kitchenPath(ctx.uid, 'shoppingItems')).count(),
      ),
    ]);
    const created = snapshots.filter((snapshot) => !snapshot.exists).length;
    if (count.data().count + created > SOFT_MAX_SHOPPING_ITEMS) {
      return {
        kind: 'refused' as const,
        result: refused(
          ctx.allowedCategories.has('shoppingList')
            ? `The shopping list is full (${SOFT_MAX_SHOPPING_ITEMS} items). The person can clear what they got in Pinch first.`
            : 'Pinch could not add these. The person can make room on their shopping list in Pinch first.',
        ),
      };
    }
    const written = sums.flatMap((line, index): ShoppingWrite[] => {
      const snapshot = snapshots[index];
      const existing = snapshot.exists
        ? (snapshot.data() as ShoppingItem)
        : null;
      const kept = existing && !existing.isChecked ? existing.amount : null;
      const sum =
        kept === null && line.amount === null
          ? null
          : Math.min(
              roundAmount((kept ?? 0) + (line.amount ?? 0)),
              MAX_SHOPPING_AMOUNT,
            );
      const isChanged =
        existing === null ||
        existing.isChecked ||
        (line.amount !== null && sum !== existing.amount);
      if (!isChanged) return [{ line, record: null }];
      const where = UNIT_LABELS[line.unit];
      const what =
        line.amount === null
          ? line.name
          : `${line.amount}${line.unit === 'EACH' ? '' : ` ${where}`} ${line.name}`;
      const record = changeRecord(ctx, {
        kind: 'shoppingAdded',
        title: line.name,
        lines: [
          existing === null
            ? `Added ${what} to the shopping list`
            : existing.isChecked
              ? `Put ${what} back on the shopping list`
              : `Added ${what} to what was already on the list`,
        ],
        shoppingItemId: line.id,
        createdIngredientIds:
          existing === null && line.newName !== null
            ? [line.ingredientId]
            : null,
        addedAmount: existing === null ? null : line.amount,
        createdItem: existing === null,
        previousItem: existing
          ? { amount: existing.amount, isChecked: existing.isChecked }
          : null,
      });
      if (existing) {
        transaction.update(snapshot.ref, {
          amount: sum,
          isChecked: false,
          updatedAt: ctx.now,
        });
      } else {
        const item: ShoppingItem = {
          id: line.id,
          ingredientId: line.ingredientId,
          unit: line.unit,
          createdAt: ctx.now,
          amount: sum,
          isChecked: false,
          updatedAt: ctx.now,
          sources: [],
          pantryAddedAt: null,
        };
        transaction.set(snapshot.ref, item);
        if (line.newName !== null) {
          transaction.set(
            ref(firestore, ctx.uid, 'ingredients', line.ingredientId),
            toNewIngredientRecord(ctx, {
              id: line.ingredientId,
              name: line.newName,
            }),
          );
        }
      }
      transaction.create(
        ref(firestore, ctx.uid, 'outsideChanges', record.id),
        record,
      );
      return [{ line, record }];
    });
    return { kind: 'ok' as const, written };
  });
  if (outcome.kind === 'refused') return outcome.result;
  const records = outcome.written;
  const made = records.flatMap(({ record }) => (record ? [record] : []));
  const already = records.flatMap(({ line, record }) =>
    record ? [] : [`${line.name} was already on the list`],
  );
  const summary =
    made.length === 0
      ? 'Everything was already on the shopping list.'
      : `Added ${countOf(made.length, 'thing')} to the shopping list.`;
  const isListShown = ctx.allowedCategories.has('shoppingList');
  return ok({
    summary,
    reply: isListShown
      ? {
          summary,
          lines: [...made.flatMap((record) => record.lines), ...already],
        }
      : {
          summary: `Added ${countOf(sums.length, 'item')} to the shopping list.`,
          lines: [],
        },
    lines: [...made.flatMap((record) => record.lines), ...already],
    changes: made.map(({ id, title, lines: changeLines }) => ({
      id,
      title,
      lines: changeLines,
    })),
    recipeId: null,
  });
};

export const SAVE_IDEA_SHAPE = {
  title: z
    .string()
    .min(1)
    .max(MAX_IDEA_TITLE_LENGTH)
    .describe('A short name for the idea, such as "Smoky lentil soup".'),
  url: z
    .string()
    .max(MAX_IDEA_URL_LENGTH)
    .nullish()
    .describe(
      'A link to the recipe, a web address starting with http:// or https://. Leave it out for an idea with no link.',
    ),
  note: z
    .string()
    .max(MAX_IDEA_NOTE_LENGTH)
    .nullish()
    .describe('Why it is worth trying, or what to remember about it.'),
};

/** Saves a link or a written idea the way Pinch's own Ideas screen does: never changes or removes one, and refuses a link or title that is already saved. */
export const saveIdea = async (
  firestore: Firestore,
  ctx: ChangeContext,
  input: Record<string, unknown>,
): Promise<AppActionResult> => {
  const title = clipText(String(input.title ?? ''), MAX_IDEA_TITLE_LENGTH);
  if (title === '') return refused('The idea needs a title.');
  const note = readText(
    clipText(String(input.note ?? ''), MAX_IDEA_NOTE_LENGTH),
  );
  const typedUrl = readText(
    typeof input.url === 'string' ? input.url.trim() : null,
  );
  const url =
    typedUrl !== null && /^https?:\/\//i.test(typedUrl)
      ? toWebLink(typedUrl)
      : null;
  if (typedUrl !== null && (url === null || url.length > MAX_IDEA_URL_LENGTH)) {
    return refused(
      'The link has to be a web address that starts with http:// or https://, so nothing was saved. Leave the link out to save a written idea.',
    );
  }
  const host = url === null ? null : getWebLinkHost(url);
  const id = randomUUID();
  const idea: Idea = {
    id,
    kind: url === null ? 'TEXT' : 'LINK',
    title,
    note,
    url,
    siteName: host === null ? null : host.slice(0, MAX_IDEA_SITE_NAME_LENGTH),
    imageUrl: null,
    photoPath: null,
    recipeId: null,
    by: toBy(ctx.actor),
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  const firstLine =
    (note ?? '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? null;
  const lines = [
    ...(host === null ? [] : [`From ${host}`]),
    ...(firstLine === null ? [] : [clipText(firstLine, 100)]),
  ];
  const record = changeRecord(ctx, {
    kind: 'ideaSaved',
    title,
    lines,
    ideaId: id,
  });
  const isIdeasOn = ctx.allowedCategories.has('ideas');
  const comparableUrl = url === null ? null : getComparableUrl(url);
  const outcome = await firestore.runTransaction(async (transaction) => {
    const { docs } = await transaction.get(
      firestore
        .collection(kitchenPath(ctx.uid, 'ideas'))
        .select('title', 'url'),
    );
    if (docs.length >= SOFT_MAX_IDEAS) {
      return `Pinch's ideas hold up to ${SOFT_MAX_IDEAS} and the list is full, so nothing was saved. The person can delete some in Pinch first.`;
    }
    const sameLink = docs.find((doc) => {
      const stored = readText(doc.get('url'));
      return (
        comparableUrl !== null &&
        stored !== null &&
        getComparableUrl(stored) === comparableUrl
      );
    });
    if (sameLink) {
      return isIdeasOn
        ? `That link is already saved as the idea “${readText(sameLink.get('title')) ?? 'Untitled'}”, so nothing was saved.`
        : 'That link is already in the ideas, so nothing was saved.';
    }
    const sameTitle = docs.find(
      (doc) =>
        readText(doc.get('title'))?.trim().toLowerCase() ===
        title.toLowerCase(),
    );
    if (sameTitle) {
      return isIdeasOn
        ? `An idea called “${readText(sameTitle.get('title'))}” is already saved, so nothing was saved.`
        : 'An idea with that title is already saved, so nothing was saved.';
    }
    transaction.create(ref(firestore, ctx.uid, 'ideas', id), idea);
    transaction.create(
      ref(firestore, ctx.uid, 'outsideChanges', record.id),
      record,
    );
    return null;
  });
  if (outcome !== null) return refused(outcome);
  const summary = `Saved the idea “${title}” in Pinch's Ideas.`;
  return ok(toData(summary, [record], { summary, lines }));
};

const MAX_FIND_NAMES = 50;

export const FIND_INGREDIENTS_SHAPE = {
  names: z
    .array(z.string().min(1).max(MAX_NAME_LENGTH))
    .min(1)
    .max(MAX_FIND_NAMES)
    .describe(
      'Ingredient names as a recipe would write them, such as "lean ground beef". Each answer says which of the kitchen\'s own names it is, and any words (like "lean") to put in the line\'s note.',
    ),
};

export interface FoundIngredient {
  asked: string;
  match: { name: string; hasNutrition: boolean } | null;
  noteWords: string[];
  close: string[];
}

/** Which of the names the kitchen already has, by exactly the matching recipe lines use. */
export const findIngredients = async (
  firestore: Firestore,
  uid: string,
  input: Record<string, unknown>,
): Promise<
  | { kind: 'ok'; value: FoundIngredient[] }
  | { kind: 'refused'; message: string }
> => {
  const names = (Array.isArray(input.names) ? input.names : []).flatMap(
    (name) =>
      typeof name === 'string' && name.trim() !== ''
        ? [name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)]
        : [],
  );
  if (names.length === 0 || names.length > MAX_FIND_NAMES) {
    return {
      kind: 'refused',
      message: `Send between 1 and ${MAX_FIND_NAMES} names.`,
    };
  }
  const book = await readIngredientBook(firestore, uid);
  return {
    kind: 'ok',
    value: names.map((asked) => {
      const found = matchIngredientWithNote(asked, book.choices);
      return {
        asked,
        match: found && {
          name: found.ingredient.name,
          hasNutrition: hasNutritionIn(
            found.ingredient,
            book.nutrition.get(found.ingredient.id),
          ),
        },
        noteWords: found?.noteWords ?? [],
        close: found ? [] : suggestIngredients(asked, book.choices),
      };
    }),
  };
};

const NUTRITION_LIMITS = {
  calories: 900,
  protein: 100,
  carbs: 100,
  fat: 100,
} as const;

const nutritionNumber = (key: keyof typeof NUTRITION_LIMITS) =>
  z
    .number()
    .min(0)
    .max(NUTRITION_LIMITS[key])
    .nullable()
    .describe(
      key === 'calories' ? 'kcal per 100 g' : `grams of ${key} per 100 g`,
    );

export const FILL_NUTRITION_SHAPE = {
  items: z
    .array(
      z.object({
        ingredient: z
          .string()
          .min(1)
          .max(MAX_NAME_LENGTH)
          .describe(
            "An ingredient already in the person's kitchen, by the name pinch_find_ingredients gave.",
          ),
        per100g: z
          .object({
            calories: nutritionNumber('calories'),
            protein: nutritionNumber('protein'),
            carbs: nutritionNumber('carbs'),
            fat: nutritionNumber('fat'),
          })
          .describe(
            'Per 100 g, from a source you trust. Give null for a value you do not know; at least one must be a number.',
          ),
      }),
    )
    .min(1)
    .max(MAX_ITEMS_PER_CALL)
    .describe(
      'Ingredients to fill in. Only an ingredient with no nutrition yet is filled; one that has any is left as the person set it.',
    ),
};

const readNutritionItem = (
  value: unknown,
): { ingredient: string; per100g: NutritionValues } | null => {
  const entry = (value ?? {}) as Record<string, unknown>;
  const ingredient =
    typeof entry.ingredient === 'string'
      ? entry.ingredient.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
      : '';
  const given = (entry.per100g ?? {}) as Record<string, unknown>;
  const read = (key: keyof typeof NUTRITION_LIMITS) => {
    const number = given[key] ?? null;
    return number === null ||
      (typeof number === 'number' &&
        Number.isFinite(number) &&
        number >= 0 &&
        number <= NUTRITION_LIMITS[key])
      ? (number as number | null)
      : undefined;
  };
  const per100g = {
    calories: read('calories'),
    protein: read('protein'),
    carbs: read('carbs'),
    fat: read('fat'),
  };
  const values = Object.values(per100g);
  return ingredient === '' ||
    values.includes(undefined) ||
    values.every((number) => number === null)
    ? null
    : { ingredient, per100g: per100g as NutritionValues };
};

const formatNutrition = (values: NutritionValues) =>
  [
    values.calories === null ? null : `${values.calories} kcal`,
    values.protein === null ? null : `${values.protein} g protein`,
    values.carbs === null ? null : `${values.carbs} g carbs`,
    values.fat === null ? null : `${values.fat} g fat`,
  ]
    .filter((part) => part !== null)
    .join(', ');

interface NutritionTarget {
  ingredient: string;
  per100g: NutritionValues;
  choice: ResolvedIngredient | null;
  why: string | null;
}

interface NutritionFill extends NutritionTarget {
  choice: ResolvedIngredient;
  snapshot: DocumentSnapshot;
  createdRecord: boolean;
}

/** Gives nutrition to ingredients that have none, never changing what the person or the catalog already holds, and never making an ingredient. */
export const fillNutrition = async (
  firestore: Firestore,
  ctx: ChangeContext,
  input: Record<string, unknown>,
): Promise<AppActionResult> => {
  const rows = Array.isArray(input.items) ? input.items : [];
  if (rows.length === 0 || rows.length > MAX_ITEMS_PER_CALL) {
    return refused(`Send between 1 and ${MAX_ITEMS_PER_CALL} ingredients.`);
  }
  const items = rows.map(readNutritionItem);
  const bad = items.findIndex((item) => item === null);
  if (bad >= 0) {
    return refused(
      `The nutrition for item ${bad + 1} is off, so nothing was changed. Each needs an ingredient name and numbers per 100 g (calories up to ${NUTRITION_LIMITS.calories}, the rest up to ${NUTRITION_LIMITS.protein}), at least one of them not null.`,
    );
  }
  const book = await readIngredientBook(firestore, ctx.uid);
  const resolved = items.flatMap((item): NutritionTarget[] => {
    if (item === null) return [];
    const active = matchIngredientWithNote(item.ingredient, book.choices);
    if (active) return [{ ...item, choice: active.ingredient, why: null }];
    const archived = matchIngredientWithNote(
      item.ingredient,
      book.archivedChoices,
    );
    return [
      {
        ...item,
        choice: null,
        why: archived
          ? `${item.ingredient} is archived in Pinch, so it was skipped.`
          : `${item.ingredient} isn't in the kitchen, so it was skipped. Fill nutrition only for an ingredient Pinch already has.`,
      },
    ];
  });
  const outcome = await firestore.runTransaction(async (transaction) => {
    const snapshots = await Promise.all(
      resolved.map((entry) =>
        entry.choice
          ? transaction.get(
              ref(firestore, ctx.uid, 'ingredients', entry.choice.id),
            )
          : null,
      ),
    );
    const { filled, skipped } = resolved.reduce(
      (state, entry, index) => {
        const { choice } = entry;
        const snapshot = snapshots[index];
        if (choice === null || snapshot === null) {
          return { ...state, skipped: [...state.skipped, entry.why ?? ''] };
        }
        if (state.filled.some((done) => done.choice.id === choice.id)) {
          return {
            ...state,
            skipped: [
              ...state.skipped,
              `${entry.ingredient} was listed twice, so only the first was used.`,
            ],
          };
        }
        if (choice.isCustom && !snapshot.exists) {
          return {
            ...state,
            skipped: [
              ...state.skipped,
              `${entry.ingredient} isn't in the kitchen, so it was skipped.`,
            ],
          };
        }
        if (choice.isCustom && snapshot.get('isArchived') === true) {
          return {
            ...state,
            skipped: [
              ...state.skipped,
              `${entry.ingredient} is archived in Pinch, so it was skipped.`,
            ],
          };
        }
        if (hasNutritionIn(choice, snapshot.get('nutritionPer100g'))) {
          return {
            ...state,
            skipped: [
              ...state.skipped,
              `${entry.ingredient} already has nutrition; only the person can change it.`,
            ],
          };
        }
        return {
          ...state,
          filled: [
            ...state.filled,
            { ...entry, choice, snapshot, createdRecord: !snapshot.exists },
          ],
        };
      },
      {
        filled: [] as NutritionFill[],
        skipped: [] as string[],
      },
    );
    if (filled.length === 0) return { kind: 'none' as const, skipped };
    const by = toBy(ctx.actor);
    filled.forEach((entry) => {
      const values = {
        nutritionPer100g: entry.per100g,
        nutritionBy: by,
        updatedAt: ctx.now,
      };
      if (!entry.createdRecord) {
        transaction.update(entry.snapshot.ref, values);
        return;
      }
      const record: IngredientRecord = {
        id: entry.choice.id,
        catalogId: entry.choice.id,
        name: null,
        familyId: null,
        iconKey: null,
        servingAmount: null,
        servingUnit: null,
        gramsPerMl: null,
        gramsEach: null,
        defaultProductId: null,
        isArchived: false,
        addedBy: null,
        createdAt: ctx.now,
        ...values,
      };
      transaction.create(entry.snapshot.ref, record);
    });
    const change = changeRecord(ctx, {
      kind: 'nutritionFilled',
      title:
        filled.length === 1
          ? filled[0].choice.name
          : `Nutrition for ${filled.length} ingredients`,
      lines: filled.map(
        (entry) =>
          `${entry.choice.name}: ${formatNutrition(entry.per100g)} per 100 g`,
      ),
      filledNutrition: filled.map((entry) => ({
        ingredientId: entry.choice.id,
        createdRecord: entry.createdRecord,
      })),
    });
    transaction.create(
      ref(firestore, ctx.uid, 'outsideChanges', change.id),
      change,
    );
    return { kind: 'filled' as const, change, filled, skipped };
  });
  if (outcome.kind === 'none') {
    return refused(`Nothing was changed. ${outcome.skipped.join(' ')}`);
  }
  const summary = `Filled in nutrition for ${countOf(outcome.filled.length, 'ingredient')} in Pinch.`;
  return ok(
    toData(summary, [outcome.change], {
      summary,
      lines: capLines([
        ...outcome.filled.map(
          (entry) =>
            `${entry.ingredient}: ${formatNutrition(entry.per100g)} per 100 g`,
        ),
        ...outcome.skipped,
      ]),
    }),
  );
};

/** `isSettled`: nothing is left to take back (already taken back, or what it touched is gone), so a caller can stop offering Undo. */
type Undone = { ok: true } | { ok: false; message: string; isSettled: boolean };

const takenBackIn = (by: ChangeUndoFrom | null) =>
  `Already taken back in ${by === 'helm' ? 'Helm' : 'Pinch'}.`;

const kitchenCollection = (firestore: Firestore, uid: string, name: string) =>
  firestore.collection(kitchenPath(uid, name));

/** Which of these ingredients something still points at: a recipe line, a saved meal, a price, a shopping item, a package in the kitchen or a planned meal. Recipes and saved meals carry no id index, so they are read once whole; the rest are asked by id. `except` is what the undo itself is about to remove or restore. */
const readIngredientsInUse = async (
  firestore: Firestore,
  transaction: Transaction,
  uid: string,
  ids: string[],
  except: { recipeId: string | null; shoppingItemId: string | null },
): Promise<Set<string>> => {
  const [recipes, meals] = await Promise.all([
    transaction.get(
      kitchenCollection(firestore, uid, 'recipes').select('ingredients'),
    ),
    transaction.get(kitchenCollection(firestore, uid, 'meals').select('items')),
  ]);
  const listed = new Set([
    ...recipes.docs.flatMap((doc) =>
      doc.id === except.recipeId
        ? []
        : ((doc.get('ingredients') ?? []) as { ingredientId?: unknown }[]).map(
            (line) => line.ingredientId,
          ),
    ),
    ...meals.docs.flatMap((doc) =>
      ((doc.get('items') ?? []) as { refId?: unknown }[]).map(
        (item) => item.refId,
      ),
    ),
  ]);
  const used = await Promise.all(
    ids.map(async (id) => {
      if (listed.has(id)) return true;
      const [shopping, packages, products, planned] = await Promise.all([
        transaction.get(
          kitchenCollection(firestore, uid, 'shoppingItems')
            .where('ingredientId', '==', id)
            .limit(2),
        ),
        transaction.get(
          kitchenCollection(firestore, uid, 'packages')
            .where('ingredientId', '==', id)
            .limit(1),
        ),
        transaction.get(
          kitchenCollection(firestore, uid, 'products')
            .where('ingredientId', '==', id)
            .limit(1),
        ),
        transaction.get(
          kitchenCollection(firestore, uid, 'plannedMeals')
            .where('refIds', 'array-contains', id)
            .limit(1),
        ),
      ]);
      return (
        shopping.docs.some((doc) => doc.id !== except.shoppingItemId) ||
        packages.docs.length > 0 ||
        products.docs.length > 0 ||
        planned.docs.length > 0
      );
    }),
  );
  return new Set(ids.filter((_, index) => used[index]));
};

/** Takes an outside change back in one transaction that re-reads what it touched and refuses, with a sentence, once the record has moved on. */
export const undoPinchOutsideChange = async (
  firestore: Firestore,
  uid: string,
  changeId: string,
  from: ChangeUndoFrom,
  now = Date.now(),
): Promise<Undone> => {
  if (changeId === '' || changeId.includes('/')) {
    return {
      ok: false,
      message: 'That change is no longer recorded.',
      isSettled: true,
    };
  }
  const recordRef = ref(firestore, uid, 'outsideChanges', changeId);
  return firestore.runTransaction(async (transaction): Promise<Undone> => {
    const stored = await transaction.get(recordRef);
    if (!stored.exists) {
      return {
        ok: false,
        message: 'That change is no longer recorded.',
        isSettled: true,
      };
    }
    const record = stored.data() as OutsideChange;
    if (record.undoneAt !== null && record.undoneAt !== undefined) {
      return {
        ok: false,
        message: takenBackIn(record.undoneBy),
        isSettled: true,
      };
    }
    const markUndone = () =>
      transaction.update(recordRef, { undoneAt: now, undoneBy: from });
    const alreadyGone = (message: string): Undone => {
      transaction.update(recordRef, { undoneAt: now, undoneBy: from });
      return { ok: false, message, isSettled: true };
    };
    const refuse = (message: string): Undone => ({
      ok: false,
      message,
      isSettled: false,
    });
    const createdIds = Array.isArray(record.createdIngredientIds)
      ? record.createdIngredientIds.filter(
          (id): id is string => typeof id === 'string' && !id.includes('/'),
        )
      : [];
    const inUse =
      createdIds.length === 0
        ? new Set<string>()
        : await readIngredientsInUse(firestore, transaction, uid, createdIds, {
            recipeId: record.recipeId ?? null,
            shoppingItemId: record.createdItem
              ? (record.shoppingItemId ?? null)
              : null,
          });
    const made = await Promise.all(
      createdIds
        .filter((id) => !inUse.has(id))
        .map((id) => transaction.get(ref(firestore, uid, 'ingredients', id))),
    );
    const finish = (): Undone => {
      made.forEach((ingredient) => {
        if (
          ingredient.exists &&
          ingredient.get('isArchived') !== true &&
          ingredient.get('updatedAt') === record.createdAt
        ) {
          transaction.update(ingredient.ref, {
            isArchived: true,
            updatedAt: now,
          });
        }
      });
      markUndone();
      return { ok: true };
    };

    if (record.kind === 'recipeUpdated') {
      const recipeRef = ref(firestore, uid, 'recipes', record.recipeId ?? '_');
      const noteRef = ref(firestore, uid, 'notes', record.noteId ?? '_');
      const [recipe, note] = await Promise.all([
        transaction.get(recipeRef),
        transaction.get(noteRef),
      ]);
      if (!note.exists) return alreadyGone(takenBackIn('pinch'));
      const plan = planTweakUndo(
        recipe.exists ? { updatedAt: Number(recipe.get('updatedAt')) } : null,
        [note.data() as RecipeNote],
      );
      if (plan.kind === 'REFUSE') return refuse(plan.message);
      transaction.update(recipeRef, { ...plan.fields, updatedAt: now });
      transaction.delete(noteRef);
      return finish();
    }
    if (record.kind === 'recipeAdded') {
      const recipeRef = ref(firestore, uid, 'recipes', record.recipeId ?? '_');
      const recipe = await transaction.get(recipeRef);
      if (!recipe.exists) return alreadyGone('That recipe is already gone.');
      if (recipe.get('isArchived') === true) {
        return alreadyGone('That recipe is already archived.');
      }
      if (recipe.get('updatedAt') !== record.createdAt) {
        return refuse(
          'The recipe was edited after it was added, so taking it back would lose that. Archive it in Pinch if you want it gone.',
        );
      }
      transaction.update(recipeRef, { isArchived: true });
      return finish();
    }
    if (record.kind === 'mealPlanned') {
      const mealRef = ref(
        firestore,
        uid,
        'plannedMeals',
        record.plannedMealId ?? '_',
      );
      const meal = await transaction.get(mealRef);
      if (!meal.exists) {
        return alreadyGone('That meal is already off the plan.');
      }
      if (meal.get('updatedAt') !== record.createdAt) {
        return refuse(
          'That meal was changed after it was planned, so it was left as it is.',
        );
      }
      transaction.delete(mealRef);
      return finish();
    }
    if (record.kind === 'ideaSaved') {
      const ideaRef = ref(firestore, uid, 'ideas', record.ideaId ?? '_');
      const idea = await transaction.get(ideaRef);
      if (!idea.exists) return alreadyGone('That idea is already gone.');
      if (readText(idea.get('recipeId')) !== null) {
        return refuse('The idea was made into a recipe.');
      }
      if (idea.get('updatedAt') !== record.createdAt) {
        return refuse('The idea was changed since.');
      }
      transaction.delete(ideaRef);
      return finish();
    }
    if (record.kind === 'nutritionFilled') {
      const filled = Array.isArray(record.filledNutrition)
        ? record.filledNutrition
        : [];
      const snapshots = await Promise.all(
        filled.map((entry) =>
          transaction.get(
            ref(firestore, uid, 'ingredients', entry.ingredientId),
          ),
        ),
      );
      const changedAt = snapshots.findIndex(
        (snapshot) =>
          !snapshot.exists ||
          snapshot.get('nutritionBy') == null ||
          snapshot.get('updatedAt') !== record.createdAt,
      );
      if (changedAt >= 0) {
        const name =
          readText(snapshots[changedAt].get('name')) ??
          CATALOG_NAMES[filled[changedAt].ingredientId] ??
          'An ingredient';
        return refuse(
          `${name} was changed since, so the nutrition was left as it is.`,
        );
      }
      snapshots.forEach((snapshot) =>
        transaction.update(snapshot.ref, {
          nutritionPer100g: null,
          nutritionBy: null,
          updatedAt: now,
        }),
      );
      return finish();
    }
    const itemRef = ref(
      firestore,
      uid,
      'shoppingItems',
      record.shoppingItemId ?? '_',
    );
    const item = await transaction.get(itemRef);
    if (!item.exists) return alreadyGone('That item is already off the list.');
    const current = item.data() as ShoppingItem;
    if (current.isChecked) {
      return refuse('That item was ticked off since, so it was left alone.');
    }
    if (record.createdItem) {
      if (current.updatedAt !== record.createdAt) {
        return refuse('That item was changed since, so it was left alone.');
      }
      transaction.delete(itemRef);
      return finish();
    }
    const added = record.addedAmount ?? 0;
    const previous = record.previousItem;
    if (previous?.isChecked) {
      if (current.amount !== record.addedAmount) {
        return refuse('That item was changed since, so it was left alone.');
      }
      transaction.update(itemRef, {
        amount: previous.amount,
        isChecked: true,
        updatedAt: now,
      });
      return finish();
    }
    if ((current.amount ?? 0) < added) {
      return refuse(
        'That item now holds less than what was added, so it was left alone.',
      );
    }
    const left = roundAmount((current.amount ?? 0) - added);
    transaction.update(itemRef, {
      amount: left > 0 ? left : (previous?.amount ?? null),
      updatedAt: now,
    });
    return finish();
  });
};

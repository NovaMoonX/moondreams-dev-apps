import { randomUUID } from 'node:crypto';

import type {
  DocumentReference,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';
import { z } from 'zod';

import type { AppActionResult } from '../../../connections/registry.js';
import {
  createOptionMatcher,
  toDisplayCase,
} from '../../../vendor/optionMatchUtils.js';
import { dayToUtcMidnight, getLocalMoment } from '../eatSoonDigest.js';
import { CATALOG_NAMES } from './catalogNames.js';
import { cleanGroupName } from './ingredientGroups.js';
import { matchIngredient } from './ingredientMatch.js';
import { planTweakUndo } from './notes.js';
import {
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
  SOFT_MAX_RECIPE_NOTES,
  SOFT_MAX_SHOPPING_ITEMS,
  UNIT_LABELS,
  UNITS,
} from './pinchConstants.js';
import type {
  IngredientRecord,
  MealItem,
  MealType,
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
  'recipeUpdated' | 'recipeAdded' | 'mealPlanned' | 'shoppingAdded';

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
}

/** What a change action hands back as `data`: Helm files one execution from it. */
export interface ChangeData {
  summary: string;
  lines: string[];
  changes: { id: string; title: string; lines: string[] }[];
  /** The recipe a change made or edited, to pass on to the recipe tools. */
  recipeId: string | null;
}

const INGREDIENT_LIMIT = 600;
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
  undoneAt: null,
  undoneBy: null,
  createdAt: ctx.now,
  ...fields,
  lines: capLines(fields.lines),
});

const toData = (summary: string, records: OutsideChange[]): ChangeData => ({
  summary,
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
  /** Every ingredient id the kitchen knows, for naming lines in a change summary. */
  names: Map<string, { name: string }>;
}

const readIngredientBook = async (
  firestore: Firestore,
  uid: string,
): Promise<IngredientBook> => {
  const snapshot = await firestore
    .collection(kitchenPath(uid, 'ingredients'))
    .select('name', 'catalogId', 'isArchived')
    .limit(INGREDIENT_LIMIT)
    .get();
  const records = new Map(snapshot.docs.map((doc) => [doc.id, doc]));
  const catalog = Object.entries(CATALOG_NAMES).map(([id, name]) =>
    toChoice(id, readText(records.get(id)?.get('name')) ?? name, false),
  );
  const custom = snapshot.docs.flatMap((doc) => {
    const name = readText(doc.get('name'));
    return doc.get('catalogId') == null &&
      name !== null &&
      doc.get('isArchived') !== true
      ? [toChoice(doc.id, name, true)]
      : [];
  });
  const choices = [...catalog, ...custom];
  const archived = snapshot.docs.flatMap((doc) => {
    const name = readText(doc.get('name'));
    return doc.get('catalogId') == null && name !== null
      ? [[doc.id, { name }] as const]
      : [];
  });
  return {
    choices,
    names: new Map([
      ...choices.map((choice) => [choice.id, { name: choice.name }] as const),
      ...archived,
    ]),
  };
};

const lineShape = z.object({
  name: z
    .string()
    .min(1)
    .max(MAX_NAME_LENGTH)
    .describe('The ingredient as written, such as "yellow onion".'),
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
    .describe('A short note such as "finely chopped".'),
  group: z
    .string()
    .max(80)
    .nullish()
    .describe('A heading the line sits under, such as "For the sauce".'),
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

/** Lines matched to the person's ingredients and the catalog; a name that matches nothing stays as a kitchen-free line rather than becoming a new ingredient. A line that is the same as one the recipe has keeps its id, so the recorded change names only what really changed. */
const buildLines = (
  input: LineInput[],
  book: IngredientBook,
  existing: RecipeIngredient[],
): Built<RecipeIngredient[]> => {
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
  const lines: RecipeIngredient[] = [];
  for (const entry of input) {
    const unit = readUnit(entry.unit);
    const amount = entry.amount ?? null;
    if (unit === null) {
      return {
        kind: 'refused',
        message: `"${entry.unit}" isn't a unit Pinch uses. ${UNIT_HELP}`,
      };
    }
    if (amount !== null && !isValidAmount(amount)) {
      return {
        kind: 'refused',
        message: `The amount for ${entry.name} is off. Use a number above zero.`,
      };
    }
    const name = entry.name.replace(/\s+/g, ' ').trim();
    const match = matchIngredient(name, book.choices);
    const base = {
      ingredientId: match?.id ?? null,
      freeText: match ? null : name,
      group: cleanGroupName(entry.group),
    };
    const reusable = pool.get(lineKey(base)) ?? [];
    pool.set(lineKey(base), reusable.slice(1));
    lines.push({
      id: reusable[0] ?? randomUUID(),
      ...base,
      amount: amount === null ? null : Math.round(amount * 10_000) / 10_000,
      unit: amount === null ? 'EACH' : unit,
      note: clipText(entry.note ?? '', MAX_NOTE_LENGTH) || null,
      adaptedFrom: null,
    });
  }
  return { kind: 'ok', value: lines };
};

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
      ...(lines?.kind === 'ok' && { ingredients: lines.value }),
      ...(steps?.kind === 'ok' && steps.value),
    };
    const changes = getRecipeChanges(before, after, book.names);
    if (changes.length === 0) {
      return ok({
        summary: `Nothing needed changing: ${found.recipe.title} already reads that way.`,
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
      lines: changes,
      recipeId,
      noteId,
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
    transaction.create(
      ref(firestore, ctx.uid, 'outsideChanges', record.id),
      record,
    );
    return ok(toData(`Changed ${after.title} in Pinch.`, [record]));
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
    ingredients: lines.value,
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
      `${lines.value.length} ingredient${lines.value.length === 1 ? '' : 's'}, ${steps.value.steps.length} step${steps.value.steps.length === 1 ? '' : 's'}`,
    ],
    recipeId: id,
  });
  await firestore.runTransaction(async (transaction) => {
    transaction.create(ref(firestore, ctx.uid, 'recipes', id), recipe);
    transaction.create(
      ref(firestore, ctx.uid, 'outsideChanges', record.id),
      record,
    );
  });
  return ok(toData(`Added ${title} to Pinch's recipes.`, [record]));
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
      `${MEAL_TYPE_LABELS[mealType as MealType]} on ${dayFormatter.format(date)}: ${planned.title}`,
    ],
    plannedMealId: id,
    recipeId: planned.recipeId,
  });
  await firestore.runTransaction(async (transaction) => {
    transaction.create(ref(firestore, ctx.uid, 'plannedMeals', id), meal);
    transaction.create(
      ref(firestore, ctx.uid, 'outsideChanges', record.id),
      record,
    );
  });
  return ok(
    toData(
      `Planned ${planned.title} for ${MEAL_TYPE_LABELS[mealType as MealType].toLowerCase()} on ${dayFormatter.format(date)}.`,
      [record],
    ),
  );
};

type Plate =
  | {
      kind: 'ok';
      title: string;
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
  const [meals, recipes] = await Promise.all([
    firestore
      .collection(kitchenPath(uid, 'meals'))
      .limit(SAVED_MEAL_LIMIT)
      .get(),
    firestore
      .collection(kitchenPath(uid, 'recipes'))
      .select('title', 'isArchived')
      .limit(RECIPE_TITLE_LIMIT)
      .get(),
  ]);
  const wanted = name ?? '';
  const meal = nameMatcher.match(
    wanted,
    meals.docs.flatMap((doc) => {
      const mealName = readText(doc.get('name'));
      return mealName === null ? [] : [{ id: doc.id, name: mealName }];
    }),
  );
  if (meal) {
    const items = (
      (meals.docs.find((doc) => doc.id === meal.id)?.get('items') ??
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
          recipeId: null,
          savedMeal: meal,
          items,
        };
  }
  const recipe = nameMatcher.match(
    wanted,
    recipes.docs.flatMap((doc) => {
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
  const freshIds = new Map<string, string>();
  const wanted = new Map<string, WantedLine>();
  for (const entry of requested) {
    const unit = readUnit(entry.unit);
    const amount = entry.amount ?? null;
    if (unit === null) {
      return refused(`"${entry.unit}" isn't a unit Pinch uses. ${UNIT_HELP}`);
    }
    if (amount !== null && !isValidAmount(roundAmount(amount))) {
      return refused(
        `The amount for ${entry.name} is off. Use a number above zero.`,
      );
    }
    const typed = entry.name.replace(/\s+/g, ' ').trim();
    const match = matchIngredient(typed, book.choices);
    const freshKey = typed.toLowerCase();
    const ingredientId =
      match?.id ??
      freshIds.get(freshKey) ??
      freshIds.set(freshKey, randomUUID()).get(freshKey) ??
      '';
    const name =
      match?.name ??
      toDisplayCase(typed, { style: 'sentence', keepAcronyms: true });
    const lineUnit = amount === null ? 'EACH' : unit;
    const id = `${ingredientId}__${lineUnit}`;
    const known = wanted.get(id);
    wanted.set(id, {
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
    });
  }
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
          `The shopping list is full (${SOFT_MAX_SHOPPING_ITEMS} items). The person can clear what they got in Pinch first.`,
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
          const custom: IngredientRecord = {
            id: line.ingredientId,
            catalogId: null,
            name: line.newName,
            familyId: null,
            iconKey: null,
            nutritionPer100g: null,
            servingAmount: null,
            servingUnit: null,
            gramsPerMl: null,
            gramsEach: null,
            defaultProductId: null,
            isArchived: false,
            createdAt: ctx.now,
            updatedAt: ctx.now,
          };
          transaction.set(
            ref(firestore, ctx.uid, 'ingredients', line.ingredientId),
            custom,
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
  return ok({
    summary:
      made.length === 0
        ? 'Everything was already on the shopping list.'
        : `Added ${made.length} thing${made.length === 1 ? '' : 's'} to the shopping list.`,
    lines: [...made.flatMap((record) => record.lines), ...already],
    changes: made.map(({ id, title, lines: changeLines }) => ({
      id,
      title,
      lines: changeLines,
    })),
    recipeId: null,
  });
};

/** `isSettled`: nothing is left to take back (already taken back, or what it touched is gone), so a caller can stop offering Undo. */
type Undone = { ok: true } | { ok: false; message: string; isSettled: boolean };

const takenBackIn = (by: ChangeUndoFrom | null) =>
  `Already taken back in ${by === 'helm' ? 'Helm' : 'Pinch'}.`;

/** Takes an outside change back in one transaction that re-reads what it touched and refuses, with a sentence, once the record has moved on. Pinch's screens and Helm both call it. */
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
      transaction.update(recordRef, { undoneAt: now, undoneBy: 'pinch' });
      return { ok: false, message, isSettled: true };
    };
    const refuse = (message: string): Undone => ({
      ok: false,
      message,
      isSettled: false,
    });
    const finish = (): Undone => {
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

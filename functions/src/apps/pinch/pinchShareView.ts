import { randomInt } from 'node:crypto';

// A function can't import src/apps/pinch/constants.ts, so its caps and lists are repeated here; scripts/checks/pinchShare.ts fails when they drift.
export const SHARE_LIMITS = {
  MAX_RECIPE_TITLE_LENGTH: 200,
  MAX_RECIPE_DESCRIPTION_LENGTH: 2000,
  MAX_NAME_LENGTH: 120,
  MAX_NOTE_LENGTH: 200,
  MAX_INGREDIENT_GROUP_LENGTH: 40,
  MAX_RECIPE_INGREDIENTS: 60,
  MAX_RECIPE_STEPS: 60,
  MAX_STEP_LENGTH: 2000,
  MAX_MINUTES: 100_000,
  MAX_CARE_DAYS: 365,
  MAX_CARE_REHEAT_LENGTH: 300,
  MAX_CARE_TIP_LENGTH: 300,
  MAX_RECIPE_LINKS: 8,
  MAX_LINK_LABEL_LENGTH: 40,
  MAX_LINK_URL_LENGTH: 2000,
  MAX_SERVING_AMOUNT: 1_000_000,
  MAX_MEAL_ITEMS: 10,
  MAX_SHARED_MEAL_RECIPES: 10,
  MAX_SHARED_MEAL_LINES: 300,
  MAX_SHARED_TIPS: 30,
  MAX_SHARED_TIP_LENGTH: 2000,
  MAX_PINCH_SHARES: 30,
  SHARE_ID_LENGTH: 26,
} as const;

export const SHARE_UNITS = [
  'G',
  'KG',
  'OZ',
  'LB',
  'ML',
  'L',
  'TSP',
  'TBSP',
  'CUP',
  'FL_OZ',
  'PINCH',
  'EACH',
] as const;

export const SHARE_LINK_KINDS = [
  'HOW_TO',
  'ARTICLE',
  'ORIGINAL',
  'TECHNIQUE',
  'OTHER',
] as const;

export type ShareUnit = (typeof SHARE_UNITS)[number];
export type ShareLinkKind = (typeof SHARE_LINK_KINDS)[number];
export type ShareKind = 'RECIPE' | 'MEAL';

export interface SharedIngredient {
  name: string;
  catalogId: string | null;
  amount: number | null;
  unit: ShareUnit;
  note: string | null;
  group: string | null;
}

export interface SharedRecipeLink {
  kind: ShareLinkKind;
  label: string | null;
  url: string;
}

export interface SharedRecipeCare {
  fridgeDays: number | null;
  freezerDays: number | null;
  reheat: string | null;
  tip: string | null;
}

export interface SharedRecipeTip {
  text: string;
  step: number | null;
}

export interface SharedRecipe {
  title: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: SharedIngredient[];
  steps: string[];
  care: SharedRecipeCare | null;
  links: SharedRecipeLink[];
  tips: SharedRecipeTip[];
  hasCover: boolean;
}

export type SharedMealItem =
  | { kind: 'RECIPE'; servings: number; recipeIndex: number }
  | {
      kind: 'INGREDIENT';
      servings: number;
      name: string;
      catalogId: string | null;
    };

export interface SharedMeal {
  name: string;
  recipes: SharedRecipe[];
  items: SharedMealItem[];
}

export interface SharedCopy {
  recipe: SharedRecipe | null;
  meal: SharedMeal | null;
}

export interface ShareCoverRef {
  index: number;
  recipeId: string;
}

export type ShareResult =
  | { status: 'not_found' }
  | {
      status: 'ok';
      kind: ShareKind;
      sharedAt: number;
      isOwner: boolean;
      ownerSourceId: string | null;
      recipe: SharedRecipe | null;
      meal: SharedMeal | null;
    };

const SHARE_ID_ALPHABET = '23456789abcdefghjklmnpqrstuvwxyz';
const SHARE_ID_PATTERN = /^[2-9a-hj-np-z]{26}$/;
const CATALOG_ID_PATTERN = /^cat-[a-z0-9-]{1,80}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const TRAILING_HIGH_SURROGATE = /[\uD800-\uDBFF]$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const isShareId = (value: unknown): value is string =>
  typeof value === 'string' && SHARE_ID_PATTERN.test(value);

export const isRecipeId = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_ID_PATTERN.test(value);

/** Looser than a recipe id because a source id is only a query value and a stored string, never a path. */
export const isSourceId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= 128 &&
  !value.includes('/');

/** Mints a 26-character, 130-bit id from `crypto.randomInt`; `random` is a test seam. */
export function mintShareId(random: (max: number) => number = randomInt) {
  const id = Array.from(
    { length: SHARE_LIMITS.SHARE_ID_LENGTH },
    () => SHARE_ID_ALPHABET[random(SHARE_ID_ALPHABET.length)],
  ).join('');
  return id;
}

export const shareFolder = (shareId: string) => `apps/pinch/shares/${shareId}/`;

export const shareCoverPath = (shareId: string, index: number) =>
  `${shareFolder(shareId)}cover-${index}.webp`;

export const kitchenCoverPath = (uid: string, recipeId: string) =>
  `apps/pinch/kitchens/${uid}/recipes/${recipeId}/cover.webp`;

const isUnit = (value: unknown): value is ShareUnit =>
  SHARE_UNITS.some((unit) => unit === value);

const isLinkKind = (value: unknown): value is ShareLinkKind =>
  SHARE_LINK_KINDS.some((kind) => kind === value);

function toText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return null;
  }

  const text = value
    .trim()
    .slice(0, maxLength)
    .replace(TRAILING_HIGH_SURROGATE, '')
    .trimEnd();
  return text === '' ? null : text;
}

function toInt(value: unknown, min: number, max: number) {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}

function toAmount(value: unknown) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= SHARE_LIMITS.MAX_SERVING_AMOUNT
    ? value
    : null;
}

function toList<T>(
  value: unknown,
  convert: (item: unknown) => T | null,
  max: number,
) {
  const items = Array.isArray(value)
    ? value
        .map(convert)
        .filter((item): item is T => item !== null)
        .slice(0, max)
    : [];
  return items;
}

/** https only, no sign-in in the address, kept whole: a cut-off address is a different address, so a too-long one is dropped. */
function toHttpsUrl(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const text = value.trim();
  if (text === '' || text.length > SHARE_LIMITS.MAX_LINK_URL_LENGTH) {
    return null;
  }

  try {
    const url = new URL(text);
    const isAllowed =
      url.protocol === 'https:' && url.username === '' && url.password === '';
    return isAllowed && url.href.length <= SHARE_LIMITS.MAX_LINK_URL_LENGTH
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function toCatalogId(value: unknown) {
  return typeof value === 'string' && CATALOG_ID_PATTERN.test(value)
    ? value
    : null;
}

function toIngredient(raw: unknown): SharedIngredient | null {
  if (!isRecord(raw)) {
    return null;
  }

  const name = toText(raw.name, SHARE_LIMITS.MAX_NAME_LENGTH);
  if (name === null) {
    return null;
  }

  const unit = isUnit(raw.unit) ? raw.unit : null;
  const result: SharedIngredient = {
    name,
    catalogId: toCatalogId(raw.catalogId),
    amount: unit === null ? null : toAmount(raw.amount),
    unit: unit ?? 'EACH',
    note: toText(raw.note, SHARE_LIMITS.MAX_NOTE_LENGTH),
    group: toText(raw.group, SHARE_LIMITS.MAX_INGREDIENT_GROUP_LENGTH),
  };
  return result;
}

function toLink(raw: unknown): SharedRecipeLink | null {
  if (!isRecord(raw)) {
    return null;
  }

  const url = toHttpsUrl(raw.url);
  if (url === null) {
    return null;
  }

  const result: SharedRecipeLink = {
    kind: isLinkKind(raw.kind) ? raw.kind : 'OTHER',
    label: toText(raw.label, SHARE_LIMITS.MAX_LINK_LABEL_LENGTH),
    url,
  };
  return result;
}

function toTip(raw: unknown, stepCount: number): SharedRecipeTip | null {
  if (!isRecord(raw)) {
    return null;
  }

  const text = toText(raw.text, SHARE_LIMITS.MAX_SHARED_TIP_LENGTH);
  if (text === null) {
    return null;
  }

  const step = toInt(raw.step, 0, stepCount - 1);
  const result: SharedRecipeTip = { text, step };
  return result;
}

function toCare(raw: unknown): SharedRecipeCare | null {
  if (!isRecord(raw)) {
    return null;
  }

  const care: SharedRecipeCare = {
    fridgeDays: toInt(raw.fridgeDays, 1, SHARE_LIMITS.MAX_CARE_DAYS),
    freezerDays: toInt(raw.freezerDays, 1, SHARE_LIMITS.MAX_CARE_DAYS),
    reheat: toText(raw.reheat, SHARE_LIMITS.MAX_CARE_REHEAT_LENGTH),
    tip: toText(raw.tip, SHARE_LIMITS.MAX_CARE_TIP_LENGTH),
  };
  const isEmpty = Object.values(care).every((value) => value === null);
  return isEmpty ? null : care;
}

/** Rebuilds a recipe from untrusted input by copying named fields; `keepCover` trusts a stored `hasCover` (the server wrote it), a client's claim never counts. */
export function toSharedRecipe(
  raw: unknown,
  keepCover = false,
): SharedRecipe | null {
  if (!isRecord(raw)) {
    return null;
  }

  const title = toText(raw.title, SHARE_LIMITS.MAX_RECIPE_TITLE_LENGTH);
  const servings = toAmount(raw.servings);
  const ingredients = toList(
    raw.ingredients,
    toIngredient,
    SHARE_LIMITS.MAX_RECIPE_INGREDIENTS,
  );
  const steps = toList(
    raw.steps,
    (step) => toText(step, SHARE_LIMITS.MAX_STEP_LENGTH),
    SHARE_LIMITS.MAX_RECIPE_STEPS,
  );
  if (
    title === null ||
    servings === null ||
    (ingredients.length === 0 && steps.length === 0)
  ) {
    return null;
  }

  const links = toList(raw.links, toLink, SHARE_LIMITS.MAX_RECIPE_LINKS).map(
    (link, index, all) =>
      link.kind === 'HOW_TO' &&
      all.findIndex((other) => other.kind === 'HOW_TO') !== index
        ? { ...link, kind: 'OTHER' as const }
        : link,
  );
  const result: SharedRecipe = {
    title,
    description: toText(
      raw.description,
      SHARE_LIMITS.MAX_RECIPE_DESCRIPTION_LENGTH,
    ),
    servings,
    prepMinutes: toInt(raw.prepMinutes, 0, SHARE_LIMITS.MAX_MINUTES),
    cookMinutes: toInt(raw.cookMinutes, 0, SHARE_LIMITS.MAX_MINUTES),
    ingredients,
    steps,
    care: toCare(raw.care),
    links,
    tips: toList(
      raw.tips,
      (tip) => toTip(tip, steps.length),
      SHARE_LIMITS.MAX_SHARED_TIPS,
    ),
    hasCover: keepCover && raw.hasCover === true,
  };
  return result;
}

function toMealItem(raw: unknown, recipeCount: number): SharedMealItem | null {
  if (!isRecord(raw)) {
    return null;
  }

  const servings = toAmount(raw.servings);
  if (servings === null) {
    return null;
  }

  if (raw.kind === 'RECIPE') {
    const recipeIndex = toInt(raw.recipeIndex, 0, recipeCount - 1);
    return recipeIndex === null
      ? null
      : { kind: 'RECIPE', servings, recipeIndex };
  }

  const name = toText(raw.name, SHARE_LIMITS.MAX_NAME_LENGTH);
  return raw.kind === 'INGREDIENT' && name !== null
    ? {
        kind: 'INGREDIENT',
        servings,
        name,
        catalogId: toCatalogId(raw.catalogId),
      }
    : null;
}

/**
 * All or nothing: an item that points at a missing recipe, or a meal too big to add in one batch, can't be repaired without changing what it means.
 * Lists past their caps are cut, and the recipes keep their order so a cover's index stays true.
 */
export function toSharedMeal(
  raw: unknown,
  keepCover = false,
): SharedMeal | null {
  if (!isRecord(raw)) {
    return null;
  }

  const name = toText(raw.name, SHARE_LIMITS.MAX_NAME_LENGTH);
  const rawRecipes = Array.isArray(raw.recipes)
    ? raw.recipes.slice(0, SHARE_LIMITS.MAX_SHARED_MEAL_RECIPES)
    : [];
  const recipes = rawRecipes.map((recipe) => toSharedRecipe(recipe, keepCover));
  const rawItems = Array.isArray(raw.items)
    ? raw.items.slice(0, SHARE_LIMITS.MAX_MEAL_ITEMS)
    : [];
  const items = rawItems.map((item) => toMealItem(item, recipes.length));
  if (
    name === null ||
    items.length === 0 ||
    recipes.some((recipe) => recipe === null) ||
    items.some((item) => item === null)
  ) {
    return null;
  }

  const sharedRecipes = recipes.filter(
    (recipe): recipe is SharedRecipe => recipe !== null,
  );
  const lineCount = sharedRecipes.reduce(
    (total, recipe) => total + recipe.ingredients.length,
    0,
  );
  if (lineCount > SHARE_LIMITS.MAX_SHARED_MEAL_LINES) {
    return null;
  }

  const result: SharedMeal = {
    name,
    recipes: sharedRecipes,
    items: items.filter((item): item is SharedMealItem => item !== null),
  };
  return result;
}

/** A stored copy read back through the same allowlist, with its recorded covers kept; null when the side its kind names is unusable. */
export function readStoredCopy(
  kind: unknown,
  snapshot: unknown,
): SharedCopy | null {
  const data = isRecord(snapshot) ? snapshot : {};
  const recipe = kind === 'RECIPE' ? toSharedRecipe(data.recipe, true) : null;
  const meal = kind === 'MEAL' ? toSharedMeal(data.meal, true) : null;
  return recipe === null && meal === null ? null : { recipe, meal };
}

/** The recipes of a copy in the order the covers number them (a recipe share's one recipe is index 0). */
export const getCopyRecipes = (copy: SharedCopy) =>
  copy.recipe ? [copy.recipe] : (copy.meal?.recipes ?? []);

function toCover(entry: unknown, recipeCount: number): ShareCoverRef | null {
  if (!isRecord(entry) || !isRecipeId(entry.recipeId)) {
    return null;
  }

  const index = toInt(entry.index, 0, recipeCount - 1);
  return index === null ? null : { index, recipeId: entry.recipeId };
}

/** The covers a request names, or null when one is out of range, malformed or repeated; at most one per recipe of the copy. */
export function toCoverRefs(
  raw: unknown,
  recipeCount: number,
): ShareCoverRef[] | null {
  if (raw === undefined || raw === null) {
    return [];
  }

  if (
    !Array.isArray(raw) ||
    raw.length > SHARE_LIMITS.MAX_SHARED_MEAL_RECIPES
  ) {
    return null;
  }

  const covers = raw
    .map((entry) => toCover(entry, recipeCount))
    .filter((cover): cover is ShareCoverRef => cover !== null);
  const isValid =
    covers.length === raw.length &&
    new Set(covers.map((cover) => cover.index)).size === covers.length;
  return isValid ? covers : null;
}

/** Marks which recipes the server actually holds a cover for; never taken from the client. */
export function toCoveredCopy(
  copy: SharedCopy,
  covered: ReadonlySet<number>,
): SharedCopy {
  const result: SharedCopy = {
    recipe: copy.recipe && { ...copy.recipe, hasCover: covered.has(0) },
    meal: copy.meal && {
      ...copy.meal,
      recipes: copy.meal.recipes.map((recipe, index) => ({
        ...recipe,
        hasCover: covered.has(index),
      })),
    },
  };
  return result;
}

export function isShareOwner(ownerUid: unknown, callerUid: string | undefined) {
  return (
    typeof callerUid === 'string' &&
    callerUid !== '' &&
    typeof ownerUid === 'string' &&
    ownerUid === callerUid
  );
}

const NOT_FOUND = { status: 'not_found' } as const;

/** Built field by field: the owner's uid is read only to compare with the caller and never copied, and the owner's own source id goes to the owner alone. */
export function toShareResult(
  share: unknown,
  snapshot: unknown,
  callerUid: string | undefined,
): ShareResult {
  if (!isRecord(share) || !isRecord(snapshot)) {
    return { ...NOT_FOUND };
  }

  const kind = share.kind;
  const sharedAt = share.updatedAt;
  if (
    (kind !== 'RECIPE' && kind !== 'MEAL') ||
    snapshot.kind !== kind ||
    typeof sharedAt !== 'number' ||
    !Number.isSafeInteger(sharedAt)
  ) {
    return { ...NOT_FOUND };
  }

  const copy = readStoredCopy(kind, snapshot);
  if (copy === null) {
    return { ...NOT_FOUND };
  }

  const isOwner = isShareOwner(share.ownerUid, callerUid);
  const result: ShareResult = {
    status: 'ok',
    kind,
    sharedAt,
    isOwner,
    ownerSourceId:
      isOwner && isSourceId(share.sourceId) ? share.sourceId : null,
    recipe: copy.recipe,
    meal: copy.meal,
  };
  return result;
}

import {
  COLLECTION_NOUN,
  COLLECTION_NOUN_PLURAL,
  DISH_CATEGORIES,
  MAX_RECIPE_NOTE_LENGTH,
  MAX_TWEAK_CHANGE_LENGTH,
  MAX_TWEAK_CHANGES,
  NUTRITION_CELLS,
  UNIT_LABELS,
} from '@apps/pinch/constants';
import type {
  NutritionValues,
  Recipe,
  RecipeIngredient,
  RecipeLink,
  RecipeSnapshot,
} from '@apps/pinch/types';
import { getCategories } from '@apps/pinch/utils/categories';
import type { CollectionChange } from '@apps/pinch/utils/collections';
import {
  getGroupKey,
  getRepeatedLineGroups,
} from '@apps/pinch/utils/ingredientGroups';
import { formatCareDays, getRecipeCare } from '@apps/pinch/utils/recipeCare';
import { formatMinutes } from '@apps/pinch/utils/recipeFormat';
import { getRecipeLinks } from '@apps/pinch/utils/recipeLinks';

/** What a tweak looks at: everything a recipe's form edits except the cover picture and the collections, which `ChangeExtras` carries. */
export type RecipeContent = RecipeSnapshot;

/** The recipe as a tweak keeps it, every key present so it can be written to Firestore. */
export const getRecipeSnapshot = (recipe: RecipeContent): RecipeSnapshot => ({
  title: recipe.title,
  description: recipe.description ?? null,
  servings: recipe.servings,
  prepMinutes: recipe.prepMinutes ?? null,
  cookMinutes: recipe.cookMinutes ?? null,
  ingredients: recipe.ingredients,
  steps: recipe.steps,
  nutritionOverride: recipe.nutritionOverride ?? null,
  sourceId: recipe.sourceId ?? null,
  categories: getCategories(recipe),
  care: getRecipeCare(recipe),
  links: getRecipeLinks(recipe),
});

const INGREDIENTS_REORDERED = 'Ingredients reordered';
const STEPS_REORDERED = 'Steps reordered';
const STEP_QUOTE_LENGTH = 80;
const TITLE_QUOTE_LENGTH = 80;
const METRIC_KEYS = NUTRITION_CELLS.map((cell) => cell.key);

const truncate = (text: string, max: number) => {
  if (text.length <= max) return text;
  const end = /[\uDC00-\uDFFF]/.test(text.charAt(max - 1)) ? max - 2 : max - 1;
  return `${text.slice(0, end).trimEnd()}…`;
};

const clip = (text: string, max: number) =>
  truncate(text.replace(/\s+/g, ' ').trim(), max);

const formatAmount = (amount: number) => String(Math.round(amount * 100) / 100);

const formatQuantity = ({
  amount,
  unit,
}: Pick<RecipeIngredient, 'amount' | 'unit'>) =>
  amount === null
    ? 'no amount'
    : `${formatAmount(amount)} ${UNIT_LABELS[unit]}`;

type ComparedLine = Omit<RecipeIngredient, 'group'>;

const normalizeLine = (line: RecipeIngredient): ComparedLine => ({
  id: line.id,
  ingredientId: line.ingredientId,
  amount: line.amount,
  unit: line.amount === null ? 'EACH' : line.unit,
  note: (line.note ?? '').trim() || null,
});

const normalize = (content: RecipeContent) => ({
  title: content.title.trim(),
  description: (content.description ?? '').trim() || null,
  servings: content.servings,
  prepMinutes: content.prepMinutes ?? null,
  cookMinutes: content.cookMinutes ?? null,
  // Order has its own check, group by group, so a line moved to another group is no change here.
  ingredients: content.ingredients
    .map(normalizeLine)
    .sort((a, b) => a.id.localeCompare(b.id)),
  steps: content.steps.map((step) => step.trim()).filter(Boolean),
  nutrition: Object.fromEntries(
    METRIC_KEYS.map((key) => [key, content.nutritionOverride?.[key] ?? null]),
  ) as unknown as NutritionValues,
  sourceId: content.sourceId ?? null,
  categories: getCategories(content),
  care: getRecipeCare(content),
  links: getRecipeLinks(content).map((link) => ({
    ...link,
    label: link.label?.trim() || null,
  })),
  groups: Object.fromEntries(
    content.ingredients
      .map((line) => [line.id, getGroupKey(line.group)] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  ),
  groupOrder: [
    ...new Set(content.ingredients.map((line) => getGroupKey(line.group))),
  ],
});

type Normalized = ReturnType<typeof normalize>;

const getMinutesLine = (
  label: string,
  before: number | null,
  after: number | null,
) => {
  if (before === after) return [];
  if (after === null) return [`${label} removed`];
  if (before === null) return [`${label} set to ${formatMinutes(after)}`];
  return [
    before < 60 && after < 60
      ? `${label} ${before} → ${after} min`
      : `${label} ${formatMinutes(before)} → ${formatMinutes(after)}`,
  ];
};

const getLineChanges = (
  before: ComparedLine,
  after: ComparedLine,
  beforeName: string,
  name: string,
) => {
  const isAmountChanged = formatQuantity(before) !== formatQuantity(after);
  const amountLine =
    before.unit === after.unit &&
    before.amount !== null &&
    after.amount !== null
      ? `${name} ${formatAmount(before.amount)} → ${formatAmount(after.amount)} ${UNIT_LABELS[after.unit]}`
      : `${name} ${formatQuantity(before)} → ${formatQuantity(after)}`;
  const swapLine = `Swapped ${beforeName} for ${name}${isAmountChanged ? `, ${formatQuantity(after)}` : ''}`;
  const noteLine = () => {
    if (before.note === after.note) return [];
    if (before.note === null) return [`Added a note to ${name}`];
    if (after.note === null) return [`Removed the note from ${name}`];
    return [`Note on ${name} changed`];
  };

  if (before.ingredientId !== after.ingredientId) {
    return [swapLine, ...noteLine()];
  }
  return [...(isAmountChanged ? [amountLine] : []), ...noteLine()];
};

/** Lines are compared without their group; moving a line to another heading, and renaming, removing or reordering a heading, have their own lines, and order is compared only among lines that stayed in their group. A line whose ingredient sits in several groups is named with its group. */
const getIngredientChanges = (
  beforeLines: RecipeIngredient[],
  afterLines: RecipeIngredient[],
  getName: (ingredientId: string) => string,
) => {
  const labelWith = (labels: Map<string, string>) => (line: ComparedLine) => {
    const group = labels.get(line.id);
    return group
      ? `${getName(line.ingredientId)} (${group})`
      : getName(line.ingredientId);
  };
  const beforeLabel = labelWith(getRepeatedLineGroups(beforeLines));
  const afterLabel = labelWith(getRepeatedLineGroups(afterLines));
  const before = beforeLines.map(normalizeLine);
  const after = afterLines.map(normalizeLine);
  const beforeById = new Map(before.map((line) => [line.id, line]));
  const afterById = new Map(after.map((line) => [line.id, line]));
  const changed = after.flatMap((line) => {
    const was = beforeById.get(line.id);
    return was
      ? getLineChanges(was, line, beforeLabel(was), afterLabel(line))
      : [];
  });
  const added = after
    .filter((line) => !beforeById.has(line.id))
    .map((line) =>
      line.amount === null
        ? `Added ${afterLabel(line)}`
        : `Added ${afterLabel(line)}, ${formatQuantity(line)}`,
    );
  const removed = before
    .filter((line) => !afterById.has(line.id))
    .map((line) => `Removed ${beforeLabel(line)}`);
  const beforeKeys = new Map(
    beforeLines.map((line) => [line.id, getGroupKey(line.group)]),
  );
  const afterKeys = new Map(
    afterLines.map((line) => [line.id, getGroupKey(line.group)]),
  );
  const groupKeys = [...new Set(afterKeys.values())];
  const inGroups = (ids: string[]) =>
    groupKeys
      .flatMap((key) => ids.filter((id) => afterKeys.get(id) === key))
      .join('\u0000');
  const isStill = (id: string) =>
    beforeKeys.has(id) && beforeKeys.get(id) === afterKeys.get(id);
  const keptBefore = before
    .filter((line) => isStill(line.id))
    .map((line) => line.id);
  const keptAfter = after
    .filter((line) => isStill(line.id))
    .map((line) => line.id);
  const keptGroupKeys = (keys: Map<string, string>) =>
    [...new Set(keys.values())].filter(
      (key) =>
        key !== '' && beforeGroupKeys.has(key) && afterGroupKeys.has(key),
    );
  const beforeGroupKeys = new Set(beforeKeys.values());
  const afterGroupKeys = new Set(afterKeys.values());
  const isGroupsReordered =
    keptGroupKeys(beforeKeys).join('\u0000') !==
    keptGroupKeys(afterKeys).join('\u0000');
  const reordered =
    inGroups(keptBefore) === inGroups(keptAfter) && !isGroupsReordered
      ? []
      : [INGREDIENTS_REORDERED];

  return [...changed, ...added, ...removed, ...reordered];
};

const GROUP_QUOTE_LENGTH = 40;

const quoteGroup = (name: string) => `“${clip(name, GROUP_QUOTE_LENGTH)}”`;

/** The headings an edit renamed, removed or moved lines between: a heading whose every line went to one new heading is a rename, one whose lines all lost their heading is a removal, and the rest are lines moved (several to one heading read as one line). */
const getGroupChanges = (
  beforeLines: RecipeIngredient[],
  afterLines: RecipeIngredient[],
  getName: (ingredientId: string) => string,
) => {
  const beforeById = new Map(beforeLines.map((line) => [line.id, line]));
  const kept = afterLines.filter((line) => beforeById.has(line.id));
  const moved = kept.filter(
    (line) =>
      getGroupKey(beforeById.get(line.id)?.group) !== getGroupKey(line.group),
  );
  const keyOf = (line: RecipeIngredient) => getGroupKey(line.group);
  const beforeKeys = new Set(beforeLines.map(keyOf));
  const afterKeys = new Set(afterLines.map(keyOf));
  const buckets = moved.reduce((acc, line) => {
    const from = getGroupKey(beforeById.get(line.id)?.group);
    const key = `${from}\u0000${keyOf(line)}`;
    return acc.set(key, [...(acc.get(key) ?? []), line]);
  }, new Map<string, RecipeIngredient[]>());

  return [...buckets.entries()].flatMap(([key, lines]) => {
    const [from, to] = key.split('\u0000');
    const fromName = beforeLines.find((line) => keyOf(line) === from)?.group;
    const toName = lines[0].group;
    const isWholeHeading =
      from !== '' &&
      kept.filter(
        (line) => getGroupKey(beforeById.get(line.id)?.group) === from,
      ).length === lines.length &&
      beforeLines.filter((line) => keyOf(line) === from).length ===
        lines.length;
    if (isWholeHeading && to === '' && !afterKeys.has(from)) {
      return [`Removed the group ${quoteGroup(fromName ?? '')}`];
    }
    if (
      isWholeHeading &&
      to !== '' &&
      !afterKeys.has(from) &&
      !beforeKeys.has(to)
    ) {
      return [
        `Renamed the group ${quoteGroup(fromName ?? '')} to ${quoteGroup(toName ?? '')}`,
      ];
    }
    if (to === '') {
      return lines.length === 1
        ? [
            `Took ${getName(lines[0].ingredientId)} out of ${quoteGroup(fromName ?? '')}`,
          ]
        : [
            `Took ${lines.length} ingredients out of ${quoteGroup(fromName ?? '')}`,
          ];
    }
    return lines.length === 1
      ? [
          `Moved ${getName(lines[0].ingredientId)} to ${quoteGroup(toName ?? '')}`,
        ]
      : [`Moved ${lines.length} ingredients to ${quoteGroup(toName ?? '')}`];
  });
};

const getStepChanges = (before: string[], after: string[]) => {
  if (before.join('\u0000') === after.join('\u0000')) return [];

  const isSameSet =
    before.length === after.length &&
    [...before].sort().join('\u0000') === [...after].sort().join('\u0000');
  if (isSameSet) return [STEPS_REORDERED];

  const shared = Math.min(before.length, after.length);
  const prefix = Array.from({ length: shared }, (_, index) => index).findIndex(
    (index) => before[index] !== after[index],
  );
  const start = prefix === -1 ? shared : prefix;
  const suffix = Array.from(
    { length: shared - start },
    (_, index) => index,
  ).findIndex(
    (index) =>
      before[before.length - 1 - index] !== after[after.length - 1 - index],
  );
  const end = suffix === -1 ? shared - start : suffix;
  const middleBefore = before.slice(start, before.length - end);
  const middleAfter = after.slice(start, after.length - end);
  const paired = Math.min(middleBefore.length, middleAfter.length);

  const changed = middleAfter
    .slice(0, paired)
    .flatMap((step, index) =>
      step === middleBefore[index]
        ? []
        : [
            `Step ${start + index + 1} now reads: “${clip(step, STEP_QUOTE_LENGTH)}”`,
          ],
    );
  const added = middleAfter
    .slice(paired)
    .map(
      (step, index) =>
        `Added step ${start + paired + index + 1}: “${clip(step, STEP_QUOTE_LENGTH)}”`,
    );
  const removed = middleBefore
    .slice(paired)
    .map(
      (step, index) =>
        `Removed step ${start + paired + index + 1}: “${clip(step, STEP_QUOTE_LENGTH)}”`,
    );

  return [...changed, ...added, ...removed];
};

const getNutritionChanges = (before: NutritionValues, after: NutritionValues) =>
  NUTRITION_CELLS.flatMap(({ key, label, unit }) => {
    const was = before[key];
    const now = after[key];
    if (was === now) return [];
    if (was === null) return [`${label} set to ${now}${unit}`];
    if (now === null) return [`${label} back to the calculated number`];
    return [`${label} ${was} → ${now}${unit}`];
  });

const getTextChanges = (before: Normalized, after: Normalized) => {
  const titleChange =
    before.title === after.title
      ? []
      : [`Renamed to “${clip(after.title, TITLE_QUOTE_LENGTH)}”`];
  const servingsChange =
    formatAmount(before.servings) === formatAmount(after.servings)
      ? []
      : [
          `Serves ${formatAmount(before.servings)} → ${formatAmount(after.servings)}`,
        ];
  const getDescriptionChange = () => {
    if (before.description === after.description) return [];
    if (before.description === null) return ['Added a description'];
    if (after.description === null) return ['Removed the description'];
    return ['Description changed'];
  };

  return [...titleChange, ...servingsChange, ...getDescriptionChange()];
};

const formatCategories = (categories: Recipe['categories']) => {
  const labels = DISH_CATEGORIES.filter((category) =>
    categories.includes(category.value),
  ).map((category) => category.label);
  return labels.length === 0 ? 'none' : labels.join(', ');
};

const getCategoryChanges = (before: Normalized, after: Normalized) =>
  before.categories.join() === after.categories.join()
    ? []
    : [
        `Categories: ${formatCategories(before.categories)} → ${formatCategories(after.categories)}`,
      ];

const getTextPartLine = (
  label: string,
  before: string | null | undefined,
  after: string | null | undefined,
) => {
  if ((before ?? null) === (after ?? null)) return [];
  if (!before) return [`${label} added`];
  if (!after) return [`${label} removed`];
  return [`${label} changed`];
};

const getDaysLine = (
  label: string,
  before: number | null | undefined,
  after: number | null | undefined,
) => {
  if ((before ?? null) === (after ?? null)) return [];
  if (before == null) return [`${label} set to ${formatCareDays(after ?? 0)}`];
  if (after == null) return [`${label} removed`];
  return [`${label} ${formatCareDays(before)} → ${formatCareDays(after)}`];
};

const getCareChanges = (before: Normalized, after: Normalized) => {
  const lines = [
    ...getDaysLine(
      'fridge time',
      before.care?.fridgeDays,
      after.care?.fridgeDays,
    ),
    ...getDaysLine(
      'freezer time',
      before.care?.freezerDays,
      after.care?.freezerDays,
    ),
    ...getTextPartLine('reheating', before.care?.reheat, after.care?.reheat),
    ...getTextPartLine('tip', before.care?.tip, after.care?.tip),
  ];
  return lines.map((line) => `Keeping it: ${line}`);
};

const getLinkName = (link: RecipeLink) =>
  link.kind === 'HOW_TO' ? 'the how-to link' : 'a link';

const getLinkChanges = (before: Normalized, after: Normalized) => {
  const beforeById = new Map(before.links.map((link) => [link.id, link]));
  const afterById = new Map(after.links.map((link) => [link.id, link]));
  const added = after.links
    .filter((link) => !beforeById.has(link.id))
    .map((link) => `Added ${getLinkName(link)}`);
  const removed = before.links
    .filter((link) => !afterById.has(link.id))
    .map((link) => `Removed ${getLinkName(link)}`);
  const changed = after.links.flatMap((link) => {
    const was = beforeById.get(link.id);
    return was && JSON.stringify(was) !== JSON.stringify(link)
      ? [`Changed ${getLinkName(link)}`]
      : [];
  });
  const kept = (links: Normalized['links'], other: Map<string, unknown>) =>
    links.filter((link) => other.has(link.id)).map((link) => link.id);
  const isReordered =
    kept(before.links, afterById).join() !==
    kept(after.links, beforeById).join();

  return [
    ...added,
    ...removed,
    ...changed,
    ...(isReordered ? ['Links reordered'] : []),
  ];
};

/** What the form changes that is not part of a recipe's content: the cover picture and the collections it is in. */
export interface ChangeExtras {
  photo: 'ADDED' | 'CHANGED' | 'REMOVED' | null;
  addedCollections: (string | null)[];
  removedCollections: (string | null)[];
}

export const NO_EXTRAS: ChangeExtras = {
  photo: null,
  addedCollections: [],
  removedCollections: [],
};

const getPhotoChanges = (photo: ChangeExtras['photo']) => {
  if (photo === 'ADDED') return ['Photo added'];
  if (photo === 'CHANGED') return ['Photo changed'];
  if (photo === 'REMOVED') return ['Photo removed'];
  return [];
};

const MANY_COLLECTIONS = 3;

type CollectionLineKind = 'ADDED' | 'REMOVED' | 'DELETED';

/** One collection's line in the history; a missing name reads "a collection", never a blank in a sentence. */
export const getCollectionLine = (
  kind: CollectionLineKind,
  label: string | null,
) => {
  const named =
    label === null
      ? 'a collection'
      : `the “${clip(label, GROUP_QUOTE_LENGTH)}” ${COLLECTION_NOUN}`;
  if (kind === 'ADDED') return `Added to ${named}`;
  return `Taken out of ${named}${kind === 'DELETED' ? ', which was deleted' : ''}`;
};

/** The lines for several collections at once: named one by one up to three, counted past that. */
export const getCollectionLines = (
  kind: Exclude<CollectionLineKind, 'DELETED'>,
  labels: (string | null)[],
) => {
  if (labels.length <= MANY_COLLECTIONS) {
    return labels.map((label) => getCollectionLine(kind, label));
  }
  return [
    `${kind === 'ADDED' ? 'Added to' : 'Taken out of'} ${labels.length} ${COLLECTION_NOUN_PLURAL}`,
  ];
};

/** A source taken off a recipe, named when the name is known. */
export const getSourceRemovedLine = (label: string | null) =>
  label === null
    ? 'Source removed'
    : `Source “${clip(label, GROUP_QUOTE_LENGTH)}” removed`;

const getCollectionChanges = (extras: ChangeExtras) => [
  ...getCollectionLines('ADDED', extras.addedCollections),
  ...getCollectionLines('REMOVED', extras.removedCollections),
];

const PHOTO_LINE = /^Photo (added|changed|removed)$/;
const COLLECTION_LINE =
  /^(Added to|Taken out of) (the “.*” collection|a collection|\d+ collections)(, which was deleted)?$/;
const SOURCE_REMOVED_LINE = /^Source “.*” removed$/;

/** The lines Put the recipe back doesn't put back, because the photo and the collections aren't in a snapshot. */
export const isUnrestoredLine = (line: string) =>
  PHOTO_LINE.test(line) || COLLECTION_LINE.test(line);

/** A recorded change that says something about the recipe itself, as opposed to one that only moved its photo or collections, or took a deleted source off it (written with no snapshot). Only these date "the recipe changed", relabel older notes and take Put the recipe back. */
export const isContentTweak = (note: {
  kind: string;
  changes?: string[] | null;
  previous?: unknown;
}) =>
  note.kind === 'TWEAK' &&
  (note.changes ?? []).some(
    (line) =>
      !isUnrestoredLine(line) &&
      !(note.previous == null && SOURCE_REMOVED_LINE.test(line)),
  );

export const capLines = (lines: string[]) => {
  const fitted =
    lines.length <= MAX_TWEAK_CHANGES
      ? lines
      : [
          ...lines.slice(0, MAX_TWEAK_CHANGES - 1),
          `and ${lines.length - (MAX_TWEAK_CHANGES - 1)} more`,
        ];

  return fitted.map((line) => truncate(line, MAX_TWEAK_CHANGE_LENGTH));
};

/**
 * Plain-word lines saying what an edit changed, in the order the recipe form shows things; empty when nothing a person could see changed.
 * At most `MAX_TWEAK_CHANGES` lines: past that the last one says how many more there were.
 */
export const getRecipeChanges = (
  before: RecipeContent,
  after: RecipeContent,
  ingredientsById: Map<string, { name: string }>,
  sourcesById: Map<string, { label: string }> = new Map(),
  extras: ChangeExtras = NO_EXTRAS,
) => {
  const was = normalize(before);
  const now = normalize(after);
  const getName = (ingredientId: string) =>
    ingredientsById.get(ingredientId)?.name ?? 'Removed ingredient';
  const getSourceLine = () => {
    if (was.sourceId === now.sourceId) return [];
    if (now.sourceId === null) {
      return [
        getSourceRemovedLine(
          was.sourceId === null
            ? null
            : (sourcesById.get(was.sourceId)?.label ?? null),
        ),
      ];
    }
    const label = sourcesById.get(now.sourceId)?.label;
    return [
      `Source ${was.sourceId === null ? 'set' : 'changed'} to ${label === undefined ? 'another source' : `“${clip(label, GROUP_QUOTE_LENGTH)}”`}`,
    ];
  };

  const lines = [
    ...getTextChanges(was, now),
    ...getCategoryChanges(was, now),
    ...getMinutesLine('Prep time', was.prepMinutes, now.prepMinutes),
    ...getMinutesLine('Cook time', was.cookMinutes, now.cookMinutes),
    ...getPhotoChanges(extras.photo),
    ...getSourceLine(),
    ...getIngredientChanges(before.ingredients, after.ingredients, getName),
    ...getGroupChanges(before.ingredients, after.ingredients, getName),
    ...getStepChanges(was.steps, now.steps),
    ...getCareChanges(was, now),
    ...getNutritionChanges(was.nutrition, now.nutrition),
    ...getCollectionChanges(extras),
    ...getLinkChanges(was, now),
  ];
  const hasMissedChange =
    lines.length === 0 && JSON.stringify(was) !== JSON.stringify(now);
  const result = capLines(hasMissedChange ? ['The recipe changed'] : lines);

  return result;
};

/** What an edit touched that is worth asking the person about: the ingredients (an amount, a swap, a line added or taken out) or the steps. Moving lines or steps around is not asked about. */
export interface ChangeTopics {
  hasIngredients: boolean;
  hasSteps: boolean;
}

export const getChangeTopics = (
  before: RecipeContent,
  after: RecipeContent,
): ChangeTopics => {
  const ingredientLines = getIngredientChanges(
    before.ingredients,
    after.ingredients,
    () => '',
  );
  const stepLines = getStepChanges(
    normalize(before).steps,
    normalize(after).steps,
  );
  const result = {
    hasIngredients: ingredientLines.some(
      (line) => line !== INGREDIENTS_REORDERED,
    ),
    hasSteps: stepLines.some((line) => line !== STEPS_REORDERED),
  };

  return result;
};

type DraftContent = RecipeContent & {
  newIngredients: { id: string; name: string }[];
  newSource: { id: string; label: string } | null;
  coverFile?: File | null;
  coverUrl?: string | null;
  removeCover?: boolean;
  collectionChange?: CollectionChange | null;
  newCollections?: { id: string; label: string }[];
};

const getPhotoExtra = (
  existing: Partial<Pick<Recipe, 'coverPath' | 'coverUrl'>>,
  draft: DraftContent,
): ChangeExtras['photo'] => {
  const hadCover = Boolean(existing.coverPath || existing.coverUrl);
  const isNewPhoto =
    draft.coverFile != null ||
    (draft.coverUrl != null && draft.coverUrl !== existing.coverUrl);
  if (isNewPhoto) return hadCover ? 'CHANGED' : 'ADDED';
  return draft.removeCover === true && hadCover ? 'REMOVED' : null;
};

/** The lines and topics of a form's draft against the recipe it edits, naming an ingredient, a source and a collection the draft is about to create. */
export const getDraftChanges = (
  existing: RecipeContent & Partial<Pick<Recipe, 'coverPath' | 'coverUrl'>>,
  draft: DraftContent,
  ingredientsById: ReadonlyMap<string, { name: string }>,
  sourcesById: ReadonlyMap<string, { label: string }>,
  collectionsById: ReadonlyMap<string, { label: string }> = new Map(),
) => {
  const ingredientNames = new Map([
    ...ingredientsById,
    ...draft.newIngredients.map(
      (ingredient) =>
        [ingredient.id, { name: ingredient.name.trim() }] as const,
    ),
  ]);
  const sourceLabels = new Map([
    ...sourcesById,
    ...(draft.newSource
      ? [[draft.newSource.id, draft.newSource] as const]
      : []),
  ]);
  const collectionLabels = new Map([
    ...collectionsById,
    ...(draft.newCollections ?? []).map(
      (collection) => [collection.id, collection] as const,
    ),
  ]);
  const labelsOf = (ids: string[] | undefined) =>
    (ids ?? []).map((id) => collectionLabels.get(id)?.label ?? null);
  const extras: ChangeExtras = {
    photo: getPhotoExtra(existing, draft),
    addedCollections: labelsOf(draft.collectionChange?.add),
    removedCollections: labelsOf(draft.collectionChange?.remove),
  };
  const result = {
    changes: getRecipeChanges(
      existing,
      draft,
      ingredientNames,
      sourceLabels,
      extras,
    ),
    topics: getChangeTopics(existing, draft),
  };

  return result;
};

/** Whether saving this edit stops to ask why: only when an ingredient or a step changed. */
export const isWhyAsked = (topics: ChangeTopics) =>
  topics.hasIngredients || topics.hasSteps;

/** Four quick reasons that fit what changed, to start the sentence the person finishes or leaves as it is. */
export const getWhyChoices = (topics: ChangeTopics) => {
  if (topics.hasIngredients && topics.hasSteps) {
    return [
      'Tasted better',
      'Easier this way',
      'Ran out of something',
      'Fixing a mistake',
    ];
  }
  if (topics.hasSteps) {
    return ['Easier this way', 'Faster', 'Tasted better', 'Fixing a mistake'];
  }
  return ['Tasted better', 'Ran out of it', 'Too much', 'Not enough'];
};

/** What the reason box reads after a chip is tapped: the chip's words when the box is empty or holds only another chip, otherwise added after what was typed, and never past the note's length or twice. */
export const applyWhyChoice = (
  current: string,
  choice: string,
  choices: readonly string[],
) => {
  const typed = current.trim();
  if (typed === '' || choices.includes(typed)) return choice;
  if (typed.toLowerCase().includes(choice.toLowerCase())) return current;
  const joined = `${typed.replace(/[.!?]+$/, '')}. ${choice}`;
  return joined.length > MAX_RECIPE_NOTE_LENGTH ? current : joined;
};

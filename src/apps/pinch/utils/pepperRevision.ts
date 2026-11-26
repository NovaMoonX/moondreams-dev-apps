import { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import { generateUuid } from '@/utils';
import { formatList } from '@/utils/formatUtils';
import { formatAmountText, parseAmountText } from '@/utils/measureUtils';
import {
  getRowFromRead,
  type IngredientRow,
  type RecipeFormData,
} from '@apps/pinch/components/recipes/recipeFormModel';
import { MAX_RECIPE_INGREDIENTS } from '@apps/pinch/constants';
import type {
  RecipeRevision,
  RevisedLine,
  RevisionInput,
} from '@apps/pinch/lib/reviseRecipe';
import type { Collection, ResolvedIngredient, Source } from '@apps/pinch/types';
import {
  addCollectionByLabel,
  getChoiceLabels,
  getCollectionKey,
} from '@apps/pinch/utils/collections';
import {
  getGroupKey,
  orderIngredientLines,
} from '@apps/pinch/utils/ingredientGroups';
import { normalizeName } from '@apps/pinch/utils/ingredientMatch';
import { getCareText, parseCareText } from '@apps/pinch/utils/recipeCare';
import { cleanStepSection } from '@apps/pinch/utils/stepSections';

/** What the form's pickers choose among, for the parts of a recipe that name another record. */
export interface RevisionContext {
  sources: readonly Source[];
  collections: readonly Collection[];
}

export interface RevisionMarks {
  title: boolean;
  description: boolean;
  servings: boolean;
  times: boolean;
  categories: boolean;
  care: boolean;
  source: boolean;
  collections: boolean;
  addedIngredientIds: string[];
  changedIngredientIds: string[];
  removedIngredientNames: string[];
  /** Steps in the revised list that are new or read differently, by index. */
  changedStepIndices: number[];
  isEmpty: boolean;
}

const getRowName = (
  row: IngredientRow,
  byId: ReadonlyMap<string, { name: string }>,
) =>
  row.freeText ??
  row.newName ??
  row.proposedName ??
  byId.get(row.ingredientId)?.name ??
  '';

const getSourceLabel = (
  formData: RecipeFormData,
  sources: readonly Source[],
) =>
  formData.sourceChoice.choice === NEW_CHOICE
    ? formData.sourceChoice.newText.trim() || null
    : (sources.find((source) => source.id === formData.sourceChoice.choice)
        ?.label ?? null);

const getLabelKey = (label: string | null) => label?.trim().toLowerCase() ?? '';

/** The recipe as plain data for the AI, with a short ref per ingredient line and the map from each ref back to its row. */
export function toRevisionInput(
  formData: RecipeFormData,
  ingredientsById: ReadonlyMap<string, { name: string }>,
  context: RevisionContext,
  asks: { ask: string; earlierAsks: string[] },
): { input: RevisionInput; refMap: Map<string, string> } {
  const refMap = new Map(
    formData.ingredients.map((row, index) => [`i${index + 1}`, row.id]),
  );
  const own = getChoiceLabels(formData.collections, context.collections);
  const ownKeys = new Set(own.map(getCollectionKey));
  const parseMinutes = (text: string) =>
    text.trim() === '' ? null : Number(text);

  return {
    refMap,
    input: {
      title: formData.title,
      description: formData.description,
      servings: formData.basics.servings,
      prepMinutes: parseMinutes(formData.basics.prep),
      cookMinutes: parseMinutes(formData.basics.cook),
      ingredients: formData.ingredients.map((row, index) => ({
        ref: `i${index + 1}`,
        name: getRowName(row, ingredientsById),
        isFree: row.freeText !== null,
        amount: row.isAmountless ? null : parseAmountText(row.amount),
        unit: row.isAmountless ? null : row.unit,
        amountText: row.isAmountless ? row.amountText : null,
        note: row.note,
        group: row.group,
      })),
      steps: formData.steps.map((text, index) => ({
        text,
        section: formData.stepSections[index] ?? null,
      })),
      categories: formData.categories,
      care: parseCareText(formData.care),
      source: getSourceLabel(formData, context.sources),
      collections: own,
      otherCollections: [...context.collections, ...formData.collections.added]
        .filter((entry) => !ownKeys.has(getCollectionKey(entry.label)))
        .map((entry) => entry.label),
      ask: asks.ask,
      earlierAsks: asks.earlierAsks,
    },
  };
}

/* A model repeats ⅓ as 0.33, so an unchanged amount is matched within 2%. */
const sameAmount = (row: IngredientRow, amount: number | null) => {
  const current = row.isAmountless ? null : parseAmountText(row.amount);
  return (
    current !== null &&
    amount !== null &&
    Math.abs(current - amount) <= Math.max(0.02 * current, 0.001)
  );
};

const hasUnreadAmount = (row: IngredientRow) =>
  !row.isAmountless &&
  row.amount.trim() !== '' &&
  parseAmountText(row.amount) === null;

const toRead = (line: RevisedLine) => ({
  name: line.name,
  amount: line.amount,
  unit: line.unit,
  amountText: line.amountText,
  note: line.note,
  alsoCalled: null,
  group: line.group,
});

const getFingerprint = (row: IngredientRow, name: string) =>
  JSON.stringify([
    normalizeName(name),
    row.isAmountless ? null : parseAmountText(row.amount),
    row.isAmountless ? null : row.unit,
    row.isAmountless ? (row.amountText?.trim() ?? null) : null,
    row.note?.trim() ?? null,
    getGroupKey(row.group),
  ]);

/** Which steps of `next` are not an unchanged step of `previous`, aligned by the longest run of steps that read the same, so one inserted step marks only itself. */
const getChangedSteps = (
  previous: { text: string; section: string | null }[],
  next: { text: string; section: string | null }[],
) => {
  const same = (a: { text: string }, b: { text: string }) =>
    a.text.trim() === b.text.trim();
  const table = previous.reduceRight<number[][]>(
    (rows, previousStep) => {
      const below = rows[0];
      const row = next.reduceRight<number[]>(
        (right, nextStep, j) => [
          same(previousStep, nextStep)
            ? below[j + 1] + 1
            : Math.max(below[j], right[0]),
          ...right,
        ],
        [0],
      );
      return [row, ...rows];
    },
    [Array<number>(next.length + 1).fill(0)],
  );
  const walk = (i: number, j: number): [number, number][] => {
    if (i >= previous.length || j >= next.length) return [];
    if (same(previous[i], next[j])) return [[j, i], ...walk(i + 1, j + 1)];
    return table[i + 1][j] >= table[i][j + 1] ? walk(i + 1, j) : walk(i, j + 1);
  };
  const pairs = new Map(walk(0, 0));

  return next.flatMap((step, index) => {
    const from = pairs.get(index);
    return from === undefined ||
      cleanStepSection(previous[from].section)?.toLowerCase() !==
        cleanStepSection(step.section)?.toLowerCase()
      ? [index]
      : [];
  });
};

const getListKey = (labels: string[]) =>
  labels.map(getCollectionKey).sort().join('|');

/** The form's data with a revision applied, and what changed. Unchanged lines keep their row, ingredient and staging; nothing outside the revision's reach (photo, links, nutrition) is touched. */
export function applyRevision(
  formData: RecipeFormData,
  revision: RecipeRevision,
  refMap: ReadonlyMap<string, string>,
  ingredients: ResolvedIngredient[],
  context: RevisionContext,
): { data: RecipeFormData; marks: RevisionMarks } {
  if (
    (formData.ingredients.length > 0 && revision.ingredients.length === 0) ||
    (formData.steps.some((step) => step.trim() !== '') &&
      revision.steps.length === 0)
  ) {
    throw new Error('Pepper returned a recipe with a whole section missing.');
  }
  const byId = new Map(ingredients.map((entry) => [entry.id, entry]));
  const oldRows = new Map(formData.ingredients.map((row) => [row.id, row]));
  const oldNames = new Map(
    formData.ingredients.map((row) => [row.id, getRowName(row, byId)]),
  );

  const built = revision.ingredients.reduce<
    { row: IngredientRow; previous: IngredientRow | null }[]
  >((acc, line) => {
    const oldId = line.ref === null ? undefined : refMap.get(line.ref);
    const previous =
      oldId === undefined || acc.some((entry) => entry.previous?.id === oldId)
        ? undefined
        : oldRows.get(oldId);
    const rows = acc.map((entry) => entry.row);
    if (!previous) {
      return [
        ...acc,
        {
          row: getRowFromRead(toRead(line), ingredients, rows).row,
          previous: null,
        },
      ];
    }
    if (
      normalizeName(line.name) !== normalizeName(oldNames.get(previous.id)!)
    ) {
      const { row } = getRowFromRead(toRead(line), ingredients, rows);
      return [
        ...acc,
        {
          row:
            previous.freeText === null
              ? { ...row, id: previous.id }
              : {
                  ...row,
                  id: previous.id,
                  ingredientId: '',
                  freeText: line.name,
                  newName: null,
                  proposedName: null,
                },
          previous,
        },
      ];
    }
    if (line.amount === null && hasUnreadAmount(previous)) {
      return [
        ...acc,
        {
          previous,
          row: {
            ...previous,
            note: line.note,
            group:
              getGroupKey(line.group) === getGroupKey(previous.group)
                ? previous.group
                : line.group,
          },
        },
      ];
    }
    const isAmountless = line.amount === null;
    const isSame = sameAmount(previous, line.amount);
    const getUnit = () => {
      if (isAmountless) return previous.unit;
      if (line.unit === null && isSame) return previous.unit;
      return line.unit ?? 'EACH';
    };
    const unit = getUnit();
    return [
      ...acc,
      {
        previous,
        row: {
          ...previous,
          amount: isSame
            ? previous.amount
            : isAmountless
              ? ''
              : formatAmountText(line.amount!),
          unit,
          isAmountless,
          amountText: isAmountless ? line.amountText : null,
          note: line.note,
          group:
            getGroupKey(line.group) === getGroupKey(previous.group)
              ? previous.group
              : line.group,
          adaptedFrom:
            isSame && unit === previous.unit ? previous.adaptedFrom : null,
        },
      },
    ];
  }, []);

  const previousById = new Map(
    built.flatMap((entry) =>
      entry.previous ? [[entry.row.id, entry.previous] as const] : [],
    ),
  );
  const rows = orderIngredientLines(built.map((entry) => entry.row)).slice(
    0,
    MAX_RECIPE_INGREDIENTS,
  );
  const lineById = new Map(
    built.map((entry, index) => [entry.row.id, revision.ingredients[index]]),
  );
  const keptIds = new Set(rows.map((row) => row.id));

  const steps = revision.steps.map((step) => step.text);
  const stepSections = revision.steps.map((step) =>
    cleanStepSection(step.section),
  );

  const sourceLabel = revision.source?.trim() ?? '';
  const existingSource =
    sourceLabel === ''
      ? undefined
      : context.sources.find(
          (source) => getLabelKey(source.label) === getLabelKey(sourceLabel),
        );
  const sourceChoice =
    sourceLabel === ''
      ? { choice: '', newText: '' }
      : existingSource
        ? { choice: existingSource.id, newText: '' }
        : { choice: NEW_CHOICE, newText: sourceLabel };

  const known = [...context.collections, ...formData.collections.added];
  const picked = revision.collections.reduce(
    (choice, label) =>
      addCollectionByLabel(choice, known, label, generateUuid).choice,
    { ids: [] as string[], added: [] as { id: string; label: string }[] },
  );
  const collections = {
    ids: picked.ids,
    added: [
      ...formData.collections.added.filter((entry) =>
        picked.ids.includes(entry.id),
      ),
      ...picked.added,
    ],
  };

  const data: RecipeFormData = {
    ...formData,
    title: revision.title ?? formData.title,
    basics: {
      servings: revision.servings ?? formData.basics.servings,
      prep:
        revision.prepMinutes === null
          ? formData.basics.prep
          : String(revision.prepMinutes),
      cook:
        revision.cookMinutes === null
          ? formData.basics.cook
          : String(revision.cookMinutes),
    },
    description: revision.description ?? '',
    categories: revision.categories,
    ingredients: rows,
    steps,
    stepSections,
    care: getCareText(revision.care),
    sourceChoice,
    collections,
  };

  const careKey = (care: RecipeFormData['care']) =>
    JSON.stringify([
      care.fridge.trim(),
      care.freezer.trim(),
      care.reheat.trim(),
      care.tip.trim(),
    ]);
  const addedIngredientIds = rows.flatMap((row) =>
    previousById.has(row.id) ? [] : [row.id],
  );
  const changedIngredientIds = rows.flatMap((row) => {
    const previous = previousById.get(row.id);
    return previous &&
      getFingerprint(previous, oldNames.get(previous.id)!) !==
        getFingerprint(row, lineById.get(row.id)!.name)
      ? [row.id]
      : [];
  });
  const removedIngredientNames = formData.ingredients.flatMap((row) =>
    keptIds.has(row.id) ? [] : [oldNames.get(row.id)!],
  );
  const changedStepIndices = getChangedSteps(
    formData.steps.map((text, index) => ({
      text,
      section: formData.stepSections[index] ?? null,
    })),
    revision.steps.map((step, index) => ({
      text: step.text,
      section: stepSections[index],
    })),
  );
  const marks: Omit<RevisionMarks, 'isEmpty'> = {
    title:
      revision.title !== null &&
      revision.title.trim() !== formData.title.trim(),
    description:
      (revision.description ?? '').trim() !== formData.description.trim(),
    servings:
      revision.servings !== null &&
      revision.servings !== formData.basics.servings,
    times:
      data.basics.prep.trim() !== formData.basics.prep.trim() ||
      data.basics.cook.trim() !== formData.basics.cook.trim(),
    categories:
      [...revision.categories].sort().join('|') !==
      [...formData.categories].sort().join('|'),
    care: careKey(data.care) !== careKey(formData.care),
    source:
      getLabelKey(sourceLabel) !==
      getLabelKey(getSourceLabel(formData, context.sources)),
    collections:
      getListKey(getChoiceLabels(collections, context.collections)) !==
      getListKey(getChoiceLabels(formData.collections, context.collections)),
    addedIngredientIds,
    changedIngredientIds,
    removedIngredientNames,
    changedStepIndices,
  };

  return {
    data,
    marks: {
      ...marks,
      isEmpty:
        !marks.title &&
        !marks.description &&
        !marks.servings &&
        !marks.times &&
        !marks.categories &&
        !marks.care &&
        !marks.source &&
        !marks.collections &&
        addedIngredientIds.length === 0 &&
        changedIngredientIds.length === 0 &&
        removedIngredientNames.length === 0 &&
        changedStepIndices.length === 0,
    },
  };
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A short sentence of counts for a screen reader: "Changed 2 ingredients and 1 step". */
export function describeRevisionMarks(marks: RevisionMarks) {
  const ingredientCount =
    marks.addedIngredientIds.length + marks.changedIngredientIds.length;
  const changed = [
    marks.title && 'the title',
    marks.description && 'the description',
    marks.servings && 'the servings',
    marks.times && 'the times',
    marks.categories && 'the categories',
    marks.care && 'how it keeps',
    marks.source && "where it's from",
    marks.collections && 'the collections',
    ingredientCount > 0 && count(ingredientCount, 'ingredient'),
    marks.changedStepIndices.length > 0 &&
      count(marks.changedStepIndices.length, 'step'),
  ].filter((part): part is string => part !== false);
  const removed =
    marks.removedIngredientNames.length > 0
      ? count(marks.removedIngredientNames.length, 'ingredient')
      : null;
  if (changed.length === 0) {
    return removed ? `Removed ${removed}` : 'No changes';
  }

  return `Changed ${formatList(changed)}${removed ? `; removed ${removed}` : ''}`;
}

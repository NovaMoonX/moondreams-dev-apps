import {
  COLLECTION_BATCH_SIZE,
  COLLECTION_CHIPS_QUIET_HIDDEN,
  COLLECTION_CHIPS_SHOWN,
  COLLECTION_FILTER_ANY,
  COLLECTION_FILTER_NONE,
  COLLECTION_SUGGESTION_LABELS,
  HIGH_PROTEIN_GRAMS,
  MAX_COLLECTIONS,
  MAX_RECIPE_COLLECTIONS,
  QUICK_MAX_MINUTES,
} from '@apps/pinch/constants';
import type { Collection, NutritionValues } from '@apps/pinch/types';
import type { NutritionResult } from '@apps/pinch/utils/nutritionMath';

/** A collection as far as a label lookup needs it: one the form typed but hasn't saved has no timestamps yet. */
type Named = Pick<Collection, 'id' | 'label'>;

/** What a recipe needs to say about its collections; a recipe written before collections has no key. */
interface InCollections {
  collectionIds?: readonly string[] | null;
}

/** Two labels are one collection when they differ only in case, spaces or hyphens ("High-protein", "high protein"). */
export const getCollectionKey = (label: string) => {
  const trimmed = label.trim().toLowerCase();
  const plain = trimmed.replace(/[^\p{L}\p{N}]+/gu, '');

  return plain === '' ? trimmed : plain;
};

export const findCollectionByLabel = (
  collections: readonly Named[],
  label: string,
  exceptId: string | null = null,
) => {
  const wanted = getCollectionKey(label);
  const result =
    collections.find(
      (collection) =>
        collection.id !== exceptId &&
        getCollectionKey(collection.label) === wanted,
    ) ?? null;

  return result;
};

/** The collections a recipe is in, in the order given; an id no collection has is ignored. */
export const getRecipeCollections = <T extends Named>(
  recipe: InCollections,
  collections: readonly T[],
) => {
  const ids = new Set(recipe.collectionIds ?? []);
  const result = collections.filter((collection) => ids.has(collection.id));

  return result;
};

export interface CollectionCounts {
  byCollection: Map<string, number>;
  /** Recipes that are in no collection that still exists. */
  withoutCollection: number;
}

export const getCollectionCounts = (
  recipes: readonly InCollections[],
  collections: readonly Collection[],
): CollectionCounts => {
  const known = new Set(collections.map((collection) => collection.id));
  const result = recipes.reduce<CollectionCounts>(
    (acc, recipe) => {
      const ids = new Set(recipe.collectionIds ?? []);
      const present = [...ids].filter((id) => known.has(id));
      present.forEach((id) =>
        acc.byCollection.set(id, (acc.byCollection.get(id) ?? 0) + 1),
      );

      return present.length === 0
        ? { ...acc, withoutCollection: acc.withoutCollection + 1 }
        : acc;
    },
    { byCollection: new Map(), withoutCollection: 0 },
  );

  return result;
};

/** The filter's pills: Any, each collection that holds a listed recipe with its count (the picked one stays while empty), and "No collection" only while some recipe is in none. */
export const getCollectionFilterOptions = (
  collections: readonly Collection[],
  counts: CollectionCounts,
  picked: string,
) => {
  const result = [
    { value: COLLECTION_FILTER_ANY, label: 'Any' },
    ...collections
      .filter(
        (collection) =>
          counts.byCollection.has(collection.id) || collection.id === picked,
      )
      .map((collection) => ({
        value: collection.id,
        label: `${collection.label} · ${counts.byCollection.get(collection.id) ?? 0}`,
      })),
    ...(counts.withoutCollection > 0 || picked === COLLECTION_FILTER_NONE
      ? [
          {
            value: COLLECTION_FILTER_NONE,
            label: `No collection · ${counts.withoutCollection}`,
          },
        ]
      : []),
  ];

  return result;
};

export const filterByCollection = <T extends InCollections>(
  recipes: readonly T[],
  picked: string,
  collections: readonly Collection[],
) => {
  if (picked === COLLECTION_FILTER_ANY) return [...recipes];
  if (picked === COLLECTION_FILTER_NONE) {
    const known = new Set(collections.map((collection) => collection.id));
    return recipes.filter(
      (recipe) => !(recipe.collectionIds ?? []).some((id) => known.has(id)),
    );
  }

  return recipes.filter((recipe) =>
    (recipe.collectionIds ?? []).includes(picked),
  );
};

/** How many of a recipe's collection chips show: all of them, unless more than three would be tucked away. */
export const getCollectionChipWindow = (total: number, isExpanded: boolean) => {
  const canFold =
    total - COLLECTION_CHIPS_SHOWN > COLLECTION_CHIPS_QUIET_HIDDEN;
  const shown = canFold && !isExpanded ? COLLECTION_CHIPS_SHOWN : total;

  return { shown, canFold };
};

export interface SuggestionSource {
  /** Protein per serving the suggestion may read, from `getTrustedProtein`. */
  protein: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  freezerDays: number | null;
}

export interface CollectionSuggestion {
  label: string;
  /** The collection of that name the recipe would join; null makes a new one. */
  collectionId: string | null;
}

/** Protein per serving the suggestions may read: the person's own number, else the added-up one only when no ingredient with an amount lacked a protein value. */
export const getTrustedProtein = (
  calculated: NutritionResult,
  typed: NutritionValues | null,
) => {
  if (typed?.protein != null) return typed.protein;
  const isComplete = !calculated.missing.some(
    (entry) => entry.metric === 'protein',
  );

  return isComplete ? calculated.values.protein : null;
};

/** Collections worth offering for a recipe, from its own numbers: High-protein, Quick (prep plus cook, both known) and Freezer-friendly (its care says it freezes). One the recipe is already in, or that can't be made for want of room, is left out. */
export const getSuggestedCollections = (
  source: SuggestionSource,
  collections: readonly Named[],
  memberIds: readonly string[],
): CollectionSuggestion[] => {
  const knownTotal =
    source.prepMinutes !== null && source.cookMinutes !== null
      ? source.prepMinutes + source.cookMinutes
      : null;
  const matches = [
    source.protein !== null &&
      Math.round(source.protein) >= HIGH_PROTEIN_GRAMS &&
      COLLECTION_SUGGESTION_LABELS.HIGH_PROTEIN,
    knownTotal !== null &&
      knownTotal > 0 &&
      knownTotal <= QUICK_MAX_MINUTES &&
      COLLECTION_SUGGESTION_LABELS.QUICK,
    source.freezerDays !== null &&
      COLLECTION_SUGGESTION_LABELS.FREEZER_FRIENDLY,
  ].filter((label) => label !== false);

  const result = matches.flatMap((label): CollectionSuggestion[] => {
    const existing = findCollectionByLabel(collections, label);
    if (existing) {
      return memberIds.includes(existing.id)
        ? []
        : [{ label: existing.label, collectionId: existing.id }];
    }

    return collections.length >= MAX_COLLECTIONS
      ? []
      : [{ label, collectionId: null }];
  });

  return result;
};

/** What the recipe form holds for the collections row: the ids chosen, and the new ones typed on the way, which are written with the recipe. */
export interface CollectionsChoice {
  ids: string[];
  added: { id: string; label: string }[];
}

export const EMPTY_COLLECTIONS_CHOICE: CollectionsChoice = {
  ids: [],
  added: [],
};

export const getInitialCollectionsChoice = (
  recipe: InCollections | null,
  collections: readonly Named[],
): CollectionsChoice => ({
  ids: getRecipeCollections(recipe ?? {}, collections).map(({ id }) => id),
  added: [],
});

export type ChoiceOutcome =
  'ok' | 'recipeFull' | 'collectionsFull' | 'already' | 'empty';

interface ChoiceChange {
  choice: CollectionsChoice;
  outcome: ChoiceOutcome;
}

/** Picks or unpicks one collection; unpicking a new one typed on the way drops it, so nothing is written for it. */
export const toggleCollection = (
  choice: CollectionsChoice,
  id: string,
): ChoiceChange => {
  if (choice.ids.includes(id)) {
    return {
      choice: {
        ids: choice.ids.filter((current) => current !== id),
        added: choice.added.filter((entry) => entry.id !== id),
      },
      outcome: 'ok',
    };
  }
  if (choice.ids.length >= MAX_RECIPE_COLLECTIONS) {
    return { choice, outcome: 'recipeFull' };
  }

  return { choice: { ...choice, ids: [...choice.ids, id] }, outcome: 'ok' };
};

/** Puts the recipe in the collection called `label`: the one that has that name, or a new one with an id from `makeId`. */
export const addCollectionByLabel = (
  choice: CollectionsChoice,
  collections: readonly Named[],
  label: string,
  makeId: () => string,
): ChoiceChange => {
  const trimmed = label.trim();
  if (trimmed === '') return { choice, outcome: 'empty' };

  const all = [...collections, ...choice.added];
  const existing = findCollectionByLabel(all, trimmed);
  if (existing) {
    return choice.ids.includes(existing.id)
      ? { choice, outcome: 'already' }
      : toggleCollection(choice, existing.id);
  }
  if (choice.ids.length >= MAX_RECIPE_COLLECTIONS) {
    return { choice, outcome: 'recipeFull' };
  }
  if (all.length >= MAX_COLLECTIONS) {
    return { choice, outcome: 'collectionsFull' };
  }
  const entry = { id: makeId(), label: trimmed };

  return {
    choice: { ids: [...choice.ids, entry.id], added: [...choice.added, entry] },
    outcome: 'ok',
  };
};

/** The chosen collections' names, alphabetical, for the row's one line. */
export const getChoiceLabels = (
  choice: CollectionsChoice,
  collections: readonly Named[],
) => {
  const names = new Map(
    [...collections, ...choice.added].map((entry) => [entry.id, entry.label]),
  );
  const result = choice.ids
    .flatMap((id) => {
      const label = names.get(id);
      return label === undefined ? [] : [label];
    })
    .sort((a, b) => a.localeCompare(b));

  return result;
};

/** What a save writes: the ids that still name a collection (one deleted on another device is dropped) and the new ones that are still chosen. */
export const getCollectionsToSave = (
  choice: CollectionsChoice,
  collections: readonly Named[],
) => {
  const newCollections = choice.added.filter((entry) =>
    choice.ids.includes(entry.id),
  );
  const known = new Set(
    [...collections, ...newCollections].map((entry) => entry.id),
  );
  const result = {
    collectionIds: choice.ids.filter((id) => known.has(id)),
    newCollections,
  };

  return result;
};

/** The recipes that name a collection, in groups one transaction can re-read and write. */
export const getRemovalChunks = (
  recipes: readonly (InCollections & { id: string })[],
  collectionId: string,
  size: number = COLLECTION_BATCH_SIZE,
) => {
  const ids = recipes
    .filter((recipe) => (recipe.collectionIds ?? []).includes(collectionId))
    .map((recipe) => recipe.id);
  const result = Array.from({ length: Math.ceil(ids.length / size) }, (_, i) =>
    ids.slice(i * size, (i + 1) * size),
  );

  return result;
};

/** What a recipe's collections become without one, or null when the stored list doesn't name it (another device already took it out): then nothing is written. */
export const withoutCollection = (ids: unknown, collectionId: string) => {
  if (!Array.isArray(ids) || !ids.includes(collectionId)) return null;
  const result = ids.filter((id) => id !== collectionId);

  return result;
};

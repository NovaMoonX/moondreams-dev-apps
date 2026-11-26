import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

import { canOpenApp } from '../../../appAccess.js';
import type {
  AppActionResult,
  LiveQueryRequest,
  LiveQueryResult,
  ServerAppAction,
  ServerAppActionCtx,
  SourceAdapter,
  SourceCtx,
  SyncPageRequest,
  SyncPageResult,
} from '../../../connections/registry.js';
import { dayRangeMs } from '../../../connections/liveDay.js';
import {
  MAX_RECORDS_PER_CATEGORY,
  SHARED_RECORD_KEYS,
  type SharedRecord,
} from '../../../vendor/connectionsContract.js';
import {
  DAY_MS,
  dayToUtcMidnight,
  getDigestBounds,
  getLocalMoment,
  readReminders,
} from '../eatSoonDigest.js';
import { CATALOG_NAMES } from './catalogNames.js';
import {
  ADD_RECIPE_SHAPE,
  ADD_TO_SHOPPING_LIST_SHAPE,
  FILL_NUTRITION_SHAPE,
  FIND_INGREDIENTS_SHAPE,
  PLAN_MEAL_SHAPE,
  SAVE_IDEA_SHAPE,
  UPDATE_RECIPE_SHAPE,
  addRecipe,
  addToShoppingList,
  fillNutrition,
  findIngredients,
  planMeal,
  saveIdea,
  undoPinchOutsideChange,
  updateRecipe,
} from './changes.js';
import { groupIngredientLines } from './ingredientGroups.js';
import { PINCH_SHARES } from './manifest.js';

const readManifest = () => {
  const [declared] = PINCH_SHARES.shares;
  if (!declared) throw new Error('Pinch declares nothing to share.');
  return declared;
};

const manifest = readManifest();

const MEAL_LIMIT = 500;
const LINE_LIMIT = 1000;
const STOCK_LIMIT = 100;
const FULL_STOCK_LIMIT = 300;
const RECIPE_LIMIT = 500;
const SAVED_MEAL_LIMIT = 200;
const IDEA_LIMIT = 200;
const PLATE_NAMES_SHOWN = 3;
const PLATE_ITEMS_READ = 8;
const NAME_CLIP = 40;
const DETAIL_LIMIT = 120;

const DISH_WORDS: Record<string, string> = {
  BREAKFAST: 'Breakfast',
  MAIN: 'Main dishes',
  SIDE: 'Sides',
  SOUP_SALAD: 'Soups & salads',
  SNACK: 'Snacks',
  DESSERT: 'Desserts',
  BAKING: 'Baking',
  DRINK: 'Drinks',
  SAUCE: 'Sauces & dips',
};

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** A date picked with no time is UTC midnight, so it reads in UTC. */
const formatDay = (value: number) => dayFormatter.format(new Date(value));

const joinLines = (parts: Array<string | null>, separator = ' · ') =>
  parts.flatMap((part) => (part === null ? [] : [part])).join(separator) ||
  null;

const clipTo = (text: string, limit: number) =>
  text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;

const clip = (text: string | null) =>
  text === null ? null : clipTo(text, DETAIL_LIMIT);

const MEAL_TYPE_WORDS: Record<string, string> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
  SNACK: 'Snack',
  DESSERT: 'Dessert',
  DRINK: 'Drink',
};

const IDEA_WORDS: Record<string, string> = {
  LINK: 'Saved link',
  PHOTO: 'Saved photo',
  TEXT: 'Written idea',
};

const PLACE_WORDS: Record<string, string> = {
  FRIDGE: 'Fridge',
  FREEZER: 'Freezer',
  PANTRY: 'Pantry',
};

const UNIT_WORDS: Record<string, string> = {
  G: 'g',
  KG: 'kg',
  OZ: 'oz',
  LB: 'lb',
  ML: 'ml',
  L: 'l',
  TSP: 'tsp',
  TBSP: 'tbsp',
  CUP: 'cup',
  FL_OZ: 'fl oz',
  PINCH: 'pinch',
  EACH: '',
};

const EMPTY_RECORD: SharedRecord = {
  sourceRef: '',
  kind: 'task',
  title: '',
  subtitle: null,
  detail: null,
  startAt: null,
  endAt: null,
  isAllDay: false,
  dueAt: null,
  timeZone: null,
  placeLabel: null,
  amountCents: null,
  currency: null,
  sourceUpdatedAt: null,
  extra: {},
};

type RecordFields = Pick<SharedRecord, 'sourceRef' | 'kind' | 'title'> &
  Partial<Omit<SharedRecord, 'extra'>>;

/** The only way a record leaves: exactly the contract's keys, nothing the source added. */
const toRecord = (fields: RecordFields): SharedRecord => {
  const full: SharedRecord = { ...EMPTY_RECORD, ...fields, extra: {} };
  return Object.fromEntries(
    SHARED_RECORD_KEYS.map((key) => [key, full[key]]),
  ) as unknown as SharedRecord;
};

const readText = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const readTime = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const kitchenPath = (uid: string, collection: string) =>
  `apps/pinch/kitchens/${uid}/${collection}`;

const readNames = async (
  firestore: Firestore,
  uid: string,
  collection: string,
  ids: string[],
  field: string,
) => {
  if (ids.length === 0)
    return new Map<string, FirebaseFirestore.DocumentSnapshot>();
  const snapshots = await firestore.getAll(
    ...ids.map((id) => firestore.doc(`${kitchenPath(uid, collection)}/${id}`)),
    { fieldMask: [field, 'catalogId'] },
  );
  return new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
};

/** An ingredient's name: the person's own record, else the catalog's. */
const readIngredientNames = async (
  firestore: Firestore,
  uid: string,
  ids: string[],
) => {
  const unique = Array.from(new Set(ids));
  const records = await readNames(
    firestore,
    uid,
    'ingredients',
    unique,
    'name',
  );
  return new Map(
    unique.map((id) => {
      const record = records.get(id);
      const catalogId = readText(record?.get('catalogId')) ?? id;
      const name =
        readText(record?.get('name')) ??
        (Object.hasOwn(CATALOG_NAMES, catalogId)
          ? CATALOG_NAMES[catalogId]
          : null);
      return [id, name];
    }),
  );
};

const readRecipeTitles = async (
  firestore: Firestore,
  uid: string,
  ids: string[],
) => {
  const unique = Array.from(new Set(ids));
  const records = await readNames(firestore, uid, 'recipes', unique, 'title');
  return new Map(
    unique.map((id) => [id, readText(records.get(id)?.get('title'))]),
  );
};

interface MealItemRow {
  kind: string;
  refId: string;
}

const readItems = (value: unknown): MealItemRow[] =>
  Array.isArray(value)
    ? value.flatMap((item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.refId === 'string' &&
        typeof item.kind === 'string'
          ? [{ kind: item.kind, refId: item.refId }]
          : [],
      )
    : [];

interface CategoryRead {
  records: SharedRecord[];
  isFull: boolean;
}

async function syncPlannedMeals(
  firestore: Firestore,
  uid: string,
  windowStart: number,
): Promise<CategoryRead> {
  const snapshot = await firestore
    .collection(kitchenPath(uid, 'plannedMeals'))
    .where('date', '>=', windowStart)
    .orderBy('date')
    .limit(MEAL_LIMIT)
    .get();
  const meals = snapshot.docs.map((doc) => ({
    id: doc.id,
    date: readTime(doc.get('date')),
    mealType: doc.get('mealType') as unknown,
    name: readText(doc.get('name')),
    items: readItems(doc.get('items')),
    updatedAt: readTime(doc.get('updatedAt')),
  }));
  const unnamed = meals
    .filter((meal) => meal.name === null)
    .flatMap((meal) => meal.items);
  const [recipeTitles, ingredientNames] = await Promise.all([
    readRecipeTitles(
      firestore,
      uid,
      unnamed
        .filter((item) => item.kind === 'RECIPE')
        .map((item) => item.refId),
    ),
    readIngredientNames(
      firestore,
      uid,
      unnamed
        .filter((item) => item.kind === 'INGREDIENT')
        .map((item) => item.refId),
    ),
  ]);

  const records = meals.flatMap((meal) => {
    const title =
      meal.name ??
      meal.items
        .flatMap((item) => {
          const names = item.kind === 'RECIPE' ? recipeTitles : ingredientNames;
          return [names.get(item.refId) ?? null];
        })
        .filter((name): name is string => name !== null)
        .join(', ');
    if (meal.date === null || title === '') return [];
    return [
      toRecord({
        sourceRef: `plannedMeals/${meal.id}`,
        kind: 'event',
        title,
        subtitle:
          typeof meal.mealType === 'string' &&
          Object.hasOwn(MEAL_TYPE_WORDS, meal.mealType)
            ? MEAL_TYPE_WORDS[meal.mealType]
            : null,
        startAt: meal.date,
        isAllDay: true,
        sourceUpdatedAt: meal.updatedAt,
      }),
    ];
  });
  return { records, isFull: snapshot.size < MEAL_LIMIT };
}

const formatAmount = (amount: unknown, unit: unknown) => {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)
    return null;
  const words =
    typeof unit === 'string' && Object.hasOwn(UNIT_WORDS, unit)
      ? UNIT_WORDS[unit]
      : '';
  return `${Math.round(amount * 100) / 100}${words === '' ? '' : ` ${words}`}`;
};

async function syncShoppingList(
  firestore: Firestore,
  uid: string,
): Promise<CategoryRead> {
  const snapshot = await firestore
    .collection(kitchenPath(uid, 'shoppingItems'))
    .where('isChecked', '==', false)
    .limit(LINE_LIMIT)
    .get();
  const names = await readIngredientNames(
    firestore,
    uid,
    snapshot.docs.flatMap((doc) => {
      const id = readText(doc.get('ingredientId'));
      return id === null ? [] : [id];
    }),
  );
  const records = snapshot.docs.flatMap((doc) => {
    const ingredientId = readText(doc.get('ingredientId'));
    const title =
      ingredientId === null
        ? readText(doc.get('freeText'))
        : (names.get(ingredientId) ?? null);
    if (title === null) return [];
    return [
      toRecord({
        sourceRef: `shoppingItems/${doc.id}`,
        kind: 'task',
        title,
        subtitle: formatAmount(doc.get('amount'), doc.get('unit')),
        sourceUpdatedAt: readTime(doc.get('updatedAt')),
      }),
    ];
  });
  return { records, isFull: snapshot.size < LINE_LIMIT };
}

async function syncUseSoon(
  firestore: Firestore,
  uid: string,
  now: number,
): Promise<CategoryRead> {
  const settings = await firestore.doc(`apps/pinch/settings/${uid}`).get();
  const { leadDays, timeZone } = readReminders(settings.data() ?? {});
  const today = dayToUtcMidnight(getLocalMoment(now, timeZone ?? 'UTC').day);
  const { from, to } = getDigestBounds(today, leadDays);
  const [containers, packages] = await Promise.all([
    firestore
      .collection(kitchenPath(uid, 'containers'))
      .where('status', '==', 'IN_STOCK')
      .where('eatBy', '>=', from)
      .where('eatBy', '<=', to)
      .orderBy('eatBy')
      .limit(STOCK_LIMIT)
      .get(),
    firestore
      .collection(kitchenPath(uid, 'packages'))
      .where('status', '==', 'IN_STOCK')
      .where('expiresAt', '>=', from)
      .where('expiresAt', '<=', to)
      .orderBy('expiresAt')
      .limit(STOCK_LIMIT)
      .get(),
  ]);
  const toUseSoon = (
    collection: string,
    doc: FirebaseFirestore.QueryDocumentSnapshot,
    title: unknown,
    dueAt: unknown,
  ) => {
    const text = readText(title);
    const due = readTime(dueAt);
    if (text === null || due === null) return [];
    const place = doc.get('place') as unknown;
    return [
      toRecord({
        sourceRef: `${collection}/${doc.id}`,
        kind: 'task',
        title: text,
        subtitle:
          typeof place === 'string' && Object.hasOwn(PLACE_WORDS, place)
            ? PLACE_WORDS[place]
            : null,
        dueAt: due,
        isAllDay: true,
        sourceUpdatedAt: readTime(doc.get('updatedAt')),
      }),
    ];
  };
  return {
    records: [
      ...containers.docs.flatMap((doc) =>
        toUseSoon('containers', doc, doc.get('title'), doc.get('eatBy')),
      ),
      ...packages.docs.flatMap((doc) =>
        toUseSoon(
          'packages',
          doc,
          doc.get('ingredientName'),
          doc.get('expiresAt'),
        ),
      ),
    ],
    isFull: containers.size < STOCK_LIMIT && packages.size < STOCK_LIMIT,
  };
}

const toStockRecord = (
  collection: string,
  doc: FirebaseFirestore.QueryDocumentSnapshot,
  title: unknown,
  amount: string | null,
  dateLabel: string,
  date: unknown,
) => {
  const text = readText(title);
  if (text === null) return [];
  const day = readTime(date);
  const place = doc.get('place') as unknown;
  return [
    toRecord({
      sourceRef: `${collection}/${doc.id}`,
      kind: 'artifact',
      title: text,
      subtitle:
        typeof place === 'string' && Object.hasOwn(PLACE_WORDS, place)
          ? PLACE_WORDS[place]
          : null,
      detail: clip(
        joinLines([
          amount,
          day === null ? null : `${dateLabel} ${formatDay(day)}`,
        ]),
      ),
      sourceUpdatedAt: readTime(doc.get('updatedAt')),
    }),
  ];
};

async function syncPantryStock(
  firestore: Firestore,
  uid: string,
): Promise<CategoryRead> {
  const [containers, packages] = await Promise.all([
    firestore
      .collection(kitchenPath(uid, 'containers'))
      .where('status', '==', 'IN_STOCK')
      .select('title', 'place', 'eatBy', 'servings', 'updatedAt')
      .limit(FULL_STOCK_LIMIT)
      .get(),
    firestore
      .collection(kitchenPath(uid, 'packages'))
      .where('status', '==', 'IN_STOCK')
      .select(
        'ingredientName',
        'place',
        'expiresAt',
        'amount',
        'unit',
        'updatedAt',
      )
      .limit(FULL_STOCK_LIMIT)
      .get(),
  ]);
  return {
    records: [
      ...containers.docs.flatMap((doc) => {
        const servings = doc.get('servings') as unknown;
        return toStockRecord(
          'containers',
          doc,
          doc.get('title'),
          typeof servings === 'number' && servings > 0
            ? `${servings} ${servings === 1 ? 'serving' : 'servings'}`
            : null,
          'eat by',
          doc.get('eatBy'),
        );
      }),
      ...packages.docs.flatMap((doc) =>
        toStockRecord(
          'packages',
          doc,
          doc.get('ingredientName'),
          formatAmount(doc.get('amount'), doc.get('unit')),
          'use by',
          doc.get('expiresAt'),
        ),
      ),
    ],
    isFull:
      containers.size < FULL_STOCK_LIMIT && packages.size < FULL_STOCK_LIMIT,
  };
}

async function syncRecipes(
  firestore: Firestore,
  uid: string,
): Promise<CategoryRead> {
  const snapshot = await firestore
    .collection(kitchenPath(uid, 'recipes'))
    .orderBy('updatedAt', 'desc')
    .select(
      'title',
      'servings',
      'prepMinutes',
      'cookMinutes',
      'categories',
      'isFavorite',
      'isArchived',
      'updatedAt',
    )
    .limit(RECIPE_LIMIT)
    .get();
  const records = snapshot.docs.flatMap((doc) => {
    const title = readText(doc.get('title'));
    if (title === null || doc.get('isArchived') === true) return [];
    const servings = doc.get('servings') as unknown;
    const minutes =
      (readTime(doc.get('prepMinutes')) ?? 0) +
      (readTime(doc.get('cookMinutes')) ?? 0);
    const dishes = doc.get('categories') as unknown;
    return [
      toRecord({
        sourceRef: `recipes/${doc.id}`,
        kind: 'artifact',
        title,
        detail: clip(
          joinLines([
            doc.get('isFavorite') === true ? 'Favourite' : null,
            Array.isArray(dishes)
              ? joinLines(
                  dishes.flatMap((dish) =>
                    typeof dish === 'string' && Object.hasOwn(DISH_WORDS, dish)
                      ? [DISH_WORDS[dish]]
                      : [],
                  ),
                  ', ',
                )
              : null,
            typeof servings === 'number' && servings > 0
              ? `serves ${servings}`
              : null,
            minutes > 0 ? `${minutes} min` : null,
          ]),
        ),
        sourceUpdatedAt: readTime(doc.get('updatedAt')),
      }),
    ];
  });
  return { records, isFull: snapshot.size < RECIPE_LIMIT };
}

const describePlate = (all: string[], more: number) => {
  if (all.length === 0) return null;
  const tail = ` and ${more} more`;
  const room = Math.floor(
    (DETAIL_LIMIT - tail.length - 2 * (all.length - 1)) / all.length,
  );
  const names = all.map((name) =>
    clipTo(name, more > 0 ? Math.min(NAME_CLIP, room) : NAME_CLIP),
  );
  if (more > 0) return `${names.join(', ')}${tail}`;
  const last = names[names.length - 1];
  return names.length === 1
    ? last
    : `${names.slice(0, -1).join(', ')} and ${last}`;
};

async function syncSavedMeals(
  firestore: Firestore,
  uid: string,
): Promise<CategoryRead> {
  const snapshot = await firestore
    .collection(kitchenPath(uid, 'meals'))
    .orderBy('updatedAt', 'desc')
    .select('name', 'items', 'isFavorite', 'updatedAt')
    .limit(SAVED_MEAL_LIMIT)
    .get();
  const meals = snapshot.docs.map((doc) => ({
    id: doc.id,
    name: readText(doc.get('name')),
    items: readItems(doc.get('items')),
    isFavorite: doc.get('isFavorite') === true,
    updatedAt: readTime(doc.get('updatedAt')),
  }));
  const shown = meals.flatMap((meal) => meal.items.slice(0, PLATE_ITEMS_READ));
  const [recipeTitles, ingredientNames] = await Promise.all([
    readRecipeTitles(
      firestore,
      uid,
      shown.filter((item) => item.kind === 'RECIPE').map((item) => item.refId),
    ),
    readIngredientNames(
      firestore,
      uid,
      shown
        .filter((item) => item.kind === 'INGREDIENT')
        .map((item) => item.refId),
    ),
  ]);
  const records = meals.flatMap((meal) => {
    if (meal.name === null) return [];
    const read = meal.items.slice(0, PLATE_ITEMS_READ);
    const found = read.flatMap((item, index) => {
      const name = (
        item.kind === 'RECIPE' ? recipeTitles : ingredientNames
      ).get(item.refId);
      return name === null || name === undefined ? [] : [{ name, index }];
    });
    const first = found.slice(0, PLATE_NAMES_SHOWN);
    const names = first.map(({ name }) => name);
    const consumed =
      first.length === PLATE_NAMES_SHOWN
        ? first[first.length - 1].index + 1
        : read.length;
    return [
      toRecord({
        sourceRef: `meals/${meal.id}`,
        kind: 'artifact',
        title: meal.name,
        detail: clip(
          joinLines([
            meal.isFavorite ? 'Favourite' : null,
            describePlate(names, meal.items.length - consumed),
          ]),
        ),
        sourceUpdatedAt: meal.updatedAt,
      }),
    ];
  });
  return { records, isFull: snapshot.size < SAVED_MEAL_LIMIT };
}

async function syncIdeas(
  firestore: Firestore,
  uid: string,
): Promise<CategoryRead> {
  const snapshot = await firestore
    .collection(kitchenPath(uid, 'ideas'))
    .orderBy('updatedAt', 'desc')
    .select('title', 'kind', 'siteName', 'recipeId', 'updatedAt')
    .limit(IDEA_LIMIT)
    .get();
  const recipeIds = Array.from(
    new Set(
      snapshot.docs.flatMap((doc) => {
        const recipeId = readText(doc.get('recipeId'));
        return recipeId === null ? [] : [recipeId];
      }),
    ),
  );
  const recipes = await readNames(
    firestore,
    uid,
    'recipes',
    recipeIds,
    'isArchived',
  );
  const isMadeIntoRecipe = (recipeId: string | null) => {
    if (recipeId === null) return false;
    const recipe = recipes.get(recipeId);
    return recipe?.exists === true && recipe.get('isArchived') !== true;
  };
  const records = snapshot.docs.flatMap((doc) => {
    const title = readText(doc.get('title'));
    if (title === null || isMadeIntoRecipe(readText(doc.get('recipeId'))))
      return [];
    const kind = readText(doc.get('kind')) ?? '';
    return [
      toRecord({
        sourceRef: `ideas/${doc.id}`,
        kind: 'artifact',
        title: clipTo(title, DETAIL_LIMIT),
        detail: clip(
          joinLines([
            Object.hasOwn(IDEA_WORDS, kind) ? IDEA_WORDS[kind] : null,
            readText(doc.get('siteName')),
          ]),
        ),
        sourceUpdatedAt: readTime(doc.get('updatedAt')),
      }),
    ];
  });
  return { records, isFull: snapshot.size < IDEA_LIMIT };
}

const COOK_LIMIT = MAX_RECORDS_PER_CATEGORY;

interface LiveArgs {
  text: string | null;
  from: string | null;
  to: string | null;
  zone: string | null;
}

const readDayText = (value: unknown) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    ? value
    : null;

const readLiveArgs = (args: unknown): LiveArgs => {
  const source =
    typeof args === 'object' && args !== null
      ? (args as Record<string, unknown>)
      : {};
  return {
    text: readText(source.text)?.toLowerCase() ?? null,
    from: readDayText(source.from),
    to: readDayText(source.to),
    zone: typeof source.timeZone === 'string' ? source.timeZone : null,
  };
};

const matchesText = (text: string | null, ...names: (string | null)[]) =>
  text === null ||
  names.some((name) => name !== null && name.toLowerCase().includes(text));

/** As many items as fit in the room, the rest named as a count; the tail is counted from what is shown. */
const listWithin = (items: string[], room: number) => {
  const tail = (shown: number) =>
    shown === items.length ? '' : ` and ${items.length - shown} more`;
  const text = (shown: number) =>
    `${items.slice(0, shown).join(', ')}${tail(shown)}`;
  const shown = items
    .map((_, index) => items.length - index)
    .find((count) => text(count).length <= room);
  return shown === undefined ? null : text(shown);
};

const readCollectionLabels = async (firestore: Firestore, uid: string) => {
  const snapshot = await firestore
    .collection(kitchenPath(uid, 'collections'))
    .select('label')
    .limit(RECIPE_LIMIT)
    .get();
  return new Map(
    snapshot.docs.map((doc) => [doc.id, readText(doc.get('label'))]),
  );
};

const toIngredientLine = (
  names: Map<string, string | null>,
  row: unknown,
): string[] => {
  const line = typeof row === 'object' && row !== null ? row : {};
  const record = line as Record<string, unknown>;
  const name =
    typeof record.ingredientId === 'string'
      ? (names.get(record.ingredientId) ?? null)
      : null;
  if (name === null) return [];
  const amount = formatAmount(record.amount, record.unit);
  return [clipTo(amount === null ? name : `${amount} ${name}`, NAME_CLIP)];
};

async function queryRecipeIngredients(
  firestore: Firestore,
  uid: string,
  args: LiveArgs,
): Promise<LiveQueryResult> {
  const [snapshot, collections] = await Promise.all([
    firestore
      .collection(kitchenPath(uid, 'recipes'))
      .orderBy('updatedAt', 'desc')
      .select(
        'title',
        'ingredients',
        'prepMinutes',
        'cookMinutes',
        'collectionIds',
        'isArchived',
        'updatedAt',
      )
      .limit(RECIPE_LIMIT)
      .get(),
    readCollectionLabels(firestore, uid),
  ]);
  const recipes = snapshot.docs.filter(
    (doc) =>
      readText(doc.get('title')) !== null && doc.get('isArchived') !== true,
  );
  const rows = recipes.map((doc) => (doc.get('ingredients') ?? []) as unknown);
  const ingredientIds = rows.flatMap((row) =>
    Array.isArray(row)
      ? row.flatMap((line) =>
          typeof line?.ingredientId === 'string' ? [line.ingredientId] : [],
        )
      : [],
  );
  const names = await readIngredientNames(firestore, uid, ingredientIds);
  const records = recipes.flatMap((doc, index) => {
    const title = readText(doc.get('title')) ?? '';
    const row = rows[index];
    const lines = Array.isArray(row)
      ? row.flatMap((line) => toIngredientLine(names, line))
      : [];
    const collectionIds = doc.get('collectionIds') as unknown;
    const labels = (Array.isArray(collectionIds) ? collectionIds : []).flatMap(
      (id) =>
        typeof id === 'string' && collections.get(id)
          ? [collections.get(id) as string]
          : [],
    );
    if (!matchesText(args.text, title, ...labels, ...lines)) return [];
    const minutes =
      (readTime(doc.get('prepMinutes')) ?? 0) +
      (readTime(doc.get('cookMinutes')) ?? 0);
    const lead = joinLines([
      minutes > 0 ? `${minutes} min` : null,
      labels.length > 0 ? `in ${clipTo(labels.join(', '), NAME_CLIP)}` : null,
    ]);
    const listed = listWithin(
      lines,
      DETAIL_LIMIT - (lead === null ? 0 : lead.length + 3) - 'With '.length,
    );
    return [
      toRecord({
        sourceRef: `recipes/${doc.id}`,
        kind: 'artifact',
        title,
        detail: clip(
          joinLines([lead, listed === null ? null : `With ${listed}`]),
        ),
        sourceUpdatedAt: readTime(doc.get('updatedAt')),
      }),
    ];
  });
  return {
    records: records.slice(0, MAX_RECORDS_PER_CATEGORY),
    matchedCount: records.length,
    totalCents: null,
    currency: null,
    isPartial:
      snapshot.size >= RECIPE_LIMIT ||
      records.length > MAX_RECORDS_PER_CATEGORY,
    from: null,
    to: null,
  };
}

async function queryCooked(
  firestore: Firestore,
  uid: string,
  args: LiveArgs,
): Promise<LiveQueryResult> {
  const { fromMs: fromAt, toMsExclusive: toAt } = dayRangeMs(
    args.from,
    args.to,
    args.zone,
  );
  const base = firestore.collection(kitchenPath(uid, 'cooks'));
  const dated = [
    ...(fromAt === null ? [] : [['>=', fromAt] as const]),
    ...(toAt === null ? [] : [['<', toAt] as const]),
  ].reduce<FirebaseFirestore.Query>(
    (query, [operator, at]) => query.where('cookedAt', operator, at),
    base,
  );
  const snapshot = await dated
    .orderBy('cookedAt', 'desc')
    .select('recipeId', 'cookedAt')
    .limit(COOK_LIMIT)
    .get();
  const titles = await readRecipeTitles(
    firestore,
    uid,
    snapshot.docs.flatMap((doc) => readText(doc.get('recipeId')) ?? []),
  );
  const records = snapshot.docs.flatMap((doc) => {
    const title = titles.get(readText(doc.get('recipeId')) ?? '') ?? null;
    const cookedAt = readTime(doc.get('cookedAt'));
    if (title === null || cookedAt === null || !matchesText(args.text, title))
      return [];
    return [
      toRecord({
        sourceRef: `cooks/${doc.id}`,
        kind: 'event',
        title,
        detail: `Cooked ${formatDay(cookedAt)}`,
        startAt: cookedAt,
      }),
    ];
  });
  return {
    records,
    matchedCount: records.length,
    totalCents: null,
    currency: null,
    isPartial: snapshot.size >= COOK_LIMIT,
    from: args.from,
    to: args.to,
  };
}

const readSteps = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap((step) => readText(step) ?? []) : [];

async function queryFullRecipes(
  firestore: Firestore,
  uid: string,
  args: LiveArgs,
): Promise<LiveQueryResult> {
  const snapshot = await firestore
    .collection(kitchenPath(uid, 'recipes'))
    .orderBy('updatedAt', 'desc')
    .select('title', 'description', 'steps', 'isArchived', 'updatedAt')
    .limit(RECIPE_LIMIT)
    .get();
  const records = snapshot.docs.flatMap((doc) => {
    const title = readText(doc.get('title'));
    const description = readText(doc.get('description'));
    const steps = readSteps(doc.get('steps'));
    if (
      title === null ||
      doc.get('isArchived') === true ||
      !matchesText(args.text, title, description)
    ) {
      return [];
    }
    return [
      toRecord({
        sourceRef: `recipes/${doc.id}`,
        kind: 'artifact',
        title,
        detail: clip(
          joinLines([
            description,
            steps.length > 0 ? `${steps.length} steps` : null,
          ]),
        ),
        sourceUpdatedAt: readTime(doc.get('updatedAt')),
      }),
    ];
  });
  return {
    records: records.slice(0, MAX_RECORDS_PER_CATEGORY),
    matchedCount: records.length,
    totalCents: null,
    currency: null,
    isPartial:
      snapshot.size >= RECIPE_LIMIT ||
      records.length > MAX_RECORDS_PER_CATEGORY,
    from: null,
    to: null,
  };
}

const ACTION_RESULT_LIMIT = 15;
const MAX_PLAN_DAYS = 14;
const DEFAULT_PLAN_DAYS = 7;
const KITCHEN_ITEM_LIMIT = 60;

const weekdayDayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const categoryLabel = (id: string) =>
  manifest.categories.find((category) => category.id === id)?.label ?? id;

const toActionResult = (
  actionId: string,
  ctx: ServerAppActionCtx,
  data: unknown,
): AppActionResult => ({
  status: 'ok',
  data,
  heldBack: (
    manifest.actions.find((action) => action.id === actionId)?.categories ?? []
  )
    .filter((id) => !ctx.allowedCategories.has(id))
    .map((id) => ({ category: id, label: categoryLabel(id) })),
});

const switchedOff = (ids: string[]): AppActionResult => ({
  status: 'switchedOff',
  needs: ids.map((id) => ({ category: id, label: categoryLabel(id) })),
});

const dishLabels = (value: unknown) =>
  Array.isArray(value)
    ? value.flatMap((dish) =>
        typeof dish === 'string' && Object.hasOwn(DISH_WORDS, dish)
          ? [DISH_WORDS[dish]]
          : [],
      )
    : [];

const minutesOf = (doc: FirebaseFirestore.DocumentSnapshot) => {
  const total =
    (readTime(doc.get('prepMinutes')) ?? 0) +
    (readTime(doc.get('cookMinutes')) ?? 0);
  return total > 0 ? total : null;
};

const toLineText = (names: Map<string, string | null>, row: unknown) => {
  const record =
    typeof row === 'object' && row !== null
      ? (row as Record<string, unknown>)
      : {};
  const name =
    typeof record.ingredientId === 'string'
      ? (names.get(record.ingredientId) ?? null)
      : readText(record.freeText);
  if (name === null) return [];
  const amount = formatAmount(record.amount, record.unit);
  return [
    {
      group: readText(record.group),
      text: amount === null ? name : `${amount} ${name}`,
    },
  ];
};

const dayShape = (words: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(words);

const MEAL_PLAN_SHAPE = {
  from: dayShape(
    "First day, YYYY-MM-DD, in the person's own time zone. Defaults to today.",
  ),
  to: dayShape(
    `Last day, YYYY-MM-DD. Defaults to six days after the first; at most ${MAX_PLAN_DAYS} days come back at a time.`,
  ),
};

const getMealPlan = async (
  firestore: Firestore,
  ctx: ServerAppActionCtx,
  input: Record<string, unknown>,
): Promise<AppActionResult> => {
  if (!ctx.allowedCategories.has('plannedMeals')) {
    return switchedOff(['plannedMeals']);
  }
  const fromMs = dayToUtcMidnight(
    readDayText(input.from) ?? getLocalMoment(ctx.now, ctx.timeZone).day,
  );
  const toDay = readDayText(input.to);
  const requestedTo =
    toDay === null
      ? fromMs + (DEFAULT_PLAN_DAYS - 1) * DAY_MS
      : dayToUtcMidnight(toDay);
  if (requestedTo < fromMs) {
    return {
      status: 'refused',
      message: 'The last day is before the first day.',
    };
  }
  const lastMs = Math.min(requestedTo, fromMs + (MAX_PLAN_DAYS - 1) * DAY_MS);
  const snapshot = await firestore
    .collection(kitchenPath(ctx.uid, 'plannedMeals'))
    .where('date', '>=', fromMs)
    .where('date', '<=', lastMs)
    .orderBy('date')
    .limit(MEAL_LIMIT)
    .get();
  const meals = snapshot.docs.flatMap((doc) => {
    const date = readTime(doc.get('date'));
    return date === null
      ? []
      : [
          {
            date,
            slot: doc.get('mealType') as unknown,
            name: readText(doc.get('name')),
            items: readItems(doc.get('items')),
          },
        ];
  });
  const items = meals.flatMap((meal) => meal.items);
  const [recipeTitles, ingredientNames] = await Promise.all([
    readRecipeTitles(
      firestore,
      ctx.uid,
      items.filter((item) => item.kind === 'RECIPE').map((item) => item.refId),
    ),
    readIngredientNames(
      firestore,
      ctx.uid,
      items
        .filter((item) => item.kind === 'INGREDIENT')
        .map((item) => item.refId),
    ),
  ]);
  const days = Array.from(new Set(meals.map((meal) => meal.date))).map(
    (date) => ({
      date: weekdayDayFormatter.format(new Date(date)),
      meals: meals
        .filter((meal) => meal.date === date)
        .map((meal) => ({
          slot:
            typeof meal.slot === 'string' &&
            Object.hasOwn(MEAL_TYPE_WORDS, meal.slot)
              ? MEAL_TYPE_WORDS[meal.slot]
              : null,
          name: meal.name,
          plate: meal.items.flatMap((item) => {
            const isRecipe = item.kind === 'RECIPE';
            const name =
              (isRecipe ? recipeTitles : ingredientNames).get(item.refId) ??
              null;
            if (name === null) return [];
            return [
              isRecipe ? { recipeId: item.refId, name } : { ingredient: name },
            ];
          }),
        })),
    }),
  );
  return toActionResult('get_meal_plan', ctx, {
    from: formatDay(fromMs),
    to: formatDay(lastMs),
    days,
    ...(lastMs < requestedTo && {
      note: `Only ${MAX_PLAN_DAYS} days come back at a time; ask again from ${formatDay(lastMs + DAY_MS)} for the rest.`,
    }),
  });
};

const SEARCH_RECIPES_SHAPE = {
  query: z
    .string()
    .max(100)
    .optional()
    .describe(
      'Words from the name or the kind of dish, such as "chicken" or "desserts". Leave out to list the newest.',
    ),
  kind: z
    .enum(['recipes', 'savedMeals', 'ideas', 'all'])
    .optional()
    .describe(
      'recipes, savedMeals (plates saved to plan again), ideas (saved to try later) or all. Defaults to all.',
    ),
  favoritesOnly: z
    .boolean()
    .optional()
    .describe('Only favourites; ideas have none.'),
};

const KIND_CATEGORY: Record<string, string> = {
  recipes: 'recipes',
  savedMeals: 'savedMeals',
  ideas: 'ideas',
};

const searchRecipes = async (
  firestore: Firestore,
  ctx: ServerAppActionCtx,
  input: Record<string, unknown>,
): Promise<AppActionResult> => {
  const kind = typeof input.kind === 'string' ? input.kind : 'all';
  const wanted =
    kind === 'all'
      ? Object.keys(KIND_CATEGORY)
      : Object.keys(KIND_CATEGORY).filter((name) => name === kind);
  const open = wanted.filter((name) =>
    ctx.allowedCategories.has(KIND_CATEGORY[name]),
  );
  if (open.length === 0) {
    return switchedOff(wanted.map((name) => KIND_CATEGORY[name]));
  }
  const text = readText(input.query)?.toLowerCase() ?? null;
  const isFavoritesOnly = input.favoritesOnly === true;
  const found = await Promise.all(
    open.map(async (name) => {
      if (name === 'recipes') {
        const snapshot = await firestore
          .collection(kitchenPath(ctx.uid, 'recipes'))
          .orderBy('updatedAt', 'desc')
          .select(
            'title',
            'servings',
            'prepMinutes',
            'cookMinutes',
            'categories',
            'isFavorite',
            'isArchived',
            'updatedAt',
          )
          .limit(RECIPE_LIMIT)
          .get();
        return snapshot.docs.flatMap((doc) => {
          const title = readText(doc.get('title'));
          const dishes = dishLabels(doc.get('categories'));
          const isFavorite = doc.get('isFavorite') === true;
          if (
            title === null ||
            doc.get('isArchived') === true ||
            (isFavoritesOnly && !isFavorite) ||
            !matchesText(text, title, ...dishes)
          ) {
            return [];
          }
          return [
            {
              kind: 'recipe',
              id: doc.id,
              name: title,
              minutes: minutesOf(doc),
              servings: readTime(doc.get('servings')),
              dishes,
              favorite: isFavorite,
            },
          ];
        });
      }
      if (name === 'savedMeals') {
        const snapshot = await firestore
          .collection(kitchenPath(ctx.uid, 'meals'))
          .orderBy('updatedAt', 'desc')
          .select('name', 'isFavorite', 'updatedAt')
          .limit(SAVED_MEAL_LIMIT)
          .get();
        return snapshot.docs.flatMap((doc) => {
          const title = readText(doc.get('name'));
          const isFavorite = doc.get('isFavorite') === true;
          if (
            title === null ||
            (isFavoritesOnly && !isFavorite) ||
            !matchesText(text, title)
          ) {
            return [];
          }
          return [
            {
              kind: 'savedMeal',
              id: doc.id,
              name: title,
              favorite: isFavorite,
            },
          ];
        });
      }
      if (isFavoritesOnly) return [];
      const { records } = await syncIdeas(firestore, ctx.uid);
      return records
        .filter((record) => matchesText(text, record.title))
        .map((record) => ({
          kind: 'idea',
          id: record.sourceRef.replace(/^ideas\//, ''),
          name: record.title,
          detail: record.detail,
        }));
    }),
  );
  const all = found.flat();
  return toActionResult('search_recipes', ctx, {
    results: all.slice(0, ACTION_RESULT_LIMIT),
    ...(all.length > ACTION_RESULT_LIMIT && {
      note: `${all.length} matched; the first ${ACTION_RESULT_LIMIT} are shown. Narrow the query to see others.`,
    }),
  });
};

const GET_RECIPE_SHAPE = {
  recipeId: z
    .string()
    .min(1)
    .max(128)
    .describe(
      'A recipe id exactly as search_recipes or get_meal_plan returned it.',
    ),
};

const getRecipe = async (
  firestore: Firestore,
  ctx: ServerAppActionCtx,
  input: Record<string, unknown>,
): Promise<AppActionResult> => {
  if (!ctx.allowedCategories.has('recipes')) return switchedOff(['recipes']);
  const recipeId = typeof input.recipeId === 'string' ? input.recipeId : '';
  const notFound: AppActionResult = {
    status: 'notFound',
    message:
      'No recipe has that id. Use an id from search_recipes or get_meal_plan.',
  };
  if (recipeId === '' || recipeId.includes('/')) return notFound;
  const doc = await firestore
    .doc(`${kitchenPath(ctx.uid, 'recipes')}/${recipeId}`)
    .get();
  const title = readText(doc.get('title'));
  if (!doc.exists || title === null || doc.get('isArchived') === true) {
    return notFound;
  }
  const rows = doc.get('ingredients') as unknown;
  const lines = Array.isArray(rows) ? rows : [];
  const names = await readIngredientNames(
    firestore,
    ctx.uid,
    lines.flatMap((line) =>
      typeof line?.ingredientId === 'string' ? [line.ingredientId] : [],
    ),
  );
  const steps = readSteps(doc.get('steps'));
  const sections = doc.get('stepSections') as unknown;
  const sectionOf = (index: number) =>
    Array.isArray(sections) ? readText(sections[index]) : null;
  const hasSections = steps.some((_, index) => sectionOf(index) !== null);
  return toActionResult('get_recipe', ctx, {
    id: doc.id,
    name: title,
    version: readTime(doc.get('updatedAt')) ?? 0,
    servings: readTime(doc.get('servings')),
    prepMinutes: readTime(doc.get('prepMinutes')),
    cookMinutes: readTime(doc.get('cookMinutes')),
    dishes: dishLabels(doc.get('categories')),
    favorite: doc.get('isFavorite') === true,
    ...(ctx.allowedCategories.has('recipeIngredients') && {
      ingredients: groupIngredientLines(
        lines.flatMap((line) => toLineText(names, line)),
      ).map((group) => ({
        group: group.name,
        lines: group.lines.map((line) => line.text),
      })),
    }),
    ...(ctx.allowedCategories.has('fullRecipes') && {
      description: readText(doc.get('description')),
      steps: hasSections
        ? steps.map((step, index) => ({
            section: sectionOf(index),
            text: step,
          }))
        : steps,
    }),
  });
};

const getShoppingList = async (
  firestore: Firestore,
  ctx: ServerAppActionCtx,
): Promise<AppActionResult> => {
  if (!ctx.allowedCategories.has('shoppingList')) {
    return switchedOff(['shoppingList']);
  }
  const { records } = await syncShoppingList(firestore, ctx.uid);
  return toActionResult('get_shopping_list', ctx, {
    items: records.map((record) => ({
      name: record.title,
      amount: record.subtitle,
    })),
  });
};

const GET_KITCHEN_SHAPE = {
  query: z
    .string()
    .max(100)
    .optional()
    .describe(
      'Part of a food name to look for. Leave out to list what is on hand.',
    ),
};

const getKitchen = async (
  firestore: Firestore,
  ctx: ServerAppActionCtx,
  input: Record<string, unknown>,
): Promise<AppActionResult> => {
  const hasStock = ctx.allowedCategories.has('pantryStock');
  if (!hasStock && !ctx.allowedCategories.has('useSoon')) {
    return switchedOff(['pantryStock', 'useSoon']);
  }
  const text = readText(input.query)?.toLowerCase() ?? null;
  const { records } = hasStock
    ? await syncPantryStock(firestore, ctx.uid)
    : await syncUseSoon(firestore, ctx.uid, ctx.now);
  const items = records
    .filter((record) => matchesText(text, record.title))
    .map((record) => ({
      name: record.title,
      where: record.subtitle,
      ...(record.detail !== null && { detail: record.detail }),
      ...(record.dueAt !== null && { useBy: formatDay(record.dueAt) }),
    }));
  return toActionResult('get_kitchen', ctx, {
    scope: hasStock ? 'Everything on hand' : 'Only what is near its date',
    items: items.slice(0, KITCHEN_ITEM_LIMIT),
    ...(items.length > KITCHEN_ITEM_LIMIT && {
      note: `${items.length} matched; the first ${KITCHEN_ITEM_LIMIT} are shown.`,
    }),
  });
};

const findKitchenIngredients = async (
  firestore: Firestore,
  ctx: ServerAppActionCtx,
  input: Record<string, unknown>,
): Promise<AppActionResult> => {
  if (!ctx.allowedCategories.has('recipeIngredients')) {
    return switchedOff(['recipeIngredients']);
  }
  const found = await findIngredients(firestore, ctx.uid, input);
  return found.kind === 'refused'
    ? { status: 'refused', message: found.message }
    : toActionResult('find_ingredients', ctx, { results: found.value });
};

const toAppAction = (
  description: string,
  shape: z.ZodRawShape,
  run: ServerAppAction['run'],
): ServerAppAction => ({ description, shape, run });

const DEEP_LINKS: Record<string, string> = {
  recipes: '/pinch?tab=recipes',
  cooks: '/pinch?tab=recipes',
  meals: '/pinch?tab=recipes',
  ideas: '/pinch?tab=recipes',
  plannedMeals: '/pinch?tab=calendar',
  shoppingItems: '/pinch?tab=shopping',
  containers: '/pinch?tab=kitchen',
  packages: '/pinch?tab=kitchen',
};

export interface PinchAdapterDeps {
  firestore: () => Firestore;
  canOpen: (uid: string) => Promise<boolean>;
  now: () => number;
}

const defaultDeps: PinchAdapterDeps = {
  firestore: () => getFirestore(),
  canOpen: async (uid) => {
    const user = await getAuth().getUser(uid);
    return canOpenApp(getFirestore(), 'pinch', {
      uid,
      token: {
        email: user.email,
        admin: user.customClaims?.admin,
        dev: user.customClaims?.dev,
      },
    });
  },
  now: () => Date.now(),
};

export function createPinchAdapter(
  deps: PinchAdapterDeps = defaultDeps,
): SourceAdapter {
  const readCategory = (uid: string, req: SyncPageRequest) => {
    const firestore = deps.firestore();
    switch (req.category) {
      case 'plannedMeals':
        return syncPlannedMeals(firestore, uid, req.windowStart);
      case 'shoppingList':
        return syncShoppingList(firestore, uid);
      case 'useSoon':
        return syncUseSoon(firestore, uid, deps.now());
      case 'pantryStock':
        return syncPantryStock(firestore, uid);
      case 'recipes':
        return syncRecipes(firestore, uid);
      case 'savedMeals':
        return syncSavedMeals(firestore, uid);
      case 'ideas':
        return syncIdeas(firestore, uid);
      default:
        throw new Error('Unknown category.');
    }
  };

  return {
    manifest,
    status: async (ctx: SourceCtx) =>
      (await deps.canOpen(ctx.uid)) ? 'ok' : 'noAccess',
    syncPage: async (ctx, req): Promise<SyncPageResult> => ({
      ...(await readCategory(ctx.uid, req)),
      deletedRefs: [],
      cursor: null,
      isDone: true,
      resumeState: null,
    }),
    query: async (ctx, req: LiveQueryRequest): Promise<LiveQueryResult> => {
      const firestore = deps.firestore();
      const args = readLiveArgs(req.args);
      switch (req.category) {
        case 'recipeIngredients':
          return queryRecipeIngredients(firestore, ctx.uid, args);
        case 'fullRecipes':
          return queryFullRecipes(firestore, ctx.uid, args);
        case 'cooked':
          return queryCooked(firestore, ctx.uid, args);
        default:
          throw new Error('Unknown category.');
      }
    },
    actions: {
      get_meal_plan: toAppAction(
        "Returns the person's planned meals, day by day, each meal slot with its name and what is on the plate (recipeId is a Pinch recipe id for get_recipe). Days are in the person's own time zone; the default is the next seven days and at most 14 come back at a time.",
        MEAL_PLAN_SHAPE,
        (ctx, input) => getMealPlan(deps.firestore(), ctx, input),
      ),
      search_recipes: toAppAction(
        "Finds the person's recipes, saved meals and recipe ideas by name or kind of dish, up to 15, newest first, archived ones left out. Each result has an id: pass a recipe's id to get_recipe.",
        SEARCH_RECIPES_SHAPE,
        (ctx, input) => searchRecipes(deps.firestore(), ctx, input),
      ),
      get_recipe: toAppAction(
        'Opens one recipe: its version (pass it as basedOn to pinch_save (action update_recipe)), servings, times, kinds of dish, ingredients under their headings, and the description and steps when the person shares full recipes. heldBack names what a switched-off category kept out. recipeId comes from search_recipes or get_meal_plan.',
        GET_RECIPE_SHAPE,
        (ctx, input) => getRecipe(deps.firestore(), ctx, input),
      ),
      get_shopping_list: toAppAction(
        "Returns what is still to buy on the person's shopping list, each item with how much of it. Ticked items are left out.",
        {},
        (ctx) => getShoppingList(deps.firestore(), ctx),
      ),
      get_kitchen: toAppAction(
        'Returns the food the person has on hand in the pantry, fridge and freezer, where it is kept and the day to use it by; when only food near its date is shared, it lists just that.',
        GET_KITCHEN_SHAPE,
        (ctx, input) => getKitchen(deps.firestore(), ctx, input),
      ),
      find_ingredients: toAppAction(
        'Looks up which of a list of ingredient names the person\'s kitchen already has, up to 50 at a time. Each answer has asked, match (the kitchen\'s own name and whether it has nutrition, or null), noteWords (descriptor words such as lean or 93% to put in the recipe line\'s note, because the kitchen\'s ingredient is the plain one: "lean ground beef" is their "Ground beef" with "lean" in the note) and close (up to three near names when nothing matched). Call it before pinch_save (action add_recipe or update_recipe) and write each line with the kitchen\'s name.',
        FIND_INGREDIENTS_SHAPE,
        (ctx, input) => findKitchenIngredients(deps.firestore(), ctx, input),
      ),
      update_recipe: toAppAction(
        "Edits one of the person's recipes: send only what should change (title, servings, prepMinutes, cookMinutes, description, ingredients, steps). ingredients and steps replace the whole list, so read the recipe with pinch_read (action get_recipe) first, send every line you want kept and pass its version as basedOn (required with ingredients or steps; if the recipe changed in Pinch since you read it, nothing is written and you are told to read it again). recipeId comes from pinch_read (action search_recipes) or pinch_read (action get_meal_plan). It applies at once; it shows in the recipe's Changes in Pinch with an Undo, and in Helm. Confirm with the person what you will change before you call it.",
        UPDATE_RECIPE_SHAPE,
        (ctx, input) => updateRecipe(deps.firestore(), ctx, input),
      ),
      add_recipe: toAppAction(
        "Saves a new recipe in the person's Recipes: a title, and optionally servings, prepMinutes, cookMinutes, description, ingredients and steps, plus its categories (always send at least one) and any of the person's collections it fits (8 or more servings suits a Bulk-style collection). It applies at once and returns the new recipeId; Pinch and Helm show it with an Undo (which archives it). Confirm with the person what you will add before you call it.",
        ADD_RECIPE_SHAPE,
        (ctx, input) => addRecipe(deps.firestore(), ctx, input),
      ),
      plan_meal: toAppAction(
        "Plans a meal on a day and slot of the person's calendar: a date (YYYY-MM-DD, today or later), a mealType (breakfast, lunch, dinner, snack, dessert or drink), and either a recipeId from pinch_read (action search_recipes) or the name of a saved meal or recipe, with optional servings. It applies at once and shows in Pinch's calendar with an Undo, and in Helm. It never takes a meal off. Confirm the day and slot with the person before you call it.",
        PLAN_MEAL_SHAPE,
        (ctx, input) => planMeal(deps.firestore(), ctx, input),
      ),
      add_to_shopping_list: toAppAction(
        "Adds things to the person's shopping list: each with a name and optionally an amount, a unit and a short note about the ingredient (\"chopped\", a brand; never an amount). Something already on the list gains the amount and the note. It never ticks or removes anything. It applies at once and shows in Pinch's shopping list and Done for you with an Undo, and in Helm. Confirm what you will add before you call it.",
        ADD_TO_SHOPPING_LIST_SHAPE,
        (ctx, input) => addToShoppingList(deps.firestore(), ctx, input),
      ),
      save_idea: toAppAction(
        "Saves a recipe idea in the person's Ideas to try later: a title, and optionally a link (http:// or https:// only) and a note. It never changes or removes an idea, and it says so when the same link or title is already saved. It applies at once and shows in Pinch's Ideas and Done for you with an Undo, and in Helm. Confirm what you will save before you call it.",
        SAVE_IDEA_SHAPE,
        (ctx, input) => saveIdea(deps.firestore(), ctx, input),
      ),
      fill_nutrition: toAppAction(
        "Fills in nutrition per 100 g (calories, protein, carbs, fat) for ingredients in the person's kitchen that have none yet, up to 30 at a time, each named as pinch_read (action find_ingredients) gave it (hasNutrition false). It never creates an ingredient and never changes nutrition that is already there: those are skipped and named. It applies at once, shows in Pinch's ingredient with its source and in Done for you with an Undo, and in Helm. Only send values from a source you trust, and confirm with the person before you call it. It needs Recipe ingredients on, since it matches names to the kitchen.",
        FILL_NUTRITION_SHAPE,
        (ctx, input) =>
          ctx.allowedCategories.has('recipeIngredients')
            ? fillNutrition(deps.firestore(), ctx, input)
            : Promise.resolve(switchedOff(['recipeIngredients'])),
      ),
    },
    undoChange: (firestore, uid, changeId, from) =>
      undoPinchOutsideChange(firestore, uid, changeId, from),
    deepLink: (ref) => {
      const [collection] = ref.split('/');
      return Object.hasOwn(DEEP_LINKS, collection)
        ? DEEP_LINKS[collection]
        : '/pinch';
    },
  };
}

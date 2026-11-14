import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { canOpenApp } from '../../../appAccess.js';
import type {
  SourceAdapter,
  SourceCtx,
  SyncPageRequest,
  SyncPageResult,
} from '../../../connections/registry.js';
import {
  SHARED_RECORD_KEYS,
  type SharedRecord,
} from '../../../vendor/connectionsContract.js';
import {
  dayToUtcMidnight,
  getDigestBounds,
  getLocalMoment,
  readReminders,
} from '../eatSoonDigest.js';
import { CATALOG_NAMES } from './catalogNames.js';
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
const PLATE_NAMES_SHOWN = 3;
const DETAIL_LIMIT = 200;

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

const clip = (text: string | null) =>
  text === null ? null : text.slice(0, DETAIL_LIMIT);

const MEAL_TYPE_WORDS: Record<string, string> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
  SNACK: 'Snack',
  DESSERT: 'Dessert',
  DRINK: 'Drink',
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
      ingredientId === null ? null : (names.get(ingredientId) ?? null);
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
      detail: joinLines([
        amount,
        day === null ? null : `${dateLabel} ${formatDay(day)}`,
      ]),
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

const describePlate = (names: string[], more: number) => {
  if (names.length === 0) return null;
  if (more > 0) return `${names.join(', ')} and ${more} more`;
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
    .select('name', 'items', 'updatedAt')
    .limit(SAVED_MEAL_LIMIT)
    .get();
  const meals = snapshot.docs.map((doc) => ({
    id: doc.id,
    name: readText(doc.get('name')),
    items: readItems(doc.get('items')),
    updatedAt: readTime(doc.get('updatedAt')),
  }));
  const shown = meals.flatMap((meal) => meal.items.slice(0, PLATE_NAMES_SHOWN));
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
    const names = meal.items.slice(0, PLATE_NAMES_SHOWN).flatMap((item) => {
      const name = (
        item.kind === 'RECIPE' ? recipeTitles : ingredientNames
      ).get(item.refId);
      return name === null || name === undefined ? [] : [name];
    });
    return [
      toRecord({
        sourceRef: `meals/${meal.id}`,
        kind: 'artifact',
        title: meal.name,
        detail: clip(
          describePlate(names, meal.items.length - PLATE_NAMES_SHOWN),
        ),
        sourceUpdatedAt: meal.updatedAt,
      }),
    ];
  });
  return { records, isFull: snapshot.size < SAVED_MEAL_LIMIT };
}

const DEEP_LINKS: Record<string, string> = {
  recipes: '/pinch?tab=recipes',
  meals: '/pinch?tab=recipes',
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
    deepLink: (ref) => {
      const [collection] = ref.split('/');
      return Object.hasOwn(DEEP_LINKS, collection)
        ? DEEP_LINKS[collection]
        : '/pinch';
    },
  };
}

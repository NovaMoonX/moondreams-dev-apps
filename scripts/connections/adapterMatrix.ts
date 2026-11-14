// Run against the Firestore emulator: `npm run check:adapters`.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { getApps, initializeApp } from 'firebase-admin/app';
import {
  DocumentReference,
  Firestore,
  Query,
  getFirestore,
} from 'firebase-admin/firestore';

import { createAListAdapter } from '../../functions/src/apps/a-list/share/adapter.ts';
import { gcmEncrypt } from '../../functions/src/appKeys/gcm.ts';
import { createGoingOnceAdapter } from '../../functions/src/apps/going-once/share/adapter.ts';
import { createNineLivesAdapter } from '../../functions/src/apps/nine-lives/share/adapter.ts';
import { createPinchAdapter } from '../../functions/src/apps/pinch/share/adapter.ts';
import { createRunwayAdapter } from '../../functions/src/apps/runway/share/adapter.ts';
import {
  DEV_KEYRING,
  deriveSeedDataKey,
  sealWithKey,
  wrapDataKey,
} from '../../functions/src/apps/runway/planKey.ts';
import { createWaypointAdapter } from '../../functions/src/apps/waypoint/share/adapter.ts';
import { createWorthTheWaitAdapter } from '../../functions/src/apps/worth-the-wait/share/adapter.ts';
import {
  createGoogleContactsAdapter,
  isContactRef,
  isGooglePhotoUrl,
  listContacts,
  readContacts,
  toContactOption,
} from '../../functions/src/connections/google/contacts.ts';
import { querySiteLive } from '../../functions/src/connections/liveRouter.ts';
import {
  applyCategoryChanges,
  buildNewGrant,
  readGrant,
} from '../../functions/src/connections/grants.ts';
import {
  EXTRA_KEYS,
  SHARED_RECORD_KEYS,
  type SharedRecord,
} from '../../functions/src/vendor/connectionsContract.ts';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
if (getApps().length === 0) initializeApp({ projectId: 'demo-adapters' });
const firestore = getFirestore();

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 10, 15);
const TODAY = Date.UTC(2026, 10, 10);
const WINDOW_START = TODAY - 30 * DAY;

const OWNER = 'owner-uid';
const OTHER = 'other-uid';
const SECRET_NOTE = 'SECRET NOTE';
const SECRET_PRICE = 4242;

const kitchen = (uid: string, path: string) =>
  firestore.doc(`apps/pinch/kitchens/${uid}/${path}`);

const priced = {
  priceCents: SECRET_PRICE,
  costCents: 777,
  note: SECRET_NOTE,
  nutrition: { calories: 999 },
};

const seedOwner = () =>
  Promise.all([
    kitchen(OWNER, 'recipes/r1').set({
      title: 'Lemon Pasta',
      steps: ['secret recipe text'],
      description: 'SECRET description',
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 20,
      categories: ['MAIN', 'SIDE', 'BOGUS'],
      isArchived: false,
      ingredients: [{ note: SECRET_NOTE }],
      updatedAt: NOW - 3,
      ...priced,
    }),
    kitchen(OWNER, 'recipes/r-old').set({
      title: 'Plain Toast',
      servings: 1,
      prepMinutes: null,
      cookMinutes: null,
      updatedAt: NOW - 30,
    }),
    kitchen(OWNER, 'recipes/r-archived').set({
      title: 'Archived Stew',
      isArchived: true,
      updatedAt: NOW - 4,
    }),
    kitchen(OWNER, 'recipes/r-untitled').set({
      isArchived: false,
      updatedAt: NOW - 5,
    }),
    kitchen(OWNER, 'meals/m1').set({
      name: 'Pasta night',
      items: [
        { id: 'a', kind: 'RECIPE', refId: 'r1', servings: 2 },
        { id: 'b', kind: 'INGREDIENT', refId: 'cat-salmon', servings: 1 },
        { id: 'c', kind: 'INGREDIENT', refId: 'gone-ingredient', servings: 1 },
      ],
      updatedAt: NOW - 8,
      ...priced,
    }),
    kitchen(OWNER, 'meals/m-long').set({
      name: 'Big spread',
      items: [
        { id: 'a', kind: 'RECIPE', refId: 'r1', servings: 2 },
        { id: 'b', kind: 'INGREDIENT', refId: 'cat-salmon', servings: 1 },
        { id: 'c', kind: 'INGREDIENT', refId: 'cat-bacon', servings: 1 },
        { id: 'd', kind: 'INGREDIENT', refId: 'custom1', servings: 1 },
        { id: 'e', kind: 'INGREDIENT', refId: 'custom1', servings: 1 },
      ],
      updatedAt: NOW - 9,
    }),
    kitchen(OWNER, 'meals/m-empty').set({
      name: 'Empty plate',
      items: [],
      updatedAt: NOW - 10,
    }),
    kitchen(OWNER, 'meals/m-nameless').set({
      items: [],
      updatedAt: NOW - 11,
    }),
    kitchen(OWNER, 'ingredients/custom1').set({
      name: 'Saffron',
      catalogId: null,
      ...priced,
    }),
    kitchen(OWNER, 'ingredients/cat-bacon').set({
      name: 'Smoky bacon',
      catalogId: 'cat-bacon',
    }),
    kitchen(OWNER, 'plannedMeals/pm-near').set({
      date: TODAY + DAY,
      mealType: 'DINNER',
      name: null,
      items: [
        { id: 'a', kind: 'RECIPE', refId: 'r1', servings: 2 },
        { id: 'b', kind: 'INGREDIENT', refId: 'cat-salmon', servings: 1 },
        { id: 'c', kind: 'INGREDIENT', refId: 'cat-bacon', servings: 1 },
      ],
      snapshot: { recipes: { r1: { title: 'Lemon Pasta', ...priced } } },
      updatedAt: NOW - 5,
      ...priced,
    }),
    kitchen(OWNER, 'plannedMeals/pm-named').set({
      date: TODAY,
      mealType: 'LUNCH',
      name: 'Taco night',
      items: [],
      updatedAt: NOW - 6,
    }),
    kitchen(OWNER, 'plannedMeals/pm-old').set({
      date: TODAY - 60 * DAY,
      mealType: 'DINNER',
      name: 'Old',
      items: [],
    }),
    kitchen(OWNER, 'plannedMeals/pm-legacy').set({
      date: TODAY + 2 * DAY,
      name: 'Legacy supper',
    }),
    kitchen(OWNER, 'shoppingItems/s1').set({
      ingredientId: 'cat-salmon',
      amount: 2,
      unit: 'LB',
      isChecked: false,
      updatedAt: NOW - 1,
      ...priced,
    }),
    kitchen(OWNER, 'shoppingItems/s2').set({
      ingredientId: 'cat-salmon',
      amount: 1,
      unit: 'KG',
      isChecked: true,
    }),
    kitchen(OWNER, 'shoppingItems/s3').set({
      ingredientId: 'custom1',
      amount: null,
      unit: 'EACH',
      isChecked: false,
    }),
    kitchen(OWNER, 'shoppingItems/s4').set({
      ingredientId: 'gone-ingredient',
      amount: 1,
      unit: 'G',
      isChecked: false,
    }),
    kitchen(OWNER, 'shoppingItems/s5').set({
      ingredientId: 'cat-salmon',
      amount: 3,
      unit: 'G',
    }),
    kitchen(OWNER, 'containers/c-near').set({
      title: 'Chili',
      status: 'IN_STOCK',
      place: 'FRIDGE',
      eatBy: TODAY + DAY,
      history: [{ note: SECRET_NOTE }],
      updatedAt: NOW - 2,
    }),
    kitchen(OWNER, 'containers/c-yesterday').set({
      title: 'Soup',
      status: 'IN_STOCK',
      place: 'FREEZER',
      eatBy: TODAY - DAY,
      servings: 4,
    }),
    kitchen(OWNER, 'containers/c-old').set({
      title: 'Ancient stew',
      status: 'IN_STOCK',
      place: 'FRIDGE',
      eatBy: TODAY - 2 * DAY,
    }),
    kitchen(OWNER, 'containers/c-far').set({
      title: 'Far curry',
      status: 'IN_STOCK',
      place: 'FRIDGE',
      eatBy: TODAY + 10 * DAY,
      servings: 1,
    }),
    kitchen(OWNER, 'containers/c-done').set({
      title: 'Eaten rice',
      status: 'DONE',
      place: 'FRIDGE',
      eatBy: TODAY,
    }),
    kitchen(OWNER, 'containers/c-noplace').set({
      title: 'Mystery box',
      status: 'IN_STOCK',
      eatBy: TODAY,
    }),
    kitchen(OWNER, 'packages/p-near').set({
      ingredientName: 'Milk',
      status: 'IN_STOCK',
      place: 'PANTRY',
      expiresAt: TODAY,
      amount: 1,
      unit: 'L',
      ...priced,
    }),
    kitchen(OWNER, 'packages/p-far').set({
      ingredientName: 'Rice',
      status: 'IN_STOCK',
      place: 'PANTRY',
      expiresAt: TODAY + 90 * DAY,
      amount: 2.5,
      unit: 'KG',
      history: [{ note: SECRET_NOTE }],
      ...priced,
    }),
    kitchen(OWNER, 'packages/p-nodate').set({
      ingredientName: 'Salt',
      status: 'IN_STOCK',
      place: 'PANTRY',
      expiresAt: null,
    }),
    kitchen(OWNER, 'packages/p-done').set({
      ingredientName: 'Flour',
      status: 'DONE',
      place: 'PANTRY',
      expiresAt: TODAY,
    }),
    kitchen(OWNER, 'packages/p-noname').set({
      status: 'IN_STOCK',
      place: 'PANTRY',
      expiresAt: TODAY,
    }),
  ]);

const seedOther = () =>
  Promise.all([
    kitchen(OTHER, 'plannedMeals/pm-near').set({
      date: TODAY + DAY,
      mealType: 'DINNER',
      name: 'OTHER dinner',
      items: [],
    }),
    kitchen(OTHER, 'plannedMeals/o-only').set({
      date: TODAY + DAY,
      mealType: 'DINNER',
      name: 'OTHER only',
      items: [],
    }),
    kitchen(OTHER, 'shoppingItems/s1').set({
      ingredientId: 'cat-salmon',
      amount: 9,
      unit: 'LB',
      isChecked: false,
    }),
    kitchen(OTHER, 'shoppingItems/o-only').set({
      ingredientId: 'cat-cod',
      amount: 1,
      unit: 'LB',
      isChecked: false,
    }),
    kitchen(OTHER, 'recipes/o-recipe').set({
      title: 'OTHER recipe',
      updatedAt: NOW,
    }),
    kitchen(OTHER, 'meals/o-meal').set({
      name: 'OTHER saved',
      items: [],
      updatedAt: NOW,
    }),
    kitchen(OTHER, 'containers/c-near').set({
      title: 'OTHER chili',
      status: 'IN_STOCK',
      place: 'FRIDGE',
      eatBy: TODAY,
    }),
    kitchen(OTHER, 'packages/o-only').set({
      ingredientName: 'OTHER milk',
      status: 'IN_STOCK',
      place: 'FRIDGE',
      expiresAt: TODAY,
    }),
  ]);

const adapter = createPinchAdapter({
  firestore: () => firestore,
  canOpen: async (uid) => uid === OWNER,
  now: () => NOW,
});

const ctxFor = (uid: string) => ({
  uid,
  accountId: 'site',
  grant: buildNewGrant(
    {
      readerAppId: 'helm',
      connectorId: 'app:pinch',
      accountId: 'site',
      categoryIds: [
        'plannedMeals',
        'shoppingList',
        'useSoon',
        'pantryStock',
        'recipes',
        'savedMeals',
      ],
      options: null,
    },
    adapter.manifest,
    NOW,
  ),
});

const run = async (uid: string, category: string) => {
  const page = await adapter.syncPage(ctxFor(uid), {
    category,
    cursor: null,
    resumeState: null,
    windowStart: WINDOW_START,
  });
  assert.equal(page.isFull, true);
  assert.equal(page.isDone, true);
  assert.equal(page.cursor, null);
  assert.deepEqual(page.deletedRefs, []);
  return page.records;
};

const refs = (records: SharedRecord[]) =>
  records.map((record) => record.sourceRef).sort();
const titles = (records: SharedRecord[]) =>
  records.map((record) => record.title).sort();

const assertShape = (records: SharedRecord[]) =>
  records.forEach((record) => {
    assert.deepEqual(
      Object.keys(record).sort(),
      [...SHARED_RECORD_KEYS].sort(),
      record.sourceRef,
    );
    Object.keys(record.extra).forEach((key) =>
      assert.ok(
        EXTRA_KEYS[record.kind].includes(key),
        `${record.sourceRef} extra ${key}`,
      ),
    );
  });

const flatten = (value: unknown): unknown[] =>
  typeof value === 'object' && value !== null
    ? Object.values(value).flatMap(flatten)
    : [value];

await Promise.all([seedOwner(), seedOther()]);

const meals = await run(OWNER, 'plannedMeals');
assert.deepEqual(refs(meals), [
  'plannedMeals/pm-legacy',
  'plannedMeals/pm-named',
  'plannedMeals/pm-near',
]);
const near = meals.find((meal) => meal.sourceRef === 'plannedMeals/pm-near');
assert.equal(near?.title, 'Lemon Pasta, Salmon, Smoky bacon');
assert.equal(near?.subtitle, 'Dinner');
assert.equal(near?.kind, 'event');
assert.equal(near?.startAt, TODAY + DAY);
assert.equal(near?.isAllDay, true);
assert.equal(near?.timeZone, null);
assert.equal(near?.sourceUpdatedAt, NOW - 5);
assert.equal(
  meals.find((meal) => meal.title === 'Taco night')?.subtitle,
  'Lunch',
);
assert.equal(
  meals.find((meal) => meal.title === 'Legacy supper')?.subtitle,
  null,
);

const lines = await run(OWNER, 'shoppingList');
assert.deepEqual(refs(lines), ['shoppingItems/s1', 'shoppingItems/s3']);
assert.equal(
  lines.find((line) => line.sourceRef === 'shoppingItems/s1')?.title,
  'Salmon',
);
assert.equal(
  lines.find((line) => line.sourceRef === 'shoppingItems/s1')?.subtitle,
  '2 lb',
);
assert.equal(
  lines.find((line) => line.sourceRef === 'shoppingItems/s3')?.title,
  'Saffron',
);
assert.equal(
  lines.find((line) => line.sourceRef === 'shoppingItems/s3')?.subtitle,
  null,
);
assert.ok(lines.every((line) => line.kind === 'task'));

const soon = await run(OWNER, 'useSoon');
assert.deepEqual(refs(soon), [
  'containers/c-near',
  'containers/c-noplace',
  'containers/c-yesterday',
  'packages/p-near',
]);
assert.equal(
  soon.find((entry) => entry.sourceRef === 'containers/c-near')?.subtitle,
  'Fridge',
);
assert.equal(
  soon.find((entry) => entry.sourceRef === 'containers/c-yesterday')?.subtitle,
  'Freezer',
);
assert.equal(
  soon.find((entry) => entry.sourceRef === 'containers/c-noplace')?.subtitle,
  null,
);
assert.equal(
  soon.find((entry) => entry.sourceRef === 'packages/p-near')?.title,
  'Milk',
);
assert.equal(
  soon.find((entry) => entry.sourceRef === 'packages/p-near')?.dueAt,
  TODAY,
);
assert.ok(soon.every((entry) => entry.kind === 'task'));

assert.ok(
  meals.every((meal) => meal.kind === 'event'),
  'a category not asked for adds nothing to another',
);
await assert.rejects(() => run(OWNER, 'nothing'), /Unknown category/);

const stock = await run(OWNER, 'pantryStock');
assert.deepEqual(refs(stock), [
  'containers/c-far',
  'containers/c-near',
  'containers/c-noplace',
  'containers/c-old',
  'containers/c-yesterday',
  'packages/p-far',
  'packages/p-near',
  'packages/p-nodate',
]);
const stockOf = (ref: string) => stock.find((entry) => entry.sourceRef === ref);
assert.ok(stock.every((entry) => entry.kind === 'artifact'));
assert.ok(
  stock.every((entry) => entry.dueAt === null && entry.startAt === null),
);
assert.equal(stockOf('packages/p-far')?.subtitle, 'Pantry');
assert.equal(stockOf('packages/p-far')?.detail, '2.5 kg · use by Feb 8, 2027');
assert.equal(stockOf('packages/p-near')?.detail, '1 l · use by Nov 10, 2026');
assert.equal(stockOf('packages/p-nodate')?.detail, null);
assert.equal(stockOf('containers/c-yesterday')?.subtitle, 'Freezer');
assert.equal(
  stockOf('containers/c-yesterday')?.detail,
  '4 servings · eat by Nov 9, 2026',
);
assert.equal(
  stockOf('containers/c-far')?.detail,
  '1 serving · eat by Nov 20, 2026',
);
assert.equal(stockOf('containers/c-noplace')?.subtitle, null);
assert.equal(stockOf('containers/c-near')?.sourceUpdatedAt, NOW - 2);

const recipes = await run(OWNER, 'recipes');
assert.deepEqual(refs(recipes), ['recipes/r-old', 'recipes/r1']);
assert.ok(recipes.every((entry) => entry.kind === 'artifact'));
assert.equal(
  recipes.find((entry) => entry.sourceRef === 'recipes/r1')?.detail,
  'Main dishes, Sides · serves 4 · 30 min',
);
assert.equal(
  recipes.find((entry) => entry.sourceRef === 'recipes/r1')?.sourceUpdatedAt,
  NOW - 3,
);
assert.equal(
  recipes.find((entry) => entry.sourceRef === 'recipes/r-old')?.detail,
  'serves 1',
);

const saved = await run(OWNER, 'savedMeals');
assert.deepEqual(refs(saved), ['meals/m-empty', 'meals/m-long', 'meals/m1']);
assert.ok(saved.every((entry) => entry.kind === 'artifact'));
const savedOf = (ref: string) => saved.find((entry) => entry.sourceRef === ref);
assert.equal(savedOf('meals/m1')?.title, 'Pasta night');
assert.equal(savedOf('meals/m1')?.detail, 'Lemon Pasta and Salmon');
assert.equal(
  savedOf('meals/m-long')?.detail,
  'Lemon Pasta, Salmon, Smoky bacon and 2 more',
);
assert.equal(savedOf('meals/m-empty')?.detail, null);

const all = [...meals, ...lines, ...soon, ...stock, ...recipes, ...saved];
assertShape(all);
all.forEach((record) => {
  const values = flatten(record);
  assert.ok(
    !values.includes(SECRET_PRICE) &&
      !values.includes(777) &&
      !values.includes(999) &&
      !values.includes(SECRET_PRICE / 100),
    record.sourceRef,
  );
  assert.ok(
    !values.some(
      (value) => typeof value === 'string' && /SECRET|secret/.test(value),
    ),
    record.sourceRef,
  );
});

const otherMeals = await run(OTHER, 'plannedMeals');
const otherLines = await run(OTHER, 'shoppingList');
const otherSoon = await run(OTHER, 'useSoon');
const otherStock = await run(OTHER, 'pantryStock');
const otherRecipes = await run(OTHER, 'recipes');
const otherSaved = await run(OTHER, 'savedMeals');
assert.deepEqual(titles(otherStock), ['OTHER chili', 'OTHER milk']);
assert.deepEqual(titles(otherRecipes), ['OTHER recipe']);
assert.deepEqual(titles(otherSaved), ['OTHER saved']);
assert.deepEqual(await run('empty-uid', 'pantryStock'), []);
assert.deepEqual(await run('empty-uid', 'recipes'), []);
assert.deepEqual(await run('empty-uid', 'savedMeals'), []);
assert.deepEqual(titles(otherMeals), ['OTHER dinner', 'OTHER only']);
assert.deepEqual(refs(otherLines), [
  'shoppingItems/o-only',
  'shoppingItems/s1',
]);
assert.equal(
  otherLines.find((line) => line.sourceRef === 'shoppingItems/s1')?.subtitle,
  '9 lb',
);
assert.deepEqual(titles(otherSoon), ['OTHER chili', 'OTHER milk']);
assertShape([...otherMeals, ...otherLines, ...otherSoon]);
assert.ok(
  all.every((record) => !record.title.includes('OTHER')),
  "the owner's run holds none of the other kitchen",
);
assert.ok(
  [...otherMeals, ...otherLines, ...otherSoon].every(
    (record) => !/Lemon|Taco|Chili|Milk$/.test(record.title),
  ),
  "the other run holds none of the owner's kitchen",
);

const nobody = await run('empty-uid', 'plannedMeals');
assert.deepEqual(nobody, []);

assert.equal(await adapter.status(ctxFor(OWNER)), 'ok');
assert.equal(await adapter.status(ctxFor(OTHER)), 'noAccess');
assert.equal(
  adapter.deepLink('plannedMeals/x', ctxFor(OWNER)),
  '/pinch?tab=calendar',
);
assert.equal(
  adapter.deepLink('shoppingItems/x', ctxFor(OWNER)),
  '/pinch?tab=shopping',
);
assert.equal(
  adapter.deepLink('containers/x', ctxFor(OWNER)),
  '/pinch?tab=kitchen',
);
assert.equal(adapter.deepLink('???', ctxFor(OWNER)), '/pinch');

const grant = ctxFor(OWNER).grant;
assert.deepEqual(
  Object.fromEntries(
    Object.entries(grant.categories).map(([id, entry]) => [id, entry.isOn]),
  ),
  {
    plannedMeals: true,
    shoppingList: true,
    useSoon: true,
    pantryStock: true,
    recipes: true,
    savedMeals: true,
  },
);
const staged = buildNewGrant(
  {
    readerAppId: 'helm',
    connectorId: 'app:pinch',
    accountId: 'site',
    categoryIds: ['shoppingList'],
    options: null,
  },
  adapter.manifest,
  NOW,
);
assert.deepEqual(Object.keys(staged.categories).sort(), [
  'pantryStock',
  'plannedMeals',
  'recipes',
  'savedMeals',
  'shoppingList',
  'useSoon',
]);
assert.equal(staged.categories.plannedMeals.isOn, false);
assert.equal(staged.status, 'live');
assert.throws(
  () =>
    applyCategoryChanges(staged, { nothing: true }, adapter.manifest, NOW + 1),
  /doesn't share/,
);
const changed = applyCategoryChanges(
  staged,
  { useSoon: true, shoppingList: true },
  adapter.manifest,
  NOW + 1,
);
assert.equal(changed.useSoon.isOn, true);
assert.equal(changed.useSoon.changedAt, NOW + 1);
assert.equal(
  changed.shoppingList.changedAt,
  NOW,
  'a switch already in the asked state keeps its time',
);
assert.deepEqual(readGrant({ status: 'live' }).categories, {});
assert.equal(readGrant({}).status, 'ended');
assert.deepEqual(readGrant(JSON.parse(JSON.stringify(staged))), staged);

const membership = (uid: string, path = '') =>
  firestore.doc(
    `apps/a-list/memberships/${uid}${path === '' ? '' : `/${path}`}`,
  );

const showing = (
  status: string,
  title: string,
  showtimeAt: number,
  extra: Record<string, unknown> = {},
) => ({
  movieKey: 'tmdb-1',
  movie: { title, runtimeMinutes: 120, posterUrl: null },
  showtimeAt,
  endsAt: showtimeAt + 3 * 3_600_000,
  status,
  theatre: {
    theatreId: '2078',
    name: 'AMC Town Center 20',
    city: 'Leawood',
    state: 'KS',
    timeZone: 'America/Chicago',
  },
  ticket: {
    entryMode: 'ITEMIZED',
    priceCents: SECRET_PRICE,
    totalCents: 777,
    feeAvoidedCents: 999,
  },
  purchase: { url: 'https://example.com/SECRET-buy' },
  rating: null,
  lastEditedAt: NOW - 7,
  ...extra,
});

await Promise.all([
  membership(OWNER, 'viewings/v-next').set(
    showing('PLANNED', 'Starlight Harbor', NOW + DAY),
  ),
  membership(OWNER, 'viewings/v-notheatre').set(
    showing('PLANNED', 'Galaxy Drift', NOW + 2 * DAY, {
      theatre: null,
      ticket: null,
    }),
  ),
  membership(OWNER, 'viewings/v-old').set(
    showing('PLANNED', 'Ancient Showing', NOW - 60 * DAY),
  ),
  membership(OWNER, 'viewings/v-seen').set(
    showing('SEEN', 'Dune', NOW - 3 * DAY, { rating: 4.5 }),
  ),
  membership(OWNER, 'viewings/v-seen-unrated').set(
    showing('SEEN', 'The Matrix', NOW - 4 * DAY),
  ),
  membership(OWNER, 'watchlist/tmdb-10').set({
    movieKey: 'tmdb-10',
    movie: { title: 'Moon Garden', releaseDate: Date.UTC(2026, 11, 18) },
    priority: 'MUST_SEE',
    archivedAt: null,
    lastEditedAt: NOW - 3,
  }),
  membership(OWNER, 'watchlist/tmdb-11').set({
    movieKey: 'tmdb-11',
    movie: { title: 'Undated Tale', releaseDate: null },
    priority: 'IF_I_HAVE_TIME',
    lastEditedAt: NOW - 3,
  }),
  membership(OWNER, 'watchlist/tmdb-12').set({
    movieKey: 'tmdb-12',
    movie: { title: 'Put Away', releaseDate: null },
    priority: 'WANT_TO_SEE',
    archivedAt: NOW - DAY,
    lastEditedAt: NOW - 3,
  }),
  membership(OWNER, 'watchlist/tmdb-1').set({
    movieKey: 'tmdb-1',
    movie: { title: 'Dune', releaseDate: null },
    priority: 'WANT_TO_SEE',
    archivedAt: null,
    lastEditedAt: NOW - 3,
  }),
  membership(OWNER).set({
    weeklyGoal: 2,
    monthlyGoal: 5,
    monthlyCostCents: SECRET_PRICE,
    lastEditedAt: NOW - 2,
  }),
  membership(OWNER, 'theatres/2078').set({
    theatreId: '2078',
    name: 'AMC Town Center 20',
    addressLine: '4701 Town Center Dr',
    city: 'Leawood',
    state: 'KS',
    postalCode: '66211',
    latitude: 38.9,
    longitude: -94.6,
    timeZone: 'America/Chicago',
    lastEditedAt: NOW - 9,
  }),
  membership(OWNER, 'theatres/manual-1').set({
    theatreId: 'manual-1',
    name: 'Southlake Cinema',
    addressLine: null,
    city: null,
    state: null,
    postalCode: null,
    timeZone: null,
    lastEditedAt: NOW - 10,
  }),
]);

const aListAdapter = createAListAdapter({
  firestore: () => firestore,
  now: () => NOW,
  canOpen: async (uid) => uid === OWNER,
});

const aListCtx = (uid: string) => ({
  uid,
  accountId: 'site',
  grant: buildNewGrant(
    {
      readerAppId: 'helm',
      connectorId: 'app:a-list',
      accountId: 'site',
      categoryIds: [
        'plannedShowings',
        'savedTheaters',
        'seenMovies',
        'watchlist',
      ],
      options: null,
    },
    aListAdapter.manifest,
    NOW,
  ),
});

const runAList = async (uid: string, category: string) => {
  const page = await aListAdapter.syncPage(aListCtx(uid), {
    category,
    cursor: null,
    resumeState: null,
    windowStart: WINDOW_START,
  });
  assert.equal(page.isFull, true);
  assert.equal(page.isDone, true);
  return page.records;
};

const showings = await runAList(OWNER, 'plannedShowings');
assert.deepEqual(refs(showings), ['viewings/v-next', 'viewings/v-notheatre']);
const nextShowing = showings.find(
  (entry) => entry.sourceRef === 'viewings/v-next',
);
assert.equal(nextShowing?.kind, 'event');
assert.equal(nextShowing?.title, 'Starlight Harbor');
assert.equal(nextShowing?.startAt, NOW + DAY);
assert.equal(nextShowing?.endAt, NOW + DAY + 3 * 3_600_000);
assert.equal(nextShowing?.placeLabel, 'AMC Town Center 20');
assert.equal(nextShowing?.timeZone, 'America/Chicago');
assert.deepEqual(nextShowing?.extra, { hasTicket: true });
assert.deepEqual(
  showings.find((entry) => entry.sourceRef === 'viewings/v-notheatre')?.extra,
  { hasTicket: false },
);
assert.equal(
  showings.find((entry) => entry.sourceRef === 'viewings/v-notheatre')
    ?.placeLabel,
  null,
);

const theaters = await runAList(OWNER, 'savedTheaters');
assert.deepEqual(refs(theaters), ['theatres/2078', 'theatres/manual-1']);
assert.ok(theaters.every((entry) => entry.kind === 'place'));
assert.deepEqual(
  theaters.find((entry) => entry.sourceRef === 'theatres/2078')?.extra,
  { address: '4701 Town Center Dr, Leawood, KS 66211' },
);
assert.deepEqual(
  theaters.find((entry) => entry.sourceRef === 'theatres/manual-1')?.extra,
  { address: null },
);

const seen = await runAList(OWNER, 'seenMovies');
assert.deepEqual(refs(seen), ['goals', 'viewings/v-seen']);
assert.ok(seen.every((entry) => entry.kind === 'knowledge'));
assert.equal(seen[0].title, 'Movie goals');
assert.equal(
  seen[0].detail,
  'Weekly goal 2, 2 seen this week · Monthly goal 5, 2 seen this month',
);
assert.deepEqual(seen[0].extra, {});
assert.equal(seen[1].title, 'Dune');
assert.equal(seen[1].startAt, null);
assert.match(seen[1].detail ?? '', /^Seen [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
assert.deepEqual(seen[1].extra, { rating: 4.5 });

const watchlist = await runAList(OWNER, 'watchlist');
assert.deepEqual(refs(watchlist).sort(), [
  'watchlist/tmdb-10',
  'watchlist/tmdb-11',
]);
assert.ok(watchlist.every((entry) => entry.kind === 'artifact'));
const moonGarden = watchlist.find((entry) => entry.title === 'Moon Garden');
assert.equal(moonGarden?.startAt, null);
assert.equal(moonGarden?.detail, 'Out Dec 18, 2026');
assert.deepEqual(moonGarden?.extra, { status: 'Must see' });
assert.equal(
  watchlist.find((entry) => entry.title === 'Undated Tale')?.detail,
  null,
);
await assert.rejects(() => runAList(OWNER, 'nothing'), /Unknown category/);

const aListAll = [...showings, ...theaters, ...seen, ...watchlist];
assertShape(aListAll);
aListAll.forEach((record) => {
  const values = flatten(record);
  assert.ok(
    !values.includes(SECRET_PRICE) &&
      !values.includes(777) &&
      !values.includes(999) &&
      !values.includes(38.9),
    record.sourceRef,
  );
  assert.ok(
    !values.some(
      (value) =>
        typeof value === 'string' && /SECRET|secret|1234|https:/.test(value),
    ),
    record.sourceRef,
  );
});

const otherAList = await Promise.all(
  ['plannedShowings', 'savedTheaters', 'seenMovies', 'watchlist'].map(
    (category) => runAList(OTHER, category),
  ),
);
assert.deepEqual(otherAList, [[], [], [], []]);
assert.equal(await aListAdapter.status(aListCtx(OWNER)), 'ok');
assert.equal(await aListAdapter.status(aListCtx(OTHER)), 'noAccess');
assert.equal(
  aListAdapter.deepLink('viewings/v-next', aListCtx(OWNER)),
  '/a-list?viewing=v-next',
);
assert.equal(
  aListAdapter.deepLink('theatres/2078', aListCtx(OWNER)),
  '/a-list',
);
assert.equal(aListAdapter.deepLink('???', aListCtx(OWNER)), '/a-list');

const CO_SELLER = 'co-seller-uid';
const BUYER_NAME = 'SECRET BUYER NAME';
const BUYER_CONTACT = 'secret-buyer@example.test';
const BUYER_MESSAGE = 'SECRET BUYER MESSAGE';
const FLOOR_PRICE = 3131;
const SALE_PRICE = 5252;
const ORIGINAL_PRICE = 7373;
const ITEM_NOTE = 'SECRET ITEM NOTE';

const sale = (
  members: string[],
  name: string,
  status: string,
  lastEditedAt: number,
) => ({
  members,
  name,
  status,
  pickupArea: 'Ballard',
  buyerNote: 'Bring a friend',
  paymentMethods: ['Cash', 'Venmo'],
  currency: 'USD',
  notesForBuyers: ITEM_NOTE,
  lastEditedAt,
});

const saleItem = (
  title: string,
  status: string,
  extra: Record<string, unknown> = {},
) => ({
  title,
  status,
  isDraft: false,
  askingPriceCents: 4000,
  photos: [{ id: 'photo-1', path: 'secret/photo.jpg' }],
  floorPriceCents: FLOOR_PRICE,
  originalPriceCents: ORIGINAL_PRICE,
  notes: ITEM_NOTE,
  pending: null,
  lastEditedAt: NOW - 5,
  ...extra,
});

const pendingFor = (pickupOn: number | null) => ({
  pickupOn,
  buyerName: BUYER_NAME,
  buyerContact: BUYER_CONTACT,
});

const goingOnceSales = firestore.collection('apps/going-once/sales');
const fallSale = goingOnceSales.doc('fall');
await Promise.all([
  fallSale.set(sale([OWNER, CO_SELLER], 'Fall clear-out', 'OPEN', NOW - 7)),
  fallSale
    .collection('items')
    .doc('sofa')
    .set(saleItem('Gray sofa', 'AVAILABLE')),
  fallSale
    .collection('items')
    .doc('lamp')
    .set(saleItem('Floor lamp', 'AVAILABLE')),
  fallSale
    .collection('items')
    .doc('unpriced')
    .set(saleItem('No price yet', 'AVAILABLE', { askingPriceCents: null })),
  fallSale
    .collection('items')
    .doc('draft')
    .set(saleItem('Draft thing', 'AVAILABLE', { isDraft: true })),
  fallSale
    .collection('items')
    .doc('gone')
    .set(saleItem('Withdrawn thing', 'WITHDRAWN')),
  fallSale
    .collection('items')
    .doc('desk')
    .set(
      saleItem('Oak desk', 'PENDING', { pending: pendingFor(TODAY + 2 * DAY) }),
    ),
  fallSale
    .collection('items')
    .doc('bike')
    .set(
      saleItem('Road bike', 'PENDING', {
        pending: pendingFor(TODAY - 60 * DAY),
      }),
    ),
  fallSale
    .collection('items')
    .doc('nodate')
    .set(saleItem('No day yet', 'PENDING', { pending: pendingFor(null) })),
  fallSale
    .collection('items')
    .doc('pan')
    .set(
      saleItem('Cast iron pan', 'SOLD', {
        pending: null,
        sale: { priceCents: SALE_PRICE, buyerName: BUYER_NAME },
      }),
    ),
  fallSale.collection('inquiries').doc('q1').set({
    status: 'NEW',
    buyerName: BUYER_NAME,
    contact: BUYER_CONTACT,
    message: BUYER_MESSAGE,
  }),
  fallSale.collection('inquiries').doc('q2').set({
    status: 'HANDLED',
    buyerName: BUYER_NAME,
    contact: BUYER_CONTACT,
    message: BUYER_MESSAGE,
  }),
  goingOnceSales
    .doc('spring')
    .set(sale([OWNER], 'Spring garage sale', 'FINISHED', NOW - 8)),
  goingOnceSales
    .doc('spring')
    .collection('items')
    .doc('bench')
    .set(
      saleItem('Garden bench', 'PENDING', { pending: pendingFor(TODAY + DAY) }),
    ),
  goingOnceSales
    .doc('elsewhere')
    .set(sale(['someone-else'], 'Not yours', 'OPEN', NOW - 9)),
]);

const goingOnceAdapter = createGoingOnceAdapter({
  firestore: () => firestore,
  canOpen: async (uid) => uid === OWNER,
});

const goingOnceCtx = (uid: string) => ({
  uid,
  accountId: 'site',
  grant: buildNewGrant(
    {
      readerAppId: 'helm',
      connectorId: 'app:going-once',
      accountId: 'site',
      categoryIds: ['pickups', 'sales', 'things'],
      options: null,
    },
    goingOnceAdapter.manifest,
    NOW,
  ),
});

const runGoingOnce = async (uid: string, category: string) => {
  const page = await goingOnceAdapter.syncPage(goingOnceCtx(uid), {
    category,
    cursor: null,
    resumeState: null,
    windowStart: WINDOW_START,
  });
  assert.equal(page.isFull, true);
  assert.equal(page.isDone, true);
  return page.records;
};

const goingOnceSalesRead = await runGoingOnce(OWNER, 'sales');
assert.deepEqual(refs(goingOnceSalesRead), ['sales/fall']);
assert.equal(goingOnceSalesRead[0].kind, 'project');
assert.equal(goingOnceSalesRead[0].title, 'Fall clear-out');
assert.equal(goingOnceSalesRead[0].sourceUpdatedAt, NOW - 7);
assert.equal(goingOnceSalesRead[0].placeLabel, 'Ballard');
assert.equal(
  goingOnceSalesRead[0].detail,
  'Bring a friend · Pay by Cash, Venmo',
);
assert.equal(goingOnceSalesRead[0].currency, 'USD');
assert.deepEqual(goingOnceSalesRead[0].extra, {
  available: 2,
  pending: 3,
  sold: 1,
  newInquiries: 1,
  collectedCents: SALE_PRICE,
  leftCents: 4000 * 5,
});

const things = await runGoingOnce(OWNER, 'things');
assert.deepEqual(refs(things).sort(), [
  'sales/fall/items/bike',
  'sales/fall/items/desk',
  'sales/fall/items/lamp',
  'sales/fall/items/nodate',
  'sales/fall/items/sofa',
]);
assert.ok(things.every((thing) => thing.kind === 'artifact'));
assert.equal(
  things.find((thing) => thing.title === 'Oak desk')?.extra.status,
  'pending',
);
assert.equal(
  things.find((thing) => thing.title === 'Gray sofa')?.amountCents,
  4000,
);
assert.deepEqual(await runGoingOnce(OTHER, 'things'), []);

const pickups = await runGoingOnce(OWNER, 'pickups');
assert.deepEqual(refs(pickups), ['sales/fall/items/desk']);
assert.equal(pickups[0].kind, 'event');
assert.equal(pickups[0].title, 'Oak desk');
assert.equal(pickups[0].subtitle, 'Fall clear-out');
assert.equal(pickups[0].startAt, TODAY + 2 * DAY);
assert.equal(pickups[0].isAllDay, true);
assert.equal(pickups[0].timeZone, null);

assert.deepEqual(refs(await runGoingOnce(CO_SELLER, 'sales')), ['sales/fall']);
assert.deepEqual(refs(await runGoingOnce(CO_SELLER, 'pickups')), [
  'sales/fall/items/desk',
]);
assert.deepEqual(await runGoingOnce(OTHER, 'sales'), []);
assert.deepEqual(await runGoingOnce(OTHER, 'pickups'), []);

const goingOnceAll = [...goingOnceSalesRead, ...pickups, ...things];
assertShape(goingOnceAll);
goingOnceAll.forEach((record) => {
  const values = flatten(record);
  assert.ok(
    ![FLOOR_PRICE, ORIGINAL_PRICE].some((secret) => values.includes(secret)),
    record.sourceRef,
  );
  assert.ok(
    !values.some(
      (value) =>
        typeof value === 'string' &&
        /SECRET|secret|buyer@|example\.test/.test(value),
    ),
    record.sourceRef,
  );
});
await assert.rejects(() => runGoingOnce(OWNER, 'nothing'), /Unknown category/);
assert.equal(await goingOnceAdapter.status(goingOnceCtx(OWNER)), 'ok');
assert.equal(await goingOnceAdapter.status(goingOnceCtx(OTHER)), 'noAccess');
assert.equal(
  goingOnceAdapter.deepLink('sales/fall', goingOnceCtx(OWNER)),
  '/going-once',
);

const HOUSEMATE = 'housemate-uid';
const CARE_SECRET = 'SECRET CARE';
const EXPENSE_AMOUNT = 6363;
const WEIGHT_VALUE = 11.77;

const careHousehold = firestore.doc('apps/nine-lives/households/home');
const careDocs = (collection: string, id: string) =>
  careHousehold.collection(collection).doc(id);
const leftHousehold = firestore.doc('apps/nine-lives/households/left');

const vetVisit = (catIds: string[], extra: Record<string, unknown> = {}) => ({
  catIds,
  clinicId: 'blue-bark',
  status: 'upcoming',
  reason: 'checkup',
  customReasonLabel: null,
  title: CARE_SECRET,
  scheduledAt: TODAY + 3 * DAY + 9 * 3_600_000,
  summary: CARE_SECRET,
  lastEditedAt: NOW - 11,
  ...extra,
});

await Promise.all([
  careHousehold.set({
    name: 'Home',
    members: [OWNER, HOUSEMATE],
    inviteCode: CARE_SECRET,
    createdBy: OWNER,
    lastEditedAt: NOW - 12,
  }),
  careDocs('cats', 'mochi').set({
    name: 'Mochi',
    notes: CARE_SECRET,
    microchipNumber: CARE_SECRET,
    rabiesTagNumber: CARE_SECRET,
    insurance: { provider: CARE_SECRET, policyNumber: CARE_SECRET },
    dateOfBirth: Date.UTC(2021, 2, 4),
    isDateOfBirthEstimated: false,
    breed: 'Siamese',
    diet: { foodType: 'dry', brand: 'Royal Canin', notes: CARE_SECRET },
    lastEditedAt: NOW - 13,
  }),
  careDocs('cats', 'juniper').set({
    name: 'Juniper',
    dateOfBirth: Date.UTC(2023, 5, 1),
    isDateOfBirthEstimated: true,
    breed: 'Tabby',
    diet: null,
    lastEditedAt: NOW - 14,
  }),
  careDocs('doctors', 'lee').set({
    name: 'Dr. Lee',
    clinicId: 'blue-bark',
    notes: CARE_SECRET,
  }),
  careDocs('doctors', 'ray').set({ name: 'Dr. Ray', clinicId: 'blue-bark' }),
  careDocs('vetClinics', 'blue-bark').set({
    name: 'Blue Bark Vet',
    phone: '555-0100',
    address: '1 Cat Lane',
    email: 'secret-clinic@example.test',
    notes: CARE_SECRET,
    lastEditedAt: NOW - 15,
  }),
  careDocs('visits', 'next').set(
    vetVisit(['mochi', 'juniper'], { doctorId: 'lee' }),
  ),
  careDocs('visits', 'custom').set(
    vetVisit(['juniper'], {
      clinicId: null,
      reason: 'custom',
      customReasonLabel: 'Dental',
      scheduledAt: TODAY - 2 * DAY,
    }),
  ),
  careDocs('visits', 'old').set(
    vetVisit(['mochi'], { scheduledAt: TODAY - 60 * DAY }),
  ),
  careDocs('visits', 'done').set(
    vetVisit(['mochi'], {
      status: 'completed',
      scheduledAt: TODAY - 45 * DAY,
      doctorId: 'ray',
      costCents: EXPENSE_AMOUNT,
    }),
  ),
  careDocs('visits', 'ancient').set(
    vetVisit(['mochi'], {
      status: 'completed',
      scheduledAt: TODAY - 400 * DAY,
    }),
  ),
  careDocs('visits', 'called-off').set(
    vetVisit(['mochi'], { status: 'cancelled', scheduledAt: TODAY - 20 * DAY }),
  ),
  careDocs('visits', 'nocat').set(vetVisit(['gone-cat'])),
  careDocs('vaccinations', 'rabies').set({
    catId: 'mochi',
    name: 'Rabies',
    history: [{ lotNumber: CARE_SECRET }],
    lastAdministeredAt: Date.UTC(2025, 10, 3),
    expiresAt: TODAY + 20 * DAY,
    lastEditedAt: NOW - 16,
  }),
  careDocs('vaccinations', 'lapsed').set({
    catId: 'mochi',
    name: 'Old shot',
    expiresAt: TODAY - 90 * DAY,
  }),
  careDocs('vaccinations', 'nodue').set({
    catId: 'mochi',
    name: 'No next date',
    expiresAt: null,
  }),
  careDocs('preventives', 'flea').set({
    catIds: ['mochi', 'juniper'],
    name: 'Flea and tick',
    history: [{ dosage: CARE_SECRET }],
    lastAdministeredAt: null,
    expiresAt: TODAY - 5 * DAY,
    lastEditedAt: NOW - 17,
  }),
  careDocs('conditions', 'asthma').set({
    catId: 'juniper',
    name: 'Asthma',
    status: 'ongoing',
    description: CARE_SECRET,
    lastEditedAt: NOW - 18,
  }),
  careDocs('expenses', 'food').set({
    catIds: ['mochi'],
    items: [
      { id: 'i', category: 'food', label: CARE_SECRET, amount: EXPENSE_AMOUNT },
    ],
    label: CARE_SECRET,
  }),
  careDocs('weightEntries', 'w1').set({
    catId: 'mochi',
    weight: WEIGHT_VALUE,
    unit: 'lb',
  }),
  careDocs('litterEntries', 'l1').set({
    litterBoxId: 'box',
    weightBefore: WEIGHT_VALUE,
    notes: CARE_SECRET,
  }),
  careDocs('healthRecords', 'h1').set({
    catIds: ['mochi'],
    fileURL: 'https://storage.example.test/secret-record.pdf',
    fileName: 'secret-record.pdf',
    notes: CARE_SECRET,
  }),
  leftHousehold.set({
    name: 'Left behind',
    members: [HOUSEMATE],
    createdBy: OWNER,
    lastEditedAt: NOW - 19,
  }),
  leftHousehold.collection('cats').doc('ghost').set({ name: 'Ghost' }),
  leftHousehold.collection('vetClinics').doc('c').set({ name: 'Ghost Clinic' }),
  leftHousehold.collection('conditions').doc('c').set({
    catId: 'ghost',
    name: 'Ghost condition',
    status: 'active',
  }),
  leftHousehold
    .collection('visits')
    .doc('v')
    .set(vetVisit(['ghost'], { clinicId: null })),
  leftHousehold
    .collection('vaccinations')
    .doc('v')
    .set({
      catId: 'ghost',
      name: 'Ghost shot',
      expiresAt: TODAY + DAY,
    }),
]);

const nineLivesAdapter = createNineLivesAdapter({
  firestore: () => firestore,
  canOpen: async (uid) => uid === OWNER,
});

const nineLivesCtx = (uid: string) => ({
  uid,
  accountId: 'site',
  grant: buildNewGrant(
    {
      readerAppId: 'helm',
      connectorId: 'app:nine-lives',
      accountId: 'site',
      categoryIds: ['cats', 'vetVisits', 'dueCare', 'clinics', 'conditions'],
      options: null,
    },
    nineLivesAdapter.manifest,
    NOW,
  ),
});

const runNineLives = async (uid: string, category: string) => {
  const page = await nineLivesAdapter.syncPage(nineLivesCtx(uid), {
    category,
    cursor: null,
    resumeState: null,
    windowStart:
      TODAY -
      Math.max(
        30,
        nineLivesAdapter.manifest.categories.find(
          (entry) => entry.id === category,
        )?.historyDays ?? 0,
      ) *
        DAY,
  });
  assert.equal(page.isFull, true);
  assert.equal(page.isDone, true);
  return page.records;
};

const careCats = await runNineLives(OWNER, 'cats');
assert.deepEqual(refs(careCats).sort(), [
  'households/home/cats/juniper',
  'households/home/cats/mochi',
]);
assert.ok(careCats.every((record) => record.kind === 'pet'));
const mochiRecord = careCats.find((record) =>
  record.sourceRef.endsWith('mochi'),
);
assert.equal(mochiRecord?.title, 'Mochi');
assert.equal(
  mochiRecord?.detail,
  'Born Mar 4, 2021 · Siamese · Food: Royal Canin dry',
);
assert.equal(
  careCats.find((record) => record.sourceRef.endsWith('juniper'))?.detail,
  'Born about Jun 1, 2023 · Tabby',
);

const careVisits = await runNineLives(OWNER, 'vetVisits');
assert.deepEqual(refs(careVisits).sort(), [
  'households/home/visits/custom',
  'households/home/visits/done',
  'households/home/visits/next',
]);
const doneVisit = careVisits.find((record) =>
  record.sourceRef.endsWith('done'),
);
assert.equal(doneVisit?.subtitle, 'Past visit');
assert.equal(doneVisit?.detail, 'Doctor: Dr. Ray');
assert.equal(doneVisit?.startAt, TODAY - 45 * DAY);
const nextVisit = careVisits.find((record) =>
  record.sourceRef.endsWith('next'),
);
assert.equal(nextVisit?.kind, 'event');
assert.equal(nextVisit?.title, 'Mochi and Juniper: Checkup');
assert.equal(nextVisit?.placeLabel, 'Blue Bark Vet');
assert.equal(nextVisit?.startAt, TODAY + 3 * DAY + 9 * 3_600_000);
assert.equal(nextVisit?.isAllDay, false);
assert.equal(nextVisit?.subtitle, null);
assert.equal(nextVisit?.detail, 'Doctor: Dr. Lee');
assert.equal(nextVisit?.sourceUpdatedAt, NOW - 11);
const customVisit = careVisits.find((record) =>
  record.sourceRef.endsWith('custom'),
);
assert.equal(customVisit?.title, 'Juniper: Dental');
assert.equal(customVisit?.placeLabel, null);

const careDue = await runNineLives(OWNER, 'dueCare');
assert.deepEqual(refs(careDue).sort(), [
  'households/home/preventives/flea',
  'households/home/vaccinations/rabies',
]);
const rabies = careDue.find((record) => record.sourceRef.endsWith('rabies'));
assert.equal(rabies?.kind, 'task');
assert.equal(rabies?.title, 'Mochi: Rabies');
assert.equal(rabies?.dueAt, TODAY + 20 * DAY);
assert.equal(rabies?.isAllDay, true);
assert.equal(rabies?.detail, 'Last given Nov 3, 2025');
assert.equal(
  careDue.find((record) => record.sourceRef.endsWith('flea'))?.detail,
  null,
);
assert.equal(
  careDue.find((record) => record.sourceRef.endsWith('flea'))?.title,
  'Mochi and Juniper: Flea and tick',
);

const careClinics = await runNineLives(OWNER, 'clinics');
assert.deepEqual(refs(careClinics), ['households/home/vetClinics/blue-bark']);
assert.equal(careClinics[0].kind, 'place');
assert.equal(careClinics[0].title, 'Blue Bark Vet');
assert.equal(careClinics[0].detail, 'Doctors: Dr. Lee, Dr. Ray');
assert.deepEqual(careClinics[0].extra, {
  phone: '555-0100',
  address: '1 Cat Lane',
});

const careConditions = await runNineLives(OWNER, 'conditions');
assert.deepEqual(refs(careConditions), ['households/home/conditions/asthma']);
assert.equal(careConditions[0].kind, 'knowledge');
assert.equal(careConditions[0].title, 'Asthma');
assert.equal(careConditions[0].subtitle, 'Juniper');
assert.equal(careConditions[0].detail, 'Ongoing');

const careCategories = [
  'cats',
  'vetVisits',
  'dueCare',
  'clinics',
  'conditions',
];
assert.deepEqual(refs(await runNineLives(HOUSEMATE, 'cats')).sort(), [
  'households/home/cats/juniper',
  'households/home/cats/mochi',
  'households/left/cats/ghost',
]);
await Promise.all(
  careCategories.map(async (category) =>
    assert.deepEqual(await runNineLives(OTHER, category), [], category),
  ),
);
const ownerLeftRefs = (
  await Promise.all(
    careCategories.map((category) => runNineLives(OWNER, category)),
  )
)
  .flat()
  .map((record) => record.sourceRef);
assert.ok(ownerLeftRefs.every((ref) => !ref.includes('households/left')));

const careAll = [
  ...careCats,
  ...careVisits,
  ...careDue,
  ...careClinics,
  ...careConditions,
];
assertShape(careAll);
careAll.forEach((record) => {
  const values = flatten(record);
  assert.ok(
    ![EXPENSE_AMOUNT, WEIGHT_VALUE].some((secret) => values.includes(secret)),
    record.sourceRef,
  );
  assert.ok(
    !values.some(
      (value) =>
        typeof value === 'string' &&
        /SECRET|secret|example\.test|\.pdf/.test(value),
    ),
    record.sourceRef,
  );
});
await assert.rejects(() => runNineLives(OWNER, 'nothing'), /Unknown category/);
assert.equal(await nineLivesAdapter.status(nineLivesCtx(OWNER)), 'ok');
assert.equal(await nineLivesAdapter.status(nineLivesCtx(OTHER)), 'noAccess');
assert.equal(
  nineLivesAdapter.deepLink('households/home/cats/mochi', nineLivesCtx(OWNER)),
  '/nine-lives',
);

const TRIP_SECRET = 'SECRET TRIP';
const TRIP_EXPENSE_AMOUNT = 9000;
const utc = (...parts: [number, number, number, number?, number?]) =>
  Date.UTC(parts[0], parts[1], parts[2], parts[3] ?? 0, parts[4] ?? 0);

const trips = firestore.collection('apps/waypoint/trips');
const member = (uid: string) => ({ uid, role: 'EDITOR', joinedAt: NOW - 99 });
const tripFields = (fields: Record<string, unknown>) => ({
  title: 'Trip',
  coverImageUrl: TRIP_SECRET,
  inviteCode: TRIP_SECRET,
  sharedAlbumUrl: 'https://photos.example.test/secret-album',
  defaultCurrency: 'USD',
  isArchived: false,
  timeModel: 'RELATIVE',
  timezone: 'America/New_York',
  city: { name: 'New York', region: 'NY', latitude: 1, longitude: 2 },
  lastEditedAt: NOW - 21,
  ...fields,
});
const planned = (fields: Record<string, unknown>) => ({
  eventType: 'ACTIVITY',
  customTypeLabel: null,
  dayIndex: 0,
  endDayIndex: 0,
  startAt: null,
  endAt: null,
  startTime: null,
  endTime: null,
  timezone: null,
  endTimezone: null,
  locationName: 'Somewhere',
  address: TRIP_SECRET,
  notes: TRIP_SECRET,
  eventDetails: { transitDetails: { confirmationCode: TRIP_SECRET } },
  attendeeTargetType: 'EVERYONE_INCLUDING_FUTURE',
  assignedMemberIds: [],
  isArchived: false,
  lastEditedAt: NOW - 22,
  ...fields,
});

const nyc = trips.doc('nyc');
const spring = trips.doc('spring');
const absolute = trips.doc('absolute');
const task = (fields: Record<string, unknown>) => ({
  category: 'OTHER',
  note: TRIP_SECRET,
  completeByDayIndex: null,
  isCompleted: false,
  lastEditedAt: NOW - 23,
  ...fields,
});
const expense = (fields: Record<string, unknown>) => ({
  title: TRIP_SECRET,
  note: TRIP_SECRET,
  receiptUrl: 'https://storage.example.test/secret-receipt.jpg',
  currency: 'USD',
  amount: null,
  amountMin: null,
  amountMax: null,
  paidAmount: null,
  isPerPerson: false,
  payerUid: null,
  status: 'PAID',
  targetType: 'EVERYONE_CURRENT',
  targetMemberIds: [],
  splitAmounts: null,
  paidMemberStatus: {},
  earlyPayments: {},
  ...fields,
});

await Promise.all([
  nyc.set(
    tripFields({
      title: 'New York',
      startDate: utc(2026, 9, 30),
      endDate: utc(2026, 10, 3),
      members: { [OWNER]: member(OWNER), [HOUSEMATE]: member(HOUSEMATE) },
    }),
  ),
  nyc
    .collection('events')
    .doc('flight')
    .set(
      planned({
        eventType: 'TRAVEL',
        title: 'Flight DL 1',
        eventDetails: {
          transitType: 'FLIGHT',
          transitDetails: {
            airline: 'Delta',
            flightNumber: 'DL 1',
            departureAirportCode: 'LGA',
            arrivalAirportCode: 'ORD',
            confirmationCode: TRIP_SECRET,
            notes: TRIP_SECRET,
          },
        },
        startTime: '09:00',
        endTime: '11:05',
        timezone: 'America/New_York',
        endTimezone: 'America/Chicago',
        locationName: 'JFK',
      }),
    ),
  nyc
    .collection('events')
    .doc('dinner-before')
    .set(
      planned({
        eventType: 'DINING',
        title: 'Dinner before',
        dayIndex: 1,
        endDayIndex: 1,
        startTime: '19:00',
      }),
    ),
  nyc
    .collection('events')
    .doc('dinner-after')
    .set(
      planned({
        eventType: 'DINING',
        title: 'Dinner after',
        dayIndex: 3,
        endDayIndex: 3,
        startTime: '19:00',
      }),
    ),
  nyc
    .collection('events')
    .doc('clocks-back')
    .set(
      planned({
        title: 'Night walk',
        dayIndex: 2,
        endDayIndex: 2,
        startTime: '01:30',
        endTime: '02:30',
      }),
    ),
  nyc
    .collection('events')
    .doc('spa')
    .set(
      planned({
        eventType: 'OTHER',
        customTypeLabel: 'Spa day',
        title: 'Spa',
        dayIndex: 1,
        endDayIndex: 1,
      }),
    ),
  nyc
    .collection('events')
    .doc('hers')
    .set(
      planned({
        title: 'Only for the housemate',
        attendeeTargetType: 'SPECIFIC_MEMBERS',
        assignedMemberIds: [HOUSEMATE],
        startTime: '12:00',
      }),
    ),
  nyc
    .collection('events')
    .doc('mine')
    .set(
      planned({
        title: 'Only for the owner',
        attendeeTargetType: 'SPECIFIC_MEMBERS',
        assignedMemberIds: [OWNER],
        startTime: '12:00',
      }),
    ),
  nyc
    .collection('events')
    .doc('free')
    .set(
      planned({ eventType: 'FREE_TIME', title: 'Free', startTime: '13:00' }),
    ),
  nyc
    .collection('events')
    .doc('archived')
    .set(planned({ title: 'Archived', isArchived: true, startTime: '13:00' })),
  nyc
    .collection('events')
    .doc('no-day')
    .set(planned({ title: 'No day', dayIndex: null, endDayIndex: null })),
  nyc
    .collection('events')
    .doc('far-out')
    .set(planned({ title: 'Far out', dayIndex: 40, endDayIndex: 40 })),
  nyc
    .collection('stays')
    .doc('hotel')
    .set({
      name: 'Hotel Hudson',
      address: '1 Hudson St',
      confirmationCode: TRIP_SECRET,
      notes: TRIP_SECRET,
      linkUrl: 'https://hotel.example.test/secret',
      checkInDayIndex: 0,
      checkInTime: '15:00',
      checkOutDayIndex: 3,
      checkOutTime: '11:00',
      checkInTimezone: null,
      lastEditedAt: NOW - 24,
    }),
  nyc
    .collection('rentals')
    .doc('car')
    .set({
      name: 'Hertz',
      vehicle: TRIP_SECRET,
      pickupAddress: 'JFK Rental Center',
      notes: TRIP_SECRET,
      confirmationCode: TRIP_SECRET,
      pickupDayIndex: 0,
      pickupTime: '10:00',
      returnDayIndex: 3,
      returnTime: '10:00',
      timezone: null,
      lastEditedAt: NOW - 25,
    }),
  nyc
    .collection('checklist')
    .doc('passports')
    .set(
      task({
        title: 'Passports',
        category: 'DOCUMENTS',
        assignedToUids: [OWNER],
        completeByDayIndex: 0,
      }),
    ),
  nyc
    .collection('checklist')
    .doc('shared')
    .set(
      task({
        title: 'Book dinner',
        category: 'BOOKINGS',
        assignedToUids: [OWNER, HOUSEMATE],
      }),
    ),
  nyc
    .collection('checklist')
    .doc('hers')
    .set(
      task({
        title: 'Housemate only',
        category: 'PACKING',
        assignedToUids: [HOUSEMATE],
      }),
    ),
  nyc
    .collection('checklist')
    .doc('done')
    .set(
      task({
        title: 'Packed shoes',
        category: 'PACKING',
        assignedToUids: [OWNER],
        isCompleted: true,
      }),
    ),
  nyc.collection('ideas').doc('idea').set({ title: TRIP_SECRET }),
  nyc.collection('eventSuggestions').doc('s').set({ title: TRIP_SECRET }),
  nyc.collection('announcements').doc('a').set({ message: TRIP_SECRET }),
  nyc.collection('contacts').doc('c').set({
    name: TRIP_SECRET,
    phone: '555-0199',
    email: 'secret-contact@example.test',
  }),
  nyc.collection('album').doc('photo').set({
    imageUrl: 'https://storage.example.test/secret-photo.jpg',
  }),
  nyc
    .collection('expenses')
    .doc('dinner')
    .set(
      expense({
        payerUid: OWNER,
        amount: TRIP_EXPENSE_AMOUNT / 100,
        paidMemberStatus: {},
      }),
    ),
  nyc
    .collection('expenses')
    .doc('cab')
    .set(
      expense({
        payerUid: HOUSEMATE,
        amount: 20.01,
        targetType: 'SPECIFIC_MEMBERS',
        targetMemberIds: [OWNER, HOUSEMATE],
      }),
    ),
  nyc
    .collection('expenses')
    .doc('planned')
    .set(expense({ status: 'EXPECTED', amount: 500 })),
  firestore.doc(`apps/waypoint/personalChecklist/${OWNER}/items/charger`).set(
    task({
      tripId: 'nyc',
      title: 'Pack charger',
      category: 'PACKING',
      completeByDayIndex: 1,
    }),
  ),
  firestore
    .doc(`apps/waypoint/personalChecklist/${OWNER}/items/gone`)
    .set(task({ tripId: 'left', title: 'Left trip to-do' })),
  firestore
    .doc(`apps/waypoint/personalChecklist/${HOUSEMATE}/items/private`)
    .set(
      task({
        tripId: 'nyc',
        title: 'HOUSEMATE PRIVATE SECRET',
        category: 'PACKING',
      }),
    ),
  spring.set(
    tripFields({
      title: 'Seattle spring',
      startDate: utc(2027, 2, 13),
      endDate: utc(2027, 2, 15),
      timezone: 'America/Los_Angeles',
      city: null,
      defaultCurrency: null,
      members: { [OWNER]: member(OWNER) },
    }),
  ),
  spring
    .collection('events')
    .doc('gap')
    .set(
      planned({
        title: 'Springs forward',
        dayIndex: 1,
        endDayIndex: 1,
        startTime: '02:30',
      }),
    ),
  spring
    .collection('events')
    .doc('after-gap')
    .set(
      planned({
        title: 'After the gap',
        dayIndex: 1,
        endDayIndex: 1,
        startTime: '03:30',
      }),
    ),
  spring.collection('stays').doc('tokyo-time').set({
    name: 'Booked from Tokyo',
    address: null,
    checkInDayIndex: 0,
    checkInTime: '15:00',
    checkOutDayIndex: 2,
    checkOutTime: '11:00',
    checkInTimezone: 'Asia/Tokyo',
  }),
  spring
    .collection('events')
    .doc('bad-zone')
    .set(
      planned({
        title: 'Unknown zone',
        startTime: '09:00',
        timezone: 'Not/AZone',
      }),
    ),
  absolute.set(
    tripFields({
      title: 'Older trip',
      timeModel: 'ABSOLUTE',
      timezone: null,
      city: null,
      startDate: TODAY + DAY,
      endDate: TODAY + 3 * DAY,
      members: { [OWNER]: member(OWNER) },
    }),
  ),
  absolute
    .collection('events')
    .doc('old-style')
    .set(
      planned({
        title: 'Old style',
        dayIndex: 1,
        endDayIndex: 1,
        startAt: TODAY + 2 * DAY + 15 * 3_600_000,
        endAt: TODAY + 2 * DAY + 17 * 3_600_000,
      }),
    ),
  absolute
    .collection('stays')
    .doc('old-stay')
    .set({
      name: 'Old stay',
      checkInAt: TODAY + DAY + 20 * 3_600_000,
      checkOutAt: TODAY + 3 * DAY + 9 * 3_600_000,
      checkInTimezone: null,
    }),
  trips.doc('over').set(
    tripFields({
      title: 'Over',
      startDate: WINDOW_START - 12 * DAY,
      endDate: WINDOW_START - 10 * DAY,
      members: { [OWNER]: member(OWNER) },
    }),
  ),
  trips
    .doc('over')
    .collection('events')
    .doc('e')
    .set(planned({ title: 'Over event', startTime: '09:00' })),
  trips.doc('shelved').set(
    tripFields({
      title: 'Shelved',
      isArchived: true,
      startDate: TODAY + DAY,
      endDate: TODAY + 2 * DAY,
      members: { [OWNER]: member(OWNER) },
    }),
  ),
  trips.doc('left').set(
    tripFields({
      title: 'Left behind',
      startDate: TODAY + DAY,
      endDate: TODAY + 2 * DAY,
      members: { [HOUSEMATE]: member(HOUSEMATE) },
    }),
  ),
  trips
    .doc('left')
    .collection('events')
    .doc('e')
    .set(planned({ title: 'Left event', startTime: '09:00' })),
  trips
    .doc('left')
    .collection('checklist')
    .doc('t')
    .set(task({ title: 'Left task', assignedToUids: [OWNER, HOUSEMATE] })),
  trips
    .doc('left')
    .collection('expenses')
    .doc('x')
    .set(expense({ payerUid: HOUSEMATE, amount: 70 })),
]);

const waypointAdapter = createWaypointAdapter({
  firestore: () => firestore,
  canOpen: async (uid) => uid === OWNER,
});
const waypointDefaults = waypointAdapter.manifest.categories.filter(
  (category) => category.isOnAtConnect,
);
const waypointCtx = (uid: string) => ({
  uid,
  accountId: 'site',
  grant: buildNewGrant(
    {
      readerAppId: 'helm',
      connectorId: 'app:waypoint',
      accountId: 'site',
      categoryIds: waypointDefaults.map((category) => category.id),
      options: null,
    },
    waypointAdapter.manifest,
    NOW,
  ),
});
const runWaypoint = async (uid: string, category: string) => {
  const page = await waypointAdapter.syncPage(waypointCtx(uid), {
    category,
    cursor: null,
    resumeState: null,
    windowStart: WINDOW_START,
  });
  assert.equal(page.isFull, true);
  assert.equal(page.isDone, true);
  return page.records;
};

assert.deepEqual(
  waypointDefaults.map((category) => category.id),
  ['trips', 'itinerary', 'myTasks'],
);
const waypointGrant = waypointCtx(OWNER).grant;
assert.equal(waypointGrant.categories.tripBalances.isOn, false);
assert.equal(waypointGrant.categories.trips.isOn, true);

const tripRecords = await runWaypoint(OWNER, 'trips');
assert.deepEqual(refs(tripRecords).sort(), [
  'trips/absolute',
  'trips/nyc',
  'trips/spring',
]);
const nycTrip = tripRecords.find((record) => record.sourceRef === 'trips/nyc');
assert.equal(nycTrip?.kind, 'trip');
assert.equal(nycTrip?.title, 'New York');
assert.equal(nycTrip?.startAt, utc(2026, 9, 30));
assert.equal(nycTrip?.endAt, utc(2026, 10, 3));
assert.equal(nycTrip?.isAllDay, true);
assert.equal(nycTrip?.timeZone, 'America/New_York');
assert.equal(nycTrip?.placeLabel, 'New York');
assert.equal(
  tripRecords.find((record) => record.sourceRef === 'trips/spring')?.placeLabel,
  null,
);

const plan = await runWaypoint(OWNER, 'itinerary');
const planBy = (ref: string) => plan.find((record) => record.sourceRef === ref);
assert.deepEqual(refs(plan).sort(), [
  'trips/absolute/events/old-style',
  'trips/absolute/stays/old-stay',
  'trips/nyc/events/clocks-back',
  'trips/nyc/events/dinner-after',
  'trips/nyc/events/dinner-before',
  'trips/nyc/events/flight',
  'trips/nyc/events/mine',
  'trips/nyc/events/spa',
  'trips/nyc/rentals/car',
  'trips/nyc/stays/hotel',
  'trips/spring/events/after-gap',
  'trips/spring/events/bad-zone',
  'trips/spring/events/gap',
  'trips/spring/stays/tokyo-time',
]);
assert.ok(plan.every((record) => record.kind === 'event'));

const flight = planBy('trips/nyc/events/flight');
assert.equal(flight?.title, 'Flight DL 1');
assert.equal(flight?.subtitle, 'Flight');
assert.equal(flight?.startAt, utc(2026, 9, 30, 13, 0));
assert.equal(flight?.endAt, utc(2026, 9, 30, 16, 5));
assert.equal(flight?.timeZone, 'America/New_York');
assert.equal(flight?.placeLabel, 'JFK');
assert.equal(flight?.isAllDay, false);
assert.equal(flight?.sourceUpdatedAt, NOW - 22);
assert.equal(flight?.detail, 'Delta DL 1 · LGA → ORD');
assert.equal(planBy('trips/nyc/events/dinner-before')?.detail, null);
assert.equal(planBy('trips/nyc/stays/hotel')?.placeLabel, '1 Hudson St');

assert.equal(
  planBy('trips/nyc/events/dinner-before')?.startAt,
  utc(2026, 9, 31, 23, 0),
);
assert.equal(
  planBy('trips/nyc/events/dinner-after')?.startAt,
  utc(2026, 10, 3, 0, 0),
);
const clocksBack = planBy('trips/nyc/events/clocks-back');
assert.equal(clocksBack?.startAt, utc(2026, 10, 1, 5, 30));
assert.equal(clocksBack?.endAt, utc(2026, 10, 1, 7, 30));
assert.equal(
  (clocksBack?.endAt ?? 0) - (clocksBack?.startAt ?? 0),
  2 * 3_600_000,
);

const spa = planBy('trips/nyc/events/spa');
assert.equal(spa?.isAllDay, true);
assert.equal(spa?.startAt, utc(2026, 9, 31));
assert.equal(spa?.endAt, null);
assert.equal(spa?.timeZone, null);
assert.equal(spa?.subtitle, 'Spa day');

const hotel = planBy('trips/nyc/stays/hotel');
assert.equal(hotel?.subtitle, 'Stay');
assert.equal(hotel?.startAt, utc(2026, 9, 30, 19, 0));
assert.equal(hotel?.endAt, utc(2026, 10, 2, 16, 0));
assert.equal(hotel?.placeLabel, '1 Hudson St');
const car = planBy('trips/nyc/rentals/car');
assert.equal(car?.startAt, utc(2026, 9, 30, 14, 0));
assert.equal(car?.endAt, utc(2026, 10, 2, 15, 0));
assert.equal(car?.placeLabel, 'JFK Rental Center');

assert.equal(
  planBy('trips/spring/events/gap')?.startAt,
  utc(2027, 2, 14, 10, 30),
);
assert.equal(
  planBy('trips/spring/events/after-gap')?.startAt,
  utc(2027, 2, 14, 10, 30),
);
const tokyo = planBy('trips/spring/stays/tokyo-time');
assert.equal(tokyo?.startAt, utc(2027, 2, 13, 6, 0));
assert.equal(tokyo?.endAt, utc(2027, 2, 15, 2, 0));
assert.equal(tokyo?.timeZone, 'Asia/Tokyo');
const badZone = planBy('trips/spring/events/bad-zone');
assert.equal(badZone?.isAllDay, true);
assert.equal(badZone?.startAt, utc(2027, 2, 13));
assert.equal(badZone?.timeZone, null);

const oldStyle = planBy('trips/absolute/events/old-style');
assert.equal(oldStyle?.startAt, TODAY + 2 * DAY + 15 * 3_600_000);
assert.equal(oldStyle?.endAt, TODAY + 2 * DAY + 17 * 3_600_000);
assert.equal(oldStyle?.timeZone, null);
assert.equal(oldStyle?.isAllDay, false);

const tasks = await runWaypoint(OWNER, 'myTasks');
assert.deepEqual(refs(tasks).sort(), [
  'trips/nyc/checklist/passports',
  'trips/nyc/checklist/shared',
  'trips/nyc/personalChecklist/charger',
]);
assert.ok(tasks.every((record) => record.kind === 'task'));
const passports = tasks.find((record) =>
  record.sourceRef.endsWith('passports'),
);
assert.equal(passports?.title, 'Passports');
assert.equal(passports?.subtitle, 'New York');
assert.equal(passports?.dueAt, utc(2026, 9, 30));
assert.equal(passports?.isAllDay, true);
const sharedTask = tasks.find((record) => record.sourceRef.endsWith('shared'));
assert.equal(sharedTask?.dueAt, null);
assert.equal(sharedTask?.isAllDay, false);
assert.equal(
  tasks.find((record) => record.sourceRef.endsWith('charger'))?.dueAt,
  utc(2026, 9, 31),
);
assert.deepEqual(refs(await runWaypoint(HOUSEMATE, 'myTasks')).sort(), [
  'trips/left/checklist/t',
  'trips/nyc/checklist/hers',
  'trips/nyc/checklist/shared',
  'trips/nyc/personalChecklist/private',
]);

const checklist = await runWaypoint(OWNER, 'tripChecklist');
assert.deepEqual(refs(checklist).sort(), [
  'trips/nyc/checklist/Bookings',
  'trips/nyc/checklist/Documents',
  'trips/nyc/checklist/Packing',
]);
assert.ok(checklist.every((record) => record.kind === 'artifact'));
const packing = checklist.find((record) =>
  record.sourceRef.endsWith('Packing'),
);
assert.equal(packing?.title, 'New York: Packing');
assert.equal(packing?.subtitle, '1 of 2 done');
assert.equal(packing?.detail, 'To do: Pack charger. Done: Packed shoes');
assert.deepEqual(packing?.extra, {});
assert.equal(
  checklist.find((record) => record.sourceRef.endsWith('Documents'))?.detail,
  'To do: Passports',
);
const mateChecklist = await runWaypoint(HOUSEMATE, 'tripChecklist');
const matePacking = mateChecklist.find((record) =>
  record.sourceRef.endsWith('nyc/checklist/Packing'),
);
assert.equal(
  matePacking?.detail,
  'To do: HOUSEMATE PRIVATE SECRET, Housemate only',
);
assert.ok(!JSON.stringify(checklist).includes('HOUSEMATE'));
assert.ok(!JSON.stringify(checklist).includes('Housemate'));

const balances = await runWaypoint(OWNER, 'tripBalances');
assert.deepEqual(refs(balances), ['trips/nyc/balance']);
assert.equal(balances[0].kind, 'moneySummary');
assert.equal(balances[0].title, 'New York');
assert.equal(balances[0].subtitle, "You're owed");
assert.equal(balances[0].amountCents, 3499);
assert.equal(balances[0].currency, 'USD');
assert.equal(balances[0].detail, 'You owe 0.00 USD; you are owed 34.99 USD');
const mateBalances = await runWaypoint(HOUSEMATE, 'tripBalances');
assert.deepEqual(refs(mateBalances), ['trips/nyc/balance']);
assert.equal(
  mateBalances.find((record) => record.sourceRef.includes('nyc'))?.amountCents,
  -3499,
);
assert.equal(
  mateBalances.find((record) => record.sourceRef.includes('nyc'))?.subtitle,
  'You owe',
);

const waypointCategories = [
  'trips',
  'itinerary',
  'myTasks',
  'tripChecklist',
  'tripBalances',
];
await Promise.all(
  waypointCategories.map(async (category) =>
    assert.deepEqual(await runWaypoint(OTHER, category), [], category),
  ),
);
const ownerWaypointRefs = (
  await Promise.all(
    waypointCategories.map((category) => runWaypoint(OWNER, category)),
  )
)
  .flat()
  .map((record) => record.sourceRef);
assert.ok(
  ownerWaypointRefs.every(
    (ref) =>
      !/trips\/(left|over|shelved)\b/.test(ref) &&
      !ref.includes('hers') &&
      !ref.includes('private'),
  ),
);

const waypointAll = [
  ...tripRecords,
  ...plan,
  ...tasks,
  ...checklist,
  ...balances,
];
assertShape(waypointAll);
waypointAll.forEach((record) => {
  const values = flatten(record);
  assert.ok(!values.includes(TRIP_EXPENSE_AMOUNT), record.sourceRef);
  assert.ok(
    !values.some(
      (value) =>
        typeof value === 'string' &&
        /SECRET|secret|example\.test|555-0199|\.jpg/.test(value),
    ),
    record.sourceRef,
  );
});
await assert.rejects(() => runWaypoint(OWNER, 'nothing'), /Unknown category/);
assert.equal(await waypointAdapter.status(waypointCtx(OWNER)), 'ok');
assert.equal(await waypointAdapter.status(waypointCtx(OTHER)), 'noAccess');
assert.equal(
  waypointAdapter.deepLink('trips/nyc/events/flight', waypointCtx(OWNER)),
  '/waypoint?trip=nyc',
);
assert.equal(
  waypointAdapter.deepLink('trips/x/personalChecklist/y', waypointCtx(OWNER)),
  '/waypoint?trip=x',
);

const SPACE_KEY =
  'd953f53d9d6c3b3d2a748beca467f20b4b74d7cb7cc17a0e7a7f315f8b3e756f';
const WRONG_KEY = SPACE_KEY.split('').reverse().join('');
const STRANGER = 'stranger-uid';
const ITEM_SECRET = 'SECRET ITEM WORDS';
const INVITE_SECRET = 'SECRET-INVITE-CODE';

const sealed = (text: string, key = SPACE_KEY) => {
  const { ciphertext, nonce } = gcmEncrypt(
    Buffer.from(key, 'hex'),
    Buffer.from(text),
    null,
  );
  return {
    value: ciphertext,
    ciphertext,
    nonce,
    keyId: 'wtw-key',
    keyVersion: 1,
    algorithm: 'AES-256-GCM',
  };
};
const waitSpaces = firestore.collection('apps/worth-the-wait/spaces');
const waitSpace = (members: string[], key: string) => ({
  createdBy: members[0],
  members,
  inviteCode: INVITE_SECRET,
  activeAction: null,
  encryption: { appId: 'worth-the-wait', keyId: 'wtw-key', keyVersion: 1, key },
});
const waitItem = (isRevealed: boolean) => ({
  authorId: OWNER,
  content: sealed(ITEM_SECRET),
  isRevealed,
  revealedAt: isRevealed ? NOW : null,
  revealedMethod: isRevealed ? 'raffle' : null,
  createdAt: NOW - 5,
  lastEditedAt: NOW - 4,
});
const waitBox = async (
  space: string,
  id: string,
  name: string,
  emoji: string,
  revealedFlags: boolean[],
  key = SPACE_KEY,
  revealRequestedBy: {
    userId: string;
    method: string;
    requestedAt: number;
  }[] = [],
) => {
  const box = waitSpaces.doc(space).collection('boxes').doc(id);
  await box.set({
    name: sealed(name, key),
    emoji: sealed(emoji, key),
    description: sealed('Things to try together'),
    isDefault: false,
    createdBy: OWNER,
    revealHistory: [],
    revealRequestedBy,
  });
  await Promise.all(
    revealedFlags.map((flag, index) =>
      box.collection('items').doc(`i${index}`).set(waitItem(flag)),
    ),
  );
};
await Promise.all([
  waitSpaces.doc('wtw-home').set(waitSpace([OWNER, HOUSEMATE], SPACE_KEY)),
  waitSpaces.doc('wtw-stranger').set(waitSpace([STRANGER], SPACE_KEY)),
]);
await Promise.all([
  waitBox('wtw-home', 'dates', 'Date ideas', '🍿', [true, true, false]),
  waitBox('wtw-home', 'trips', 'Trips', '✈️', [false], SPACE_KEY, [
    { userId: HOUSEMATE, method: 'raffle', requestedAt: NOW },
  ]),
  waitBox('wtw-home', 'empty', 'Gifts', '🎁', [], SPACE_KEY, [
    { userId: OWNER, method: 'raffle', requestedAt: NOW },
    { userId: HOUSEMATE, method: 'raffle', requestedAt: NOW },
  ]),
  waitBox('wtw-home', 'garbled', 'Garbled', '🔒', [true], WRONG_KEY),
  waitBox('wtw-stranger', 'hidden', 'Hidden box', '🙈', [true, false]),
]);

const itemReads: string[] = [];
const pathOfQuery = (query: unknown) => {
  const options = (
    query as {
      _queryOptions?: {
        parentPath?: { relativeName?: string };
        collectionId?: string;
      };
    }
  )._queryOptions;
  return `${options?.parentPath?.relativeName ?? ''}/${options?.collectionId ?? ''}`;
};
const watch = (
  target: { prototype: object },
  method: string,
  pathOf: (self: unknown, args: unknown[]) => string,
) => {
  const proto = target.prototype as Record<string, unknown>;
  const original = proto[method] as (...args: unknown[]) => unknown;
  proto[method] = function (this: unknown, ...args: unknown[]) {
    const path = pathOf(this, args);
    if (/(^|\/)items(\/|$)/.test(path)) itemReads.push(`${method} ${path}`);
    return original.apply(this, args);
  };
  return () => {
    proto[method] = original;
  };
};
const unwatch = [
  watch(Query, 'get', (self) => pathOfQuery(self)),
  watch(Query, 'stream', (self) => pathOfQuery(self)),
  watch(DocumentReference, 'get', (self) => (self as { path: string }).path),
  watch(Firestore, 'getAll', (_self, args) =>
    args.map((ref) => (ref as { path?: string }).path ?? '').join(' '),
  ),
];

const waitAdapter = createWorthTheWaitAdapter({
  firestore: () => firestore,
  canOpen: async (uid) => uid === OWNER,
});
assert.deepEqual(
  waitAdapter.manifest.categories.map((category) => [
    category.id,
    category.isOnAtConnect,
  ]),
  [['boxCounts', false]],
);
const waitCtx = (uid: string) => ({
  uid,
  accountId: 'site',
  grant: buildNewGrant(
    {
      readerAppId: 'helm',
      connectorId: 'app:worth-the-wait',
      accountId: 'site',
      categoryIds: ['boxCounts'],
      options: null,
    },
    waitAdapter.manifest,
    NOW,
  ),
});
const readWait = (uid: string, category = 'boxCounts') =>
  waitAdapter.syncPage(waitCtx(uid), {
    category,
    cursor: null,
    resumeState: null,
    windowStart: WINDOW_START,
  });
const runWait = async (uid: string, category = 'boxCounts') => {
  const page = await readWait(uid, category);
  assert.equal(page.isFull, true);
  assert.equal(page.isDone, true);
  return page.records;
};

// The box sealed under another key stays unknown, so the read is not full and no copy is deleted.
const ownerPage = await readWait(OWNER);
assert.equal(ownerPage.isFull, false);
assert.equal(ownerPage.isDone, true);
const boxCounts = ownerPage.records;
assert.deepEqual(refs(boxCounts).sort(), [
  'spaces/wtw-home/boxes/dates',
  'spaces/wtw-home/boxes/empty',
  'spaces/wtw-home/boxes/trips',
]);
const countsOf = (ref: string) => {
  const record = boxCounts.find((one) => one.sourceRef === ref);
  assert.ok(record, ref);
  assert.equal(record.kind, 'countSummary');
  assert.equal(record.detail, 'Things to try together');
  return [record.title, record.subtitle, record.extra];
};
assert.deepEqual(countsOf('spaces/wtw-home/boxes/dates'), [
  'Date ideas',
  '🍿',
  { items: 3, revealed: 2, notYetRevealed: 1, revealsWaiting: 0 },
]);
assert.deepEqual(countsOf('spaces/wtw-home/boxes/trips'), [
  'Trips',
  '✈️',
  { items: 1, revealed: 0, notYetRevealed: 1, revealsWaiting: 1 },
]);
assert.deepEqual(countsOf('spaces/wtw-home/boxes/empty'), [
  'Gifts',
  '🎁',
  { items: 0, revealed: 0, notYetRevealed: 0, revealsWaiting: 0 },
]);
assertShape(boxCounts);
boxCounts.forEach((record) => {
  assert.deepEqual(
    Object.keys(record.extra).sort(),
    [...EXTRA_KEYS.countSummary].sort(),
  );
  assert.ok(
    !flatten(record).some(
      (value) =>
        typeof value === 'string' && /SECRET|INVITE|invite/i.test(value),
    ),
    record.sourceRef,
  );
});

assert.deepEqual(
  refs((await readWait(HOUSEMATE)).records).sort(),
  refs(boxCounts).sort(),
);
assert.deepEqual(await runWait(OTHER), []);
assert.deepEqual(refs(await runWait(STRANGER)), [
  'spaces/wtw-stranger/boxes/hidden',
]);
await assert.rejects(() => runWait(OWNER, 'nothing'), /Unknown category/);
assert.equal(await waitAdapter.status(waitCtx(OWNER)), 'ok');
assert.equal(await waitAdapter.status(waitCtx(OTHER)), 'noAccess');
assert.equal(
  waitAdapter.deepLink('spaces/wtw-home/boxes/dates', waitCtx(OWNER)),
  '/worth-the-wait',
);

assert.deepEqual(itemReads, [], 'only the two counts may touch items');
await firestore
  .collection('apps/worth-the-wait/spaces/wtw-home/boxes/dates/items')
  .get();
assert.equal(itemReads.length, 1, 'the spy sees an item query');
unwatch.forEach((restore) => restore());

// One sealed summary opened under the plan's key; only totals and names leave.
const RUNWAY_FORBIDDEN = [
  'SECRET ACCOUNT NAME',
  'SECRET CARD',
  'SECRET INCOME SOURCE',
  'SECRET RECEIPT',
  'SECRET TRANSACTION',
  'SECRET NOTE LINE',
];
const runwayKey = deriveSeedDataKey(DEV_KEYRING, OWNER);
const runwaySummary = {
  computedAt: NOW - 60_000,
  currency: 'USD',
  freeToSpendCents: 123_456,
  nextIncomeOn: '2026-11-15',
  dueBeforeIncomeCents: 45_000,
  bills: [
    { name: 'Overdue', amountCents: 9_000, dueOn: '2026-11-09' },
    { name: 'Rent', amountCents: 150_000, dueOn: '2026-11-14' },
    { name: 'Phone', amountCents: 6_000, dueOn: '2026-11-20' },
    { name: 'Broken date', amountCents: 100, dueOn: '2026-02-31' },
    { name: '', amountCents: 100, dueOn: '2026-11-20' },
    { name: 'Fractional', amountCents: 1.5, dueOn: '2026-11-20' },
  ],
  horizon: [
    {
      name: 'Lisbon',
      targetCents: 300_000,
      setAsideCents: 80_000,
      targetOn: '2027-03-01',
    },
    {
      name: 'Someday',
      targetCents: 50_000,
      setAsideCents: 0,
      targetOn: null,
    },
    { name: 'No target', setAsideCents: 0 },
  ],
  accountName: RUNWAY_FORBIDDEN[0],
  accounts: [{ name: RUNWAY_FORBIDDEN[0], balanceCents: 987_654 }],
  card: { name: RUNWAY_FORBIDDEN[1], owedCents: 555 },
  incomeSource: RUNWAY_FORBIDDEN[2],
  receipt: { url: RUNWAY_FORBIDDEN[3] },
  transactions: [{ merchant: RUNWAY_FORBIDDEN[4], cents: 777 }],
  note: RUNWAY_FORBIDDEN[5],
};
const runwayPlans = firestore.collection('apps/runway/plans');
const runwayWrapped = (uid: string) =>
  firestore.doc(`apps/runway/server/${uid}/keys/data`);
const WRONG_RUNWAY_UID = 'runway-wrong-key';
await Promise.all([
  runwayWrapped(OWNER).set(wrapDataKey(DEV_KEYRING, OWNER, runwayKey, NOW)),
  runwayPlans.doc(OWNER).set({
    uid: OWNER,
    notify: { needsHome: false },
    sealed: { value: 'x', nonce: 'y' },
    shareSummary: sealWithKey(
      { ...runwayKey, keyVersion: 1 },
      runwaySummary,
      1,
    ),
  }),
  runwayPlans.doc(WRONG_RUNWAY_UID).set({
    uid: WRONG_RUNWAY_UID,
    shareSummary: sealWithKey(
      { ...runwayKey, keyVersion: 1 },
      runwaySummary,
      1,
    ),
  }),
  runwayWrapped(WRONG_RUNWAY_UID).set(
    wrapDataKey(
      DEV_KEYRING,
      WRONG_RUNWAY_UID,
      deriveSeedDataKey(DEV_KEYRING, 'someone-else'),
      NOW,
    ),
  ),
  runwayPlans.doc('runway-legacy').set({ uid: 'runway-legacy' }),
]);

const runwayPlanWith = (uid: string, shareSummary: unknown) =>
  Promise.all([
    runwayWrapped(uid).set(wrapDataKey(DEV_KEYRING, uid, runwayKey, NOW)),
    runwayPlans.doc(uid).set({ uid, shareSummary }),
  ]);
const sealRunway = (summary: Record<string, unknown>) =>
  sealWithKey({ ...runwayKey, keyVersion: 1 }, summary, 1);
await Promise.all([
  runwayPlanWith('runway-cleared', null),
  runwayPlanWith(
    'runway-bad-total',
    sealRunway({ ...runwaySummary, freeToSpendCents: '123456' }),
  ),
  runwayPlanWith(
    'runway-twins',
    sealRunway({
      ...runwaySummary,
      bills: [
        { name: 'Gym', amountCents: 3_000, dueOn: '2026-11-20' },
        { name: 'Gym', amountCents: 3_000, dueOn: '2026-11-20' },
      ],
      horizon: [
        { name: 'Trip', targetCents: 1_000, setAsideCents: 0, targetOn: null },
        { name: 'Trip', targetCents: 1_000, setAsideCents: 0, targetOn: null },
      ],
    }),
  ),
]);

const runwayAdapter = createRunwayAdapter({
  firestore: () => firestore,
  canOpen: async (uid) => uid === OWNER,
  keyring: () => DEV_KEYRING,
  now: () => NOW,
});
assert.deepEqual(
  runwayAdapter.manifest.categories.map((category) => [
    category.id,
    category.isOnAtConnect,
  ]),
  [
    ['moneySummary', true],
    ['upcomingBills', false],
    ['horizon', false],
    ['envelopes', false],
    ['transactions', false],
  ],
);
assert.equal(
  runwayAdapter.manifest.categories.find(({ id }) => id === 'transactions')
    ?.mode,
  'live',
);
const runwayCtx = (uid: string) => ({
  uid,
  accountId: 'site',
  grant: buildNewGrant(
    {
      readerAppId: 'helm',
      connectorId: 'app:runway',
      accountId: 'site',
      categoryIds: ['moneySummary'],
      options: null,
    },
    runwayAdapter.manifest,
    NOW,
  ),
});
const readRunway = (uid: string, category: string) =>
  runwayAdapter.syncPage(runwayCtx(uid), {
    category,
    cursor: null,
    resumeState: null,
    windowStart: WINDOW_START,
  });
const runRunway = async (uid: string, category: string) => {
  const page = await readRunway(uid, category);
  assert.equal(page.isFull, true);
  assert.equal(page.isDone, true);
  return page.records;
};

const runwayMoney = await runRunway(OWNER, 'moneySummary');
const runwayBills = await runRunway(OWNER, 'upcomingBills');
const runwayHorizon = await runRunway(OWNER, 'horizon');
[...runwayMoney, ...runwayBills, ...runwayHorizon].forEach((record) =>
  assertShape([record]),
);
assert.equal(runwayMoney.length, 1);
const [summaryRecord] = runwayMoney;
assert.ok(summaryRecord);
assert.equal(summaryRecord.sourceRef, 'plan/summary');
assert.equal(summaryRecord.kind, 'moneySummary');
assert.equal(summaryRecord.title, 'Free to Spend');
assert.equal(summaryRecord.amountCents, 123_456);
assert.equal(summaryRecord.currency, 'USD');
assert.equal(summaryRecord.sourceUpdatedAt, NOW - 60_000);
assert.deepEqual(summaryRecord.extra, {
  nextIncomeAt: Date.UTC(2026, 10, 15),
  dueBeforeIncomeCents: 45_000,
});
assert.match(summaryRecord.detail ?? '', /\$450\.00.*2026-11-15/);
assert.deepEqual(
  titles(runwayBills),
  ['Phone', 'Rent'],
  'a bill already past is dropped',
);
runwayBills.forEach((record) => {
  assert.equal(record.kind, 'task');
  assert.equal(record.isAllDay, true);
  assert.match(record.sourceRef, /^bills\/[0-9a-f]{16}$/);
});
assert.equal(
  runwayBills.find((record) => record.title === 'Rent')?.dueAt,
  Date.UTC(2026, 10, 14),
);
assert.equal(
  new Set(refs(runwayBills)).size,
  runwayBills.length,
  'each bill has its own stable ref',
);
assert.deepEqual(titles(runwayHorizon), ['Lisbon', 'Someday']);
const lisbon = runwayHorizon.find((record) => record.title === 'Lisbon');
assert.equal(lisbon?.kind, 'project');
assert.equal(lisbon?.amountCents, 300_000);
assert.equal(lisbon?.dueAt, Date.UTC(2027, 2, 1));
assert.match(lisbon?.detail ?? '', /^\$800\.00 set aside of \$3,000\.00$/);
assert.match(
  runwayHorizon.find((record) => record.title === 'Someday')?.detail ?? '',
  /^\$0\.00 set aside of /,
);
assert.equal(
  runwayHorizon.find((record) => record.title === 'Someday')?.dueAt,
  null,
);

const runwayOutput = JSON.stringify([
  ...runwayMoney,
  ...runwayBills,
  ...runwayHorizon,
]);
[...RUNWAY_FORBIDDEN, runwayKey.key.toString('hex'), '987654', '555'].forEach(
  (secret) =>
    assert.ok(!runwayOutput.includes(secret), `Runway output has ${secret}`),
);

// No summary, a legacy plan or a key that will not open is unknown, so older copies stay.
await Promise.all(
  [OTHER, 'runway-legacy', WRONG_RUNWAY_UID].map(async (uid) => {
    const page = await readRunway(uid, 'moneySummary');
    assert.deepEqual(page.records, [], uid);
    assert.equal(page.isFull, false, uid);
  }),
);

// A summary cleared on purpose is a full, empty read, so older copies go.
await Promise.all(
  ['moneySummary', 'upcomingBills', 'horizon'].map(async (category) => {
    const page = await readRunway('runway-cleared', category);
    assert.deepEqual(page.records, [], category);
    assert.equal(page.isFull, true, category);
  }),
);
const badTotal = await readRunway('runway-bad-total', 'moneySummary');
assert.deepEqual(badTotal.records, []);
assert.equal(badTotal.isFull, false, 'a malformed total is unknown');
await Promise.all(
  ['upcomingBills', 'horizon'].map(async (category) => {
    const twins = (await runRunway('runway-twins', category)).map(
      (record) => record.sourceRef,
    );
    assert.equal(twins.length, 2, category);
    assert.equal(new Set(twins).size, 2, `${category} twins stay distinct`);
  }),
);
await assert.rejects(() => readRunway(OWNER, 'nothing'), /Unknown category/);
assert.equal(await runwayAdapter.status(runwayCtx(OWNER)), 'ok');
assert.equal(await runwayAdapter.status(runwayCtx(OTHER)), 'noAccess');
assert.equal(
  runwayAdapter.deepLink('plan/summary', runwayCtx(OWNER)),
  '/runway',
);

const dayText = (at: number) => new Date(at).toISOString().slice(0, 10);
const TX_SECRETS = [
  'TX NOTE SECRET',
  'TX RECEIPT SECRET',
  'https://tx-link.example/secret',
  'tx-card-secret',
  'tx-account-secret',
  'TX BANK NAME SECRET',
];
const sealTx = (fields: Record<string, unknown>) =>
  sealWithKey({ ...runwayKey, keyVersion: 1 }, fields, 1);
const baseTx = {
  merchant: null,
  label: null,
  note: null,
  bankName: null,
  category: null,
  lines: [] as unknown[],
  refundOfId: null,
  incomeDayId: null,
  pairedWithId: null,
  pairKind: null,
  cardPaymentMoveId: null,
  paidByCardId: null,
  link: null,
  receiptText: null,
};
const txDoc = (
  uid: string,
  id: string,
  daysAgo: number,
  fields: Record<string, unknown>,
  docFields: Record<string, unknown> = {},
) =>
  runwayPlans
    .doc(uid)
    .collection('purchases')
    .doc(id)
    .set({
      date: TODAY - daysAgo * DAY,
      accountId: TX_SECRETS[4],
      sealed: sealTx({ ...baseTx, ...fields }),
      ...docFields,
    });
const txLine = (envelopeId: string | null, cents: number) => ({
  envelopeId,
  cents,
  via: 'direct',
});
const txVersion = (id: string, createdAt: number, name: string) =>
  runwayPlans
    .doc(OWNER)
    .collection('versions')
    .doc(id)
    .set({
      itemId: 'env-groceries',
      kind: 'envelope',
      createdAt,
      sealed: sealTx({ name }),
    });
const TX_RICH = {
  note: TX_SECRETS[0],
  receiptText: TX_SECRETS[1],
  link: TX_SECRETS[2],
  paidByCardId: TX_SECRETS[3],
  bankName: TX_SECRETS[5],
};
await Promise.all([
  txDoc(OWNER, 'costco-1', 18, {
    ...TX_RICH,
    merchant: 'Costco Wholesale',
    amountCents: 8_800,
    lines: [txLine('env-groceries', 8_800)],
  }),
  txDoc(OWNER, 'costco-2', 3, {
    ...TX_RICH,
    label: 'Gas at Costco',
    merchant: 'Shell',
    amountCents: 1_200,
    lines: [txLine(null, 1_200)],
  }),
  txDoc(OWNER, 'costco-refund', 1, {
    ...TX_RICH,
    merchant: 'Costco Wholesale',
    amountCents: -500,
    refundOfId: 'costco-1',
    lines: [txLine('env-groceries', -500)],
  }),
  txDoc(OWNER, 'deposit', 2, {
    merchant: 'Costco Payroll',
    amountCents: -250_000,
    incomeDayId: 'day-1',
  }),
  txDoc(OWNER, 'unlinked-credit', 2, {
    merchant: 'Costco Gift Card',
    amountCents: -900,
  }),
  txDoc(OWNER, 'transfer-out', 4, {
    merchant: 'Costco Savings Transfer',
    amountCents: 30_000,
    pairedWithId: 'transfer-in',
    pairKind: 'transfer',
  }),
  txDoc(OWNER, 'transfer-in', 4, {
    merchant: 'Costco Savings Transfer',
    amountCents: -30_000,
    pairedWithId: 'transfer-out',
    pairKind: 'transfer',
  }),
  txDoc(OWNER, 'card-payment', 5, {
    merchant: 'Costco Card Payment',
    amountCents: 20_000,
    pairedWithId: 'card-side',
    cardPaymentMoveId: 'move-1',
  }),
  txDoc(OWNER, 'bill-charge', 7, {
    merchant: 'Costco Insurance',
    amountCents: 2_500,
    billRef: { billId: 'bill-1', dueOn: '2026-11-01' },
  }),
  txDoc(
    OWNER,
    'waiting-credit',
    8,
    { merchant: 'Costco Waiting Credit', amountCents: -1_100 },
    { needsHome: true },
  ),
  txDoc(
    OWNER,
    'waiting-charge',
    9,
    { merchant: "Trader Joe's", amountCents: 1_900 },
    { needsHome: true },
  ),
  txDoc(OWNER, 'target', 6, {
    merchant: 'Target',
    amountCents: 4_000,
    lines: [txLine('env-groceries', 3_000), txLine('env-fun', 1_000)],
  }),
  txDoc(OWNER, 'old', 100, { merchant: 'Costco Wholesale', amountCents: 700 }),
  txDoc(OWNER, 'ancient', 430, {
    merchant: 'Costco Wholesale',
    amountCents: 600,
  }),
  txVersion('v-1', 1, 'Groceries'),
  txVersion('v-2', 2, 'Food'),
]);
const queryTx = (uid: string, args: unknown) =>
  runwayAdapter.query!(runwayCtx(uid), { category: 'transactions', args });
const costco = await queryTx(OWNER, {
  payee: 'costco',
  from: dayText(TODAY - 30 * DAY),
  to: dayText(TODAY),
});
assertShape(costco.records);
assert.deepEqual(
  costco.records.map((record) => [record.title, record.amountCents]),
  [
    ['Costco Wholesale', -500],
    ['Costco Gift Card', -900],
    ['Gas at Costco', 1_200],
    ['Costco Insurance', 2_500],
    ['Costco Wholesale', 8_800],
  ],
  'newest first; deposits and pairs are left out, a credit, a bill charge and a charge with no lines stay in',
);
assert.equal(costco.matchedCount, 5);
assert.equal(costco.totalCents, 11_100, 'a refund and a credit subtract');
assert.equal(costco.from, dayText(TODAY - 30 * DAY));
assert.equal(costco.to, dayText(TODAY));
assert.equal(costco.currency, 'USD');
assert.equal(costco.isPartial, false);
costco.records.forEach((record) => {
  assert.equal(record.kind, 'transaction');
  assert.equal(record.currency, 'USD');
  assert.equal(record.isAllDay, true);
  assert.deepEqual(Object.keys(record.extra), ['category']);
  assert.equal(record.subtitle, null);
  assert.equal(record.detail, null);
  assert.equal(record.placeLabel, null);
  assert.match(record.sourceRef, /^purchases\/[0-9a-f]{16}$/);
});
assert.deepEqual(
  costco.records.map((record) => record.extra.category),
  ['Food', 'Free to Spend', 'Free to Spend', 'Bill', 'Food'],
  'the envelope is named by its newest version',
);
assert.equal(costco.records[4]?.startAt, TODAY - 18 * DAY);
const costcoOutput = JSON.stringify(costco);
[...TX_SECRETS, 'Costco Payroll', 'Savings Transfer', 'Card Payment'].forEach(
  (secret) =>
    assert.ok(!costcoOutput.includes(secret), `Transactions have ${secret}`),
);
const apostrophe = await queryTx(OWNER, { payee: 'Trader Joes' });
assert.deepEqual(
  apostrophe.records.map((record) => [record.title, record.amountCents]),
  [["Trader Joe's", 1_900]],
  'a payee typed without its apostrophe still fits, and a waiting charge counts',
);
assert.equal((await queryTx(OWNER, { payee: "Trader Joe's" })).matchedCount, 1);
const everyone = await queryTx(OWNER, {
  payee: null,
  from: dayText(TODAY - 30 * DAY),
  to: dayText(TODAY),
});
assert.deepEqual(
  everyone.records
    .filter((record) => record.title === 'Target')
    .map((record) => record.extra.category),
  ['Split'],
);
assert.equal(
  (await queryTx(OWNER, { payee: 'Cheesecake Factory' })).matchedCount,
  0,
);
assert.equal(
  (await queryTx(OWNER, {})).matchedCount,
  everyone.matchedCount,
  'no range is the last 30 days',
);
assert.equal(
  (await queryTx(OWNER, 'garbage')).matchedCount,
  everyone.matchedCount,
  'malformed arguments fall back to the defaults',
);
const longRange = await queryTx(OWNER, {
  payee: 'Costco Wholesale',
  from: '2020-01-01',
  to: dayText(TODAY),
});
assert.equal(longRange.matchedCount, 3, 'the oldest 13+ months are cut off');
assert.equal(longRange.from, '2025-10-10', 'the range read is named');
const clamped = await queryTx(OWNER, { from: '2020-01-01', to: '2026-03-31' });
assert.equal(clamped.from, '2025-02-28', '13 months before a 31st clamps');
const edge = (from: string) =>
  queryTx(OWNER, { from, to: '2026-11-30' }).then((read) => read.from);
assert.equal(
  await edge('2025-10-29'),
  '2025-10-30',
  'one day past the cap is cut',
);
assert.equal(
  await edge('2025-10-30'),
  '2025-10-30',
  'the cap day itself stays',
);
assert.equal(await edge('2025-11-15'), '2025-11-15');
const leap = await queryTx(OWNER, { from: '2020-01-01', to: '2025-03-31' });
assert.equal(leap.from, '2024-02-29', 'a leap February keeps its 29th');
const noEnd = await queryTx(OWNER, {});
assert.deepEqual(
  [noEnd.from, noEnd.to],
  [dayText(TODAY - 30 * DAY), dayText(TODAY)],
  'no range names the default days',
);
const monthEnd = await queryTx(OWNER, { to: '2026-12-31' });
assert.equal(
  monthEnd.from,
  '2026-12-01',
  'a 31-day month ends 30 days after its first',
);
assert.deepEqual(
  (await queryTx(OWNER, { from: '2026-11-09', to: '2026-11-01' })).records,
  [],
  'a backwards range is empty',
);
await assert.rejects(
  () =>
    runwayAdapter.query!(runwayCtx(OWNER), {
      category: 'moneySummary',
      args: {},
    }),
  /Unknown category/,
);

const ENVELOPE_SECRETS = ['ENV BALANCE 987654', 'ENV MAX 777777'];
const envItem = (
  uid: string,
  id: string,
  fields: Record<string, unknown> = {},
) =>
  runwayPlans
    .doc(uid)
    .collection('items')
    .doc(id)
    .set({
      kind: 'envelope',
      createdAt: 1,
      endedAt: null,
      archivedAt: null,
      ...fields,
    });
const envVersion = (
  uid: string,
  id: string,
  itemId: string,
  createdAt: number,
  name: string,
  kind = 'envelope',
) =>
  runwayPlans
    .doc(uid)
    .collection('versions')
    .doc(id)
    .set({
      itemId,
      kind,
      createdAt,
      sealed: sealTx({
        name,
        startingCents: 987_654,
        maxCents: 777_777,
        balance: ENVELOPE_SECRETS[0],
      }),
    });
await Promise.all([
  envItem(OWNER, 'env-groceries'),
  envItem(OWNER, 'env-fun'),
  envItem(OWNER, 'env-archived', { archivedAt: NOW }),
  envItem(OWNER, 'env-ended', { endedAt: dayText(TODAY - DAY) }),
  envItem(OWNER, 'env-ending-soon', { endedAt: dayText(TODAY + DAY) }),
  envItem(OWNER, 'bill-rent', { kind: 'bill' }),
  envVersion(OWNER, 'ev-fun', 'env-fun', 1, 'Fun'),
  envVersion(OWNER, 'ev-archived', 'env-archived', 1, 'Old Fund'),
  envVersion(OWNER, 'ev-ended', 'env-ended', 1, 'Ended'),
  envVersion(OWNER, 'ev-soon', 'env-ending-soon', 1, 'Ending soon'),
  envVersion(OWNER, 'ev-rent', 'bill-rent', 1, 'Rent', 'bill'),
]);
const envelopes = await runRunway(OWNER, 'envelopes');
assert.deepEqual(
  titles(envelopes),
  ['Ending soon', 'Food', 'Fun'],
  'live envelopes by their newest name; archived, ended and bills are left out',
);
envelopes.forEach((record) => {
  assert.equal(record.kind, 'artifact');
  assert.equal(record.amountCents, null);
  assert.equal(record.currency, null);
  assert.equal(record.dueAt, null);
  assert.deepEqual(record.extra, {});
  assert.match(record.sourceRef, /^envelopes\/[0-9a-f]{16}$/);
});
assert.equal(new Set(refs(envelopes)).size, envelopes.length);
const envelopeOutput = JSON.stringify(envelopes);
[...ENVELOPE_SECRETS, '987654', '777777', 'Rent', 'Old Fund'].forEach(
  (secret) =>
    assert.ok(!envelopeOutput.includes(secret), `Envelopes have ${secret}`),
);
await Promise.all(
  [OTHER, 'runway-legacy'].map(async (uid) => {
    const page = await readRunway(uid, 'envelopes');
    assert.deepEqual(page.records, [], uid);
    assert.equal(page.isFull, false, uid);
  }),
);
const noEnvelopes = await readRunway('runway-cleared', 'envelopes');
assert.deepEqual(noEnvelopes.records, []);
assert.equal(
  noEnvelopes.isFull,
  true,
  'a plan with none is a full, empty read',
);
await runwayPlanWith('runway-env-bad', null);
await Promise.all([
  envItem('runway-env-bad', 'e1'),
  envItem('runway-env-bad', 'e2'),
  envVersion('runway-env-bad', 'v1', 'e1', 1, 'Good'),
  runwayPlans
    .doc('runway-env-bad')
    .collection('versions')
    .doc('v2')
    .set({
      itemId: 'e2',
      kind: 'envelope',
      createdAt: 1,
      sealed: { value: 'garbage', nonce: 'garbage' },
    }),
]);
const badEnvelope = await readRunway('runway-env-bad', 'envelopes');
assert.deepEqual(titles(badEnvelope.records), ['Good']);
assert.equal(
  badEnvelope.isFull,
  false,
  'a name that will not open makes the read partial',
);

const inRange = { from: dayText(TODAY - 30 * DAY), to: dayText(TODAY) };
const food = await queryTx(OWNER, { ...inRange, category: ' food ' });
assert.deepEqual(
  food.records.map((record) => [record.title, record.amountCents]),
  [
    ['Costco Wholesale', -500],
    ['Target', 4_000],
    ['Costco Wholesale', 8_800],
  ],
  'a split purchase with a line on the envelope matches it',
);
assert.equal(food.matchedCount, 3);
assert.equal(
  food.totalCents,
  11_300,
  "the total covers every match, counting only a split purchase's matching share",
);
const fun = await queryTx(OWNER, { ...inRange, category: 'FUN' });
assert.equal(fun.matchedCount, 1);
assert.equal(fun.totalCents, 1_000, 'a split counts only its share');
assert.equal(
  fun.records[0]?.amountCents,
  4_000,
  'the row keeps the purchase amount',
);
const split = await queryTx(OWNER, { ...inRange, category: 'split' });
assert.deepEqual(
  split.records.map((record) => record.title),
  ['Target'],
);
assert.deepEqual(
  (await queryTx(OWNER, { ...inRange, category: 'bill' })).records.map(
    (record) => record.title,
  ),
  ['Costco Insurance'],
);
const unsorted = await queryTx(OWNER, {
  ...inRange,
  category: 'free to spend',
});
assert.deepEqual(
  unsorted.records.map((record) => record.title),
  ['Gas at Costco', "Trader Joe's"],
  'a waiting charge counts in Free to Spend; one left out of spending never matches a category',
);
assert.equal(unsorted.totalCents, 3_100);
assert.equal(
  (await queryTx(OWNER, { ...inRange, category: 'Nothing here' })).matchedCount,
  0,
);
assert.equal(
  (await queryTx(OWNER, { ...inRange, category: 'food', payee: 'target' }))
    .matchedCount,
  1,
  'a category and a payee both apply',
);
assert.equal(
  (await queryTx(OWNER, { ...inRange, category: null })).matchedCount,
  everyone.matchedCount,
  'no category is every category',
);
assert.equal(
  (await queryTx(OWNER, { ...inRange, category: '' })).matchedCount,
  everyone.matchedCount,
);
const filtered = JSON.stringify([food, split, unsorted]);
[...TX_SECRETS, ...ENVELOPE_SECRETS, '987654', '777777'].forEach((secret) =>
  assert.ok(!filtered.includes(secret), `Filtered rows have ${secret}`),
);

await runwayPlanWith('runway-many', null);
await Promise.all(
  Array.from({ length: 25 }, (_, index) =>
    txDoc('runway-many', `bulk-${index}`, index % 20, {
      merchant: 'Bulk Mart',
      amountCents: 100,
    }),
  ),
);
const many = await queryTx('runway-many', { payee: 'Bulk Mart' });
assert.equal(many.records.length, 20);
assert.equal(many.matchedCount, 25);
assert.equal(many.totalCents, 2_500);
assert.equal(many.currency, null, 'no currency is known, so none is made up');
const manyDays = many.records.map((record) => record.startAt ?? 0);
assert.deepEqual(
  manyDays,
  [...manyDays].sort((a, b) => b - a),
);

await runwayPlanWith('runway-huge', null);
await Promise.all(
  [0, 1].map(async (half) => {
    const batch = firestore.batch();
    Array.from({ length: 255 }, (_, index) => {
      batch.set(
        runwayPlans
          .doc('runway-huge')
          .collection('purchases')
          .doc(`huge-${half}-${index}`),
        {
          date: TODAY - (index % 25) * DAY,
          sealed: sealTx({ ...baseTx, merchant: 'Huge', amountCents: 10 }),
        },
      );
    });
    await batch.commit();
  }),
);
const huge = await queryTx('runway-huge', { payee: 'Huge' });
assert.equal(huge.matchedCount, 500);
assert.equal(huge.isPartial, true);

await runwayPlanWith('runway-unreadable', null);
await Promise.all([
  txDoc('runway-unreadable', 'fine', 1, { merchant: 'Fine', amountCents: 100 }),
  runwayPlans
    .doc('runway-unreadable')
    .collection('purchases')
    .doc('garbled')
    .set({ date: TODAY - DAY, sealed: { value: 'x', nonce: 'y' } }),
]);
const unreadable = await queryTx('runway-unreadable', {});
assert.equal(unreadable.matchedCount, 1);
assert.equal(
  unreadable.isPartial,
  true,
  'a purchase that would not open is said',
);
const readable = await queryTx(OWNER, {});
assert.equal(readable.isPartial, false);

await runwayPlanWith('runway-exact', null);
await Promise.all(
  Array.from({ length: 500 }, (_, index) =>
    txDoc('runway-exact', `exact-${index}`, index % 25, {
      merchant: 'Exact',
      amountCents: 10,
    }),
  ),
);
const exact = await queryTx('runway-exact', { payee: 'Exact' });
assert.equal(exact.matchedCount, 500);
assert.equal(exact.isPartial, false, 'exactly the scan cap is not a cut');

await txDoc(WRONG_RUNWAY_UID, 'wrong-key', 1, {
  merchant: 'Costco Wholesale',
  amountCents: 100,
});
const wrongKey = await queryTx(WRONG_RUNWAY_UID, {});
assert.deepEqual(wrongKey.records, []);
assert.equal(
  wrongKey.isPartial,
  true,
  'a purchase that cannot be opened is said',
);
await assert.rejects(() => queryTx(OTHER, {}));

const txGrant = (isOn: boolean, status: string) =>
  firestore.doc('connections/tx-owner/grants/helm__app:runway__site').set({
    readerAppId: 'helm',
    connectorId: 'app:runway',
    accountId: 'site',
    status,
    categories: { transactions: { isOn, changedAt: NOW } },
  });
const routed = (category: string) =>
  querySiteLive(firestore, {
    uid: 'tx-owner',
    readerAppId: 'helm',
    connectorId: 'app:runway',
    category,
    args: {},
  });
await txGrant(false, 'live');
assert.deepEqual(await routed('transactions'), {
  ok: false,
  reason: 'notGranted',
});
await txGrant(true, 'ended');
assert.deepEqual(await routed('transactions'), {
  ok: false,
  reason: 'notGranted',
});
await txGrant(true, 'live');
assert.deepEqual(await routed('moneySummary'), {
  ok: false,
  reason: 'notGranted',
});
assert.deepEqual(
  await querySiteLive(firestore, {
    uid: 'tx-owner',
    readerAppId: 'helm',
    connectorId: 'google:gmail',
    category: 'transactions',
    args: {},
  }),
  { ok: false, reason: 'notGranted' },
);

// A plan's key reaches the adapter only through the shared unwrap.
const runwayShareDir = new URL(
  '../../functions/src/apps/runway/share/',
  import.meta.url,
);
readdirSync(runwayShareDir)
  .filter((file) => file.endsWith('.ts'))
  .forEach((file) => {
    const source = readFileSync(new URL(file, runwayShareDir), 'utf8');
    assert.ok(!/appKeys\/wrap/.test(source), `${file} imports the key wrap`);
    assert.ok(
      !/unwrapDataKey|unwrapStoredKey|wrapDataKey/.test(source),
      `${file} unwraps a key itself`,
    );
    [
      ...source.matchAll(
        /import\s*\{([^}]*)\}\s*from\s*'([^']*getRunwayKey[^']*)'/g,
      ),
    ].forEach(([, names]) =>
      assert.deepEqual(
        (names ?? '')
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
          .sort(),
        ['RUNWAY_MASTER_KEYS', 'loadKeyring'],
        `${file} takes only the keyring from the key file`,
      ),
    );
  });

// Google Contacts: a live, pick-only source that copies nothing on its own.
process.env.FUNCTIONS_EMULATOR = 'true';
const contactsAdapter = createGoogleContactsAdapter();
assert.deepEqual(
  contactsAdapter.manifest.categories.map((category) => category.mode),
  ['live'],
);
const contactPage = await contactsAdapter.syncPage(waitCtx(OWNER), {
  category: 'contacts',
  cursor: null,
  resumeState: null,
  windowStart: WINDOW_START,
});
assert.deepEqual(contactPage.records, []);
assert.equal(contactPage.isDone, true);

const personal = await listContacts('fixture', 'personal@example.com');
assert.ok(personal.length > 1);
assert.ok(
  personal.every((contact) => isContactRef(contact.resourceName)),
  'every listed contact has a well-formed name',
);
const picked = personal[0];
assert.ok(picked);
assert.deepEqual(
  (
    await readContacts('fixture', 'personal@example.com', [
      picked.resourceName,
      'people/../../etc',
      'people/not-a-real-contact',
    ])
  ).map((contact) => contact.resourceName),
  [picked.resourceName],
  'a forged name is ignored and only the real one is read',
);
assert.notDeepEqual(
  (await listContacts('fixture', 'work@example.com')).map(
    (contact) => contact.resourceName,
  ),
  personal.map((contact) => contact.resourceName),
  'each account lists its own contacts',
);
const option = toContactOption(picked);
assert.deepEqual(Object.keys(option).sort(), [
  'colour',
  'detail',
  'id',
  'isOnByDefault',
  'isPrimary',
  'name',
  'photoUrl',
]);
assert.ok(isGooglePhotoUrl('https://lh3.googleusercontent.com/a/photo=s100'));
[
  'http://lh3.googleusercontent.com/a',
  'https://evil.example.com/a',
  'https://lh3.googleusercontent.com.evil.com/a',
  'https://lh3.googleusercontent.com:8443/a',
  'https://169.254.169.254/latest',
  'not a url',
].forEach((url) => assert.equal(isGooglePhotoUrl(url), false, url));

console.log('Adapter matrix passed.');

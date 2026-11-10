// Run against the Firestore emulator: `npm run check:adapters`.
import assert from 'node:assert/strict';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { createAListAdapter } from '../../functions/src/apps/a-list/share/adapter.ts';
import { createGoingOnceAdapter } from '../../functions/src/apps/going-once/share/adapter.ts';
import { createPinchAdapter } from '../../functions/src/apps/pinch/share/adapter.ts';
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
      ...priced,
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
      categoryIds: ['plannedMeals', 'shoppingList', 'useSoon'],
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

const all = [...meals, ...lines, ...soon];
assertShape(all);
all.forEach((record) => {
  const values = flatten(record);
  assert.ok(
    !values.includes(SECRET_PRICE) &&
      !values.includes(777) &&
      !values.includes(999),
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
  { plannedMeals: true, shoppingList: true, useSoon: true },
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
  'plannedMeals',
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

const membership = (uid: string, path: string) =>
  firestore.doc(`apps/a-list/memberships/${uid}/${path}`);

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
    showing('PLANNED', 'Galaxy Drift', NOW + 2 * DAY, { theatre: null }),
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
      categoryIds: ['plannedShowings', 'savedTheaters', 'seenMovies'],
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
assert.deepEqual(refs(seen), ['viewings/v-seen']);
assert.equal(seen[0].kind, 'knowledge');
assert.equal(seen[0].title, 'Dune');
assert.deepEqual(seen[0].extra, { rating: 4.5 });
await assert.rejects(() => runAList(OWNER, 'nothing'), /Unknown category/);

const aListAll = [...showings, ...theaters, ...seen];
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
  ['plannedShowings', 'savedTheaters', 'seenMovies'].map((category) =>
    runAList(OTHER, category),
  ),
);
assert.deepEqual(otherAList, [[], [], []]);
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
  priceCents: SALE_PRICE,
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
  priceCents: SALE_PRICE,
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
    .set(saleItem('Cast iron pan', 'SOLD', { pending: null })),
  fallSale.collection('inquiries').doc('q1').set({
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
      categoryIds: ['pickups', 'sales'],
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
assert.deepEqual(goingOnceSalesRead[0].extra, {
  available: 2,
  pending: 3,
  sold: 1,
});

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

const goingOnceAll = [...goingOnceSalesRead, ...pickups];
assertShape(goingOnceAll);
goingOnceAll.forEach((record) => {
  const values = flatten(record);
  assert.ok(
    ![FLOOR_PRICE, SALE_PRICE].some((secret) => values.includes(secret)),
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

console.log('Adapter matrix passed.');

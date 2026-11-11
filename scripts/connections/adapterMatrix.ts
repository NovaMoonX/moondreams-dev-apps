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
    lastEditedAt: NOW - 13,
  }),
  careDocs('cats', 'juniper').set({ name: 'Juniper', lastEditedAt: NOW - 14 }),
  careDocs('vetClinics', 'blue-bark').set({
    name: 'Blue Bark Vet',
    phone: '555-0100',
    address: '1 Cat Lane',
    email: 'secret-clinic@example.test',
    notes: CARE_SECRET,
    lastEditedAt: NOW - 15,
  }),
  careDocs('visits', 'next').set(vetVisit(['mochi', 'juniper'])),
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
  careDocs('visits', 'done').set(vetVisit(['mochi'], { status: 'completed' })),
  careDocs('visits', 'nocat').set(vetVisit(['gone-cat'])),
  careDocs('vaccinations', 'rabies').set({
    catId: 'mochi',
    name: 'Rabies',
    history: [{ lotNumber: CARE_SECRET }],
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
    windowStart: WINDOW_START,
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
assert.equal(
  careCats.find((record) => record.sourceRef.endsWith('mochi'))?.title,
  'Mochi',
);

const careVisits = await runNineLives(OWNER, 'vetVisits');
assert.deepEqual(refs(careVisits).sort(), [
  'households/home/visits/custom',
  'households/home/visits/next',
]);
const nextVisit = careVisits.find((record) =>
  record.sourceRef.endsWith('next'),
);
assert.equal(nextVisit?.kind, 'event');
assert.equal(nextVisit?.title, 'Mochi and Juniper: Checkup');
assert.equal(nextVisit?.placeLabel, 'Blue Bark Vet');
assert.equal(nextVisit?.startAt, TODAY + 3 * DAY + 9 * 3_600_000);
assert.equal(nextVisit?.isAllDay, false);
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
assert.equal(
  careDue.find((record) => record.sourceRef.endsWith('flea'))?.title,
  'Mochi and Juniper: Flea and tick',
);

const careClinics = await runNineLives(OWNER, 'clinics');
assert.deepEqual(refs(careClinics), ['households/home/vetClinics/blue-bark']);
assert.equal(careClinics[0].kind, 'place');
assert.equal(careClinics[0].title, 'Blue Bark Vet');
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
          transitDetails: { confirmationCode: TRIP_SECRET },
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
        assignedToUids: [OWNER],
        completeByDayIndex: 0,
      }),
    ),
  nyc
    .collection('checklist')
    .doc('shared')
    .set(task({ title: 'Book dinner', assignedToUids: [OWNER, HOUSEMATE] })),
  nyc
    .collection('checklist')
    .doc('hers')
    .set(task({ title: 'Housemate only', assignedToUids: [HOUSEMATE] })),
  nyc
    .collection('checklist')
    .doc('done')
    .set(task({ title: 'Done', assignedToUids: [OWNER], isCompleted: true })),
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
  firestore
    .doc(`apps/waypoint/personalChecklist/${OWNER}/items/charger`)
    .set(task({ tripId: 'nyc', title: 'Pack charger', completeByDayIndex: 1 })),
  firestore
    .doc(`apps/waypoint/personalChecklist/${OWNER}/items/gone`)
    .set(task({ tripId: 'left', title: 'Left trip to-do' })),
  firestore
    .doc(`apps/waypoint/personalChecklist/${HOUSEMATE}/items/private`)
    .set(task({ tripId: 'nyc', title: 'HOUSEMATE PRIVATE SECRET' })),
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

const waypointCategories = ['trips', 'itinerary', 'myTasks', 'tripBalances'];
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

const waypointAll = [...tripRecords, ...plan, ...tasks, ...balances];
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
) => {
  const box = waitSpaces.doc(space).collection('boxes').doc(id);
  await box.set({
    name: sealed(name, key),
    emoji: sealed(emoji, key),
    description: sealed('SECRET DESCRIPTION'),
    isDefault: false,
    createdBy: OWNER,
    revealHistory: [],
    revealRequestedBy: [],
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
  waitBox('wtw-home', 'trips', 'Trips', '✈️', [false]),
  waitBox('wtw-home', 'empty', 'Gifts', '🎁', []),
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
  return [record.title, record.subtitle, record.extra];
};
assert.deepEqual(countsOf('spaces/wtw-home/boxes/dates'), [
  'Date ideas',
  '🍿',
  { items: 3, revealed: 2, notYetRevealed: 1 },
]);
assert.deepEqual(countsOf('spaces/wtw-home/boxes/trips'), [
  'Trips',
  '✈️',
  { items: 1, revealed: 0, notYetRevealed: 1 },
]);
assert.deepEqual(countsOf('spaces/wtw-home/boxes/empty'), [
  'Gifts',
  '🎁',
  { items: 0, revealed: 0, notYetRevealed: 0 },
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
        typeof value === 'string' &&
        /SECRET|INVITE|invite|description/i.test(value),
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

// Runway: one sealed summary opened under the plan's key; only totals and names leave.
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

const runwayAdapter = createRunwayAdapter({
  firestore: () => firestore,
  canOpen: async (uid) => uid === OWNER,
  keyring: () => DEV_KEYRING,
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
  ],
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
assert.match(summaryRecord.detail ?? '', /450\.00 USD.*2026-11-15/);
assert.deepEqual(titles(runwayBills), ['Phone', 'Rent']);
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
assert.match(lisbon?.detail ?? '', /800\.00 USD set aside of 3000\.00 USD/);
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
await assert.rejects(() => readRunway(OWNER, 'nothing'), /Unknown category/);
assert.equal(await runwayAdapter.status(runwayCtx(OWNER)), 'ok');
assert.equal(await runwayAdapter.status(runwayCtx(OTHER)), 'noAccess');
assert.equal(
  runwayAdapter.deepLink('plan/summary', runwayCtx(OWNER)),
  '/runway',
);

// Runway's key reaches the adapter only through the plan-key file's unwrap.
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

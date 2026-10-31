import assert from 'node:assert/strict';

import {
  announceCookingSession,
  askIfCookingSessionLive,
} from '../../src/apps/pinch/lib/cookingSessionPresence.ts';
import {
  clearCookingSession,
  readCookingSession,
  writeCookingSession,
} from '../../src/apps/pinch/lib/cookingSessionStorage.ts';
import { MAX_COOK_TIMERS } from '../../src/apps/pinch/constants.ts';
import type { ResumeTimer } from '../../src/apps/pinch/types.ts';
import {
  type LoadedPlannedMeals,
  applyResumePositions,
  buildCookingSnapshot,
  getCookingSessionKey,
  getResumeTimerLine,
  getTimerReminderIds,
  parseCookingSnapshot,
  resolveCookingResume,
} from '../../src/apps/pinch/utils/cookSession.ts';
import {
  getTimerBuzzOffer,
  getTimerPushAction,
  needsTimerPush,
} from '../../src/apps/pinch/utils/cooks.ts';
import {
  applyWhyChoice,
  getChangeTopics,
  getDraftChanges,
  getWhyChoices,
  isWhyAsked,
  type RecipeContent,
} from '../../src/apps/pinch/utils/recipeChanges.ts';
import { formatClock } from '../../src/utils/durationUtils.ts';
import { clearViewerSessions } from '../../src/utils/viewerSessionUtils.ts';

const NOW = Date.UTC(2026, 9, 16, 19, 30);
const MIN = 60_000;
const UID = 'alex';

const MEAL_DAY = Date.UTC(2026, 9, 16);
const running: ResumeTimer = {
  recipeId: 'adobo',
  stepNumber: 1,
  name: null,
  label: '30 min',
  durationMs: 30 * MIN,
  status: 'running',
  startedAt: NOW - 5 * MIN,
  endsAt: NOW + 25 * MIN,
  reminderId: 'push-1',
};
const paused: ResumeTimer = {
  recipeId: 'adobo',
  stepNumber: 2,
  name: null,
  label: '25 min',
  durationMs: 25 * MIN,
  status: 'paused',
  remainingMs: 12 * MIN + 30_000,
};
const done: ResumeTimer = {
  recipeId: 'rice',
  stepNumber: 1,
  name: null,
  label: '20 min',
  durationMs: 20 * MIN,
  status: 'done',
  endedAt: NOW - 3 * MIN,
};

const build = (overrides: { timers?: ResumeTimer[]; now?: number } = {}) =>
  buildCookingSnapshot({
    uid: UID,
    sessionId: 'session-1',
    now: overrides.now ?? NOW,
    open: {
      recipeId: 'adobo',
      servings: 2,
      plannedMealId: 'meal-1',
      plannedMealDate: MEAL_DAY,
      plate: [
        { recipeId: 'adobo', servings: 2 },
        { recipeId: 'rice', servings: 2 },
      ],
    },
    currentId: 'rice',
    positions: {
      adobo: { stepIndex: 2, servings: 4 },
      rice: { stepIndex: 0, servings: 4 },
    },
    timers: overrides.timers ?? [running, paused, done],
  });
const parse = (value: unknown, now = NOW, uid = UID) =>
  parseCookingSnapshot(JSON.stringify(value), uid, now);

// What is saved, field by field
const snapshot = build();
assert.deepEqual(
  parse(snapshot),
  snapshot,
  'a saved session reads back exactly as it was written',
);
const crowded = build({
  timers: [
    {
      ...running,
      id: 't1',
      stepName: 'Marinate the chicken',
      recipeTitle: 'Adobo chicken',
    } as ResumeTimer,
  ],
});
assert.deepEqual(
  Object.keys(crowded.resume.timers[0]).sort(),
  [
    'durationMs',
    'endsAt',
    'label',
    'name',
    'recipeId',
    'reminderId',
    'startedAt',
    'status',
    'stepNumber',
  ],
  'a timer is saved by named fields only, so nothing it happens to carry is kept',
);
assert.deepEqual(
  Object.keys(snapshot).sort(),
  ['open', 'resume', 'savedAt', 'sessionId', 'uid', 'version'],
  'the session holds ids, steps, servings and timers and nothing else',
);

// The push a running timer has scheduled
assert.equal(
  snapshot.resume.timers[0].status === 'running' &&
    snapshot.resume.timers[0].reminderId,
  'push-1',
  'a running timer is saved with the id of its push',
);
const readTimer = (timer: unknown) =>
  parse({ ...snapshot, resume: { ...snapshot.resume, timers: [timer] } })
    ?.resume.timers[0];
const kitchen: ResumeTimer = {
  recipeId: null,
  stepNumber: 0,
  name: 'Pasta water',
  label: '10 min',
  durationMs: 10 * MIN,
  status: 'running',
  startedAt: NOW - MIN,
  endsAt: NOW + 9 * MIN,
  reminderId: 'push-2',
};
assert.deepEqual(
  [
    readTimer(kitchen),
    readTimer({ ...kitchen, status: 'paused', remainingMs: 4 * MIN }),
    readTimer({ ...kitchen, name: null }),
    readTimer({ ...kitchen, name: '' }),
    readTimer({ ...kitchen, name: 'x'.repeat(41) }),
    readTimer({ ...kitchen, name: 7 }),
    readTimer({ ...kitchen, stepNumber: 2 }),
  ],
  [
    kitchen,
    {
      recipeId: null,
      stepNumber: 0,
      name: 'Pasta water',
      label: '10 min',
      durationMs: 10 * MIN,
      status: 'paused',
      remainingMs: 4 * MIN,
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ],
  'a timer the person set is saved with its name and no dish, and one with no name, a name past the cap or a step is refused',
);
const withoutName = Object.fromEntries(
  Object.entries(running).filter(([key]) => key !== 'name'),
);
assert.deepEqual(
  [readTimer(withoutName), readTimer({ ...running, name: 'Pasta water' })],
  [running, running],
  'a timer saved before kitchen timers reads with no name, and a dish’s timer never keeps one',
);
assert.deepEqual(
  getTimerReminderIds([running, kitchen]),
  ['push-1', 'push-2'],
  'a kitchen timer’s push is kept or let go like any other',
);
const withoutPush = Object.fromEntries(
  Object.entries(running).filter(([key]) => key !== 'reminderId'),
);
assert.deepEqual(
  readTimer(withoutPush),
  { ...withoutPush, reminderId: null },
  'a timer saved before pushes were kept reads with none',
);
assert.equal(
  readTimer({ ...running, reminderId: '../users/alex' }),
  undefined,
  'a push id that is not an id is refused',
);
assert.equal(
  readTimer({ ...running, reminderId: 7 }),
  undefined,
  'a push id that is not text is refused',
);
assert.deepEqual(
  readTimer({ ...paused, reminderId: 'push-1' }),
  paused,
  'only a running timer keeps a push',
);
assert.deepEqual(
  getTimerReminderIds([
    running,
    paused,
    done,
    { ...running, reminderId: null },
  ]),
  ['push-1'],
  'the pushes of a saved session are those of its running timers that have one',
);

// What a timer's push needs
const push = { isOn: true, isHidden: false };
const ahead = { status: 'running', endsAt: NOW + MIN } as const;
assert.equal(
  getTimerPushAction(ahead, NOW + MIN, push),
  'keep',
  'a running timer at the deadline it was scheduled for keeps its push',
);
assert.equal(
  getTimerPushAction(ahead, NOW + 2 * MIN, push),
  'cancel',
  'a timer moved to another deadline drops the old push',
);
assert.equal(
  getTimerPushAction(ahead, NOW + MIN, { ...push, isOn: false }),
  'cancel',
  'switching timer pushes off cancels it',
);
assert.equal(
  getTimerPushAction({ status: 'paused' }, NOW + MIN, push),
  'cancel',
  'a paused timer drops its push',
);
assert.equal(
  getTimerPushAction(undefined, NOW + MIN, push),
  'cancel',
  'a dismissed timer drops its push',
);
assert.equal(
  getTimerPushAction({ status: 'done' }, NOW + MIN, push),
  'cancel',
  'a timer that ended while the page was open rings by itself, so its push is cancelled',
);
assert.equal(
  getTimerPushAction({ status: 'done' }, NOW + MIN, {
    ...push,
    isHidden: true,
  }),
  'leave',
  'a timer that ended while the page was hidden leaves its push to go out',
);
assert.equal(
  needsTimerPush(ahead, NOW),
  true,
  'a timer ahead of its deadline gets a push',
);
assert.equal(
  needsTimerPush({ status: 'running', endsAt: NOW }, NOW),
  false,
  'one picked up exactly at its end has rung already',
);
assert.equal(
  needsTimerPush({ status: 'running', endsAt: NOW - MIN }, NOW),
  false,
  'one picked up past its end is not given a push in the past',
);
assert.equal(
  needsTimerPush({ status: 'paused' }, NOW),
  false,
  'a paused timer gets none',
);

const openBefore = Object.fromEntries(
  Object.entries(snapshot.open).filter(([key]) => key !== 'plannedMealDate'),
);
assert.equal(
  parse({ ...snapshot, open: openBefore })?.open.plannedMealDate,
  null,
  'a session saved before the meal day was kept reads with none',
);
assert.equal(
  parse({ ...snapshot, open: { ...snapshot.open, plannedMealDate: 'later' } })
    ?.open.plannedMealDate,
  null,
  'a meal day that is not a time reads as unknown',
);

// When a saved session is not read
assert.equal(parseCookingSnapshot(null, UID, NOW), null);
assert.equal(parseCookingSnapshot('not json', UID, NOW), null);
assert.equal(parseCookingSnapshot('[]', UID, NOW), null);
assert.equal(
  parse(snapshot, NOW, 'jamie'),
  null,
  "another person's session is not read",
);
assert.equal(
  parse({ ...snapshot, version: 2 }),
  null,
  'an unknown version is not read',
);
assert.notEqual(
  parse(snapshot, NOW + 12 * 60 * MIN - 1),
  null,
  'a session just under 12 hours old is read',
);
assert.equal(
  parse(snapshot, NOW + 12 * 60 * MIN + 1),
  null,
  'a session past 12 hours is not read',
);
assert.equal(
  parse(build({ now: NOW + 10 * MIN })),
  null,
  'a session saved in the future (a clock set back) is not read',
);
assert.equal(
  parse({
    ...snapshot,
    resume: { ...snapshot.resume, timers: [{ ...running, status: 'later' }] },
  }),
  null,
  'a timer in a state nobody wrote is refused',
);
assert.equal(
  parse({
    ...snapshot,
    resume: {
      ...snapshot.resume,
      timers: Array.from({ length: MAX_COOK_TIMERS * 2 + 1 }, () => paused),
    },
  }),
  null,
  'a pile of timers past what the screen can hold is refused',
);
assert.equal(
  parse({
    ...snapshot,
    resume: {
      ...snapshot.resume,
      positions: { adobo: { stepIndex: -1, servings: 4 } },
    },
  }),
  null,
  'a step below the first is refused',
);
assert.equal(
  parse({ ...snapshot, open: { ...snapshot.open, servings: 0 } }),
  null,
  'servings of nothing are refused',
);

// What it can be opened as now
const recipes = new Map([
  [
    'adobo',
    { title: 'Adobo chicken', steps: ['a', 'b', 'c'], isArchived: false },
  ],
  [
    'rice',
    { title: 'Cilantro lime rice', steps: ['a', 'b'], isArchived: false },
  ],
]);
const loadedDays = {
  start: Date.UTC(2026, 7, 1),
  end: Date.UTC(2026, 11, 1),
};
const meals = { ids: new Set(['meal-1']), window: loadedDays };
const none: LoadedPlannedMeals = { ids: new Set<string>(), window: loadedDays };
const plan = resolveCookingResume(snapshot, recipes, meals);
assert.deepEqual(
  plan && [
    plan.title,
    plan.dishTitle,
    plan.stepNumber,
    plan.stepCount,
    plan.open.plannedMealId,
  ],
  ['Adobo chicken & Cilantro lime rice', 'Cilantro lime rice', 1, 2, 'meal-1'],
  'a plate is named by its dishes and the prompt says which dish and step were on screen',
);
assert.deepEqual(
  plan?.resume.timers.length,
  3,
  'every timer of a kept recipe is kept',
);
const withKitchen = resolveCookingResume(
  build({ timers: [running, kitchen, done] }),
  new Map([['adobo', recipes.get('adobo')!]]),
  meals,
);
assert.deepEqual(
  withKitchen?.resume.timers.map((timer) => timer.recipeId),
  ['adobo', null],
  'a timer the person set belongs to no recipe, so it stays when a recipe is deleted',
);
const withoutRice = resolveCookingResume(
  snapshot,
  new Map([['adobo', recipes.get('adobo')!]]),
  meals,
);
assert.deepEqual(
  withoutRice && [
    withoutRice.title,
    withoutRice.dishTitle,
    withoutRice.resume.currentId,
    withoutRice.resume.timers.map((timer) => timer.recipeId),
    withoutRice.open.plate,
    withoutRice.open.servings,
  ],
  [
    'Adobo chicken',
    null,
    'adobo',
    ['adobo', 'adobo'],
    [{ recipeId: 'adobo', servings: 2 }],
    undefined,
  ],
  'a deleted recipe leaves the rest: the dish on screen falls to the first, its timers go with it, and one recipe left is a single cook (with what the plan had for it)',
);
assert.equal(
  resolveCookingResume(snapshot, new Map(), meals),
  null,
  'a session whose recipes are all deleted is ignored',
);
assert.equal(
  resolveCookingResume(
    snapshot,
    new Map([
      ['adobo', { ...recipes.get('adobo')!, isArchived: true }],
      ['rice', { ...recipes.get('rice')!, steps: [] }],
    ]),
    meals,
  ),
  null,
  'an archived recipe and one with no steps count as gone',
);
assert.equal(
  resolveCookingResume(snapshot, recipes, none)?.open.plannedMealId,
  null,
  'a planned meal that is gone (its day is loaded and it is not there) is let go, so Finish does not mark it',
);
const resumeWith = (open: Partial<typeof snapshot.open>, loaded = none) =>
  resolveCookingResume(
    { ...snapshot, open: { ...snapshot.open, ...open } },
    recipes,
    loaded,
  )?.open.plannedMealId;
assert.equal(
  resumeWith({ plannedMealDate: Date.UTC(2026, 11, 1) }),
  'meal-1',
  'a meal on the first day past the loaded days is kept: the calendar just is not showing it',
);
assert.equal(
  resumeWith({ plannedMealDate: Date.UTC(2026, 6, 31) }),
  'meal-1',
  'a meal before the loaded days is kept',
);
assert.equal(
  resumeWith({ plannedMealDate: Date.UTC(2026, 7, 1) }),
  null,
  'a meal on the first loaded day that is not there is gone',
);
assert.equal(
  resumeWith({ plannedMealDate: Date.UTC(2026, 10, 30) }),
  null,
  'a meal on the last loaded day that is not there is gone',
);
assert.equal(
  resumeWith({ plannedMealDate: null }),
  'meal-1',
  'a meal whose day was never saved is kept, since nothing says it is gone',
);
assert.equal(
  resumeWith({}, { ids: new Set(), window: null }),
  'meal-1',
  'before any days are loaded nothing is let go',
);
assert.equal(
  resumeWith({ plannedMealId: null }),
  null,
  'a cook that began without a plan stays without one',
);
const shortened = resolveCookingResume(
  snapshot,
  new Map([
    ['adobo', { title: 'Adobo chicken', steps: ['a', 'b'], isArchived: false }],
    ['rice', recipes.get('rice')!],
  ]),
  meals,
);
assert.deepEqual(
  shortened && [
    shortened.resume.positions.adobo.stepIndex,
    shortened.resume.timers
      .filter((timer) => timer.recipeId === 'adobo')
      .map((timer) => timer.stepNumber),
  ],
  [1, [1, 2]],
  "a step past the recipe's new last one is held to it, and a timer for a step that is gone is dropped",
);
assert.deepEqual(
  applyResumePositions(
    {
      adobo: { stepIndex: 0, servings: 4, gotOut: {} },
      rice: { stepIndex: 0, servings: 2, gotOut: {} },
    },
    { adobo: { stepIndex: 9, servings: 6 } },
    { adobo: 3, rice: 2 },
  ),
  {
    adobo: { stepIndex: 2, servings: 6, gotOut: {} },
    rice: { stepIndex: 0, servings: 2, gotOut: {} },
  },
  'saved positions sit over a fresh start, held to the recipe, and a recipe not saved starts fresh',
);

// What the prompt says about the timers
const line = (timers: ResumeTimer[], at = NOW) =>
  getResumeTimerLine(timers, at, formatClock);
assert.equal(line([running]), 'Timer 25:00 left');
assert.equal(line([running], NOW + 12 * MIN + 30_000), 'Timer 12:30 left');
assert.equal(
  line([running], NOW + 33 * MIN),
  'A timer rang 8 min ago',
  'a timer that ran out while away says how long ago',
);
assert.equal(line([running], NOW + 25 * MIN + 20_000), 'A timer just rang');
assert.equal(line([done]), 'A timer rang 3 min ago');
assert.equal(line([paused]), 'Timer paused with 12:30 left');
assert.equal(
  line([running, paused]),
  'Timer 25:00 left',
  'a running timer is told before a paused one',
);
assert.equal(
  line([running, done]),
  'A timer rang 3 min ago',
  'one that rang is told before one still running',
);
assert.equal(line([]), null);

// Browser storage, working and not
const makeStorage = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};
const storage = makeStorage();
const host = globalThis as unknown as { window: unknown };
host.window = { localStorage: storage, setTimeout, clearTimeout };
writeCookingSession(snapshot);
assert.deepEqual(
  readCookingSession(UID, NOW),
  snapshot,
  'a written session is read back',
);
assert.ok(
  storage.data.has(getCookingSessionKey(UID)),
  'it lives under the per-person key',
);
assert.equal(
  readCookingSession('jamie', NOW),
  null,
  'another person reads their own key, which is empty',
);
assert.equal(readCookingSession(UID, NOW + 12 * 60 * MIN + 1), null);
assert.equal(
  storage.data.has(getCookingSessionKey(UID)),
  false,
  'an expired session is removed when it is found',
);
storage.data.set(getCookingSessionKey(UID), '{"version":1}');
assert.equal(readCookingSession(UID, NOW), null);
assert.equal(
  storage.data.has(getCookingSessionKey(UID)),
  false,
  'a broken session is removed when it is found',
);
writeCookingSession(snapshot);
clearCookingSession(UID);
assert.equal(readCookingSession(UID, NOW), null, 'clearing removes it');

const broken = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};
host.window = { localStorage: broken, setTimeout, clearTimeout };
assert.equal(
  readCookingSession(UID, NOW),
  null,
  'storage that throws reads as no session',
);
assert.doesNotThrow(
  () => writeCookingSession(snapshot),
  'a write that is refused is not an error',
);
assert.doesNotThrow(() => clearCookingSession(UID));
assert.doesNotThrow(() => clearViewerSessions(UID));

// Signing out takes this person's unfinished state and only theirs
class FakeStorage {
  getItem() {
    return null;
  }
  removeItem(key: string) {
    delete (this as unknown as Record<string, string>)[key];
  }
}
const fake = new FakeStorage() as unknown as Record<string, string>;
Object.assign(fake, {
  'pinch:alex:cooking-session': '1',
  'pinch:jamie:cooking-session': '1',
  'pinch:alex:voice:enabled': '1',
  'waypoint:alex:trip-session': '1',
  'pinch:alexander:cooking-session': '1',
});
host.window = { localStorage: fake };
clearViewerSessions('alex');
assert.deepEqual(
  Object.keys(fake).sort(),
  [
    'pinch:alex:voice:enabled',
    'pinch:alexander:cooking-session',
    'pinch:jamie:cooking-session',
  ],
  "signing out removes that person's `-session` keys in every app, and not their preferences or another person's",
);

// Two tabs
host.window = { localStorage: storage, setTimeout, clearTimeout };
const stop = announceCookingSession('session-1');
const asked = (sessionId: string) =>
  new Promise<boolean>((resolve) => {
    askIfCookingSessionLive(sessionId, resolve);
  });
assert.equal(
  await asked('session-1'),
  true,
  'a tab that is cooking answers for its session',
);
assert.equal(
  await asked('session-2'),
  false,
  'a session no tab answers for is not live',
);
stop?.();
assert.equal(
  await asked('session-1'),
  false,
  'once that tab is gone, nothing answers',
);

// The offer under a running timer
assert.equal(
  getTimerBuzzOffer(null, false),
  'none',
  'nothing is offered until the device state is read, so the row never flashes',
);
assert.equal(
  getTimerBuzzOffer('on', true),
  'none',
  'a reachable device with timer pushes on is offered nothing',
);
assert.equal(
  getTimerBuzzOffer('on', false),
  'ask',
  'a reachable device with timer pushes off is asked, and no permission is needed',
);
assert.equal(
  getTimerBuzzOffer('off', false),
  'ask',
  'a device not registered is asked',
);
assert.equal(
  getTimerBuzzOffer('off', true),
  'ask',
  'the setting being on does not reach a device that is not registered',
);
assert.equal(
  getTimerBuzzOffer('blocked', true),
  'blocked',
  'a blocked site is offered the way in, which says why it cannot work',
);
assert.equal(
  getTimerBuzzOffer('unsupported', false),
  'unsupported',
  'a browser that cannot push is offered the way in, which says why',
);

const ingredientLine = (
  id: string,
  ingredientId: string,
  amount: number,
  note: string | null = null,
) => ({
  id,
  ingredientId,
  amount,
  unit: 'TSP' as const,
  note,
  group: null,
});
const changeBase: RecipeContent = {
  title: 'Adobo chicken',
  description: 'Sticky and tangy.',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 35,
  ingredients: [
    ingredientLine('l1', 'salt', 1),
    ingredientLine('l2', 'vinegar', 2),
  ],
  steps: ['Marinate.', 'Simmer for 25 minutes.'],
  nutritionOverride: null,
  sourceId: null,
};
const topicsFor = (patch: Partial<RecipeContent>) =>
  getChangeTopics(changeBase, { ...changeBase, ...patch });

assert.deepEqual(
  topicsFor({
    ingredients: [
      ingredientLine('l1', 'salt', 2),
      ingredientLine('l2', 'vinegar', 2),
    ],
  }),
  { hasIngredients: true, hasSteps: false },
  'a changed amount asks about the ingredients only',
);
assert.deepEqual(
  topicsFor({ ingredients: [changeBase.ingredients[0]] }),
  { hasIngredients: true, hasSteps: false },
  'taking a line out asks about the ingredients',
);
assert.deepEqual(
  topicsFor({ steps: ['Marinate.', 'Simmer for 30 minutes.'] }),
  { hasIngredients: false, hasSteps: true },
  'a reworded step asks about the steps only',
);
assert.deepEqual(
  topicsFor({
    ingredients: [
      ingredientLine('l1', 'salt', 2),
      ingredientLine('l2', 'vinegar', 2),
    ],
    steps: ['Simmer for 25 minutes.', 'Marinate.'],
  }),
  { hasIngredients: true, hasSteps: false },
  'steps only moved around are not asked about',
);
assert.deepEqual(
  topicsFor({
    ingredients: [changeBase.ingredients[1], changeBase.ingredients[0]],
  }),
  { hasIngredients: false, hasSteps: false },
  'ingredients only moved around are not asked about',
);
assert.deepEqual(
  topicsFor({ title: 'Better adobo', servings: 6, cookMinutes: 45 }),
  { hasIngredients: false, hasSteps: false },
  'a new name, servings or time is recorded but never asked about',
);
assert.equal(
  isWhyAsked(topicsFor({ description: 'Tangier.' })),
  false,
  'a description change does not stop a save to ask why',
);
assert.equal(
  isWhyAsked(topicsFor({ steps: ['Marinate.'] })),
  true,
  'a removed step does',
);

const draftChanges = getDraftChanges(
  changeBase,
  {
    ...changeBase,
    ingredients: [
      ...changeBase.ingredients,
      ingredientLine('l3', 'new-lime', 1, 'zest'),
    ],
    newIngredients: [{ id: 'new-lime', name: ' Lime ' }],
    newSource: null,
  },
  new Map([
    ['salt', { name: 'Salt' }],
    ['vinegar', { name: 'Vinegar' }],
  ]),
  new Map(),
);
assert.deepEqual(
  draftChanges.changes,
  ['Added Lime, 1 tsp'],
  'an ingredient the draft is about to create is named by its typed name',
);
assert.equal(draftChanges.topics.hasIngredients, true);

assert.deepEqual(getWhyChoices({ hasIngredients: true, hasSteps: false }), [
  'Tasted better',
  'Ran out of it',
  'Too much',
  'Not enough',
]);
assert.deepEqual(getWhyChoices({ hasIngredients: false, hasSteps: true }), [
  'Easier this way',
  'Faster',
  'Tasted better',
  'Fixing a mistake',
]);
assert.equal(
  getWhyChoices({ hasIngredients: true, hasSteps: true }).length,
  4,
  'there are four reasons whatever changed',
);
const choices = getWhyChoices({ hasIngredients: true, hasSteps: false });
assert.equal(
  applyWhyChoice('', 'Too much', choices),
  'Too much',
  'a chip fills an empty box',
);
assert.equal(
  applyWhyChoice('Too much', 'Not enough', choices),
  'Not enough',
  'a chip replaces another chip',
);
assert.equal(
  applyWhyChoice('The sauce was sharp', 'Too much', choices),
  'The sauce was sharp. Too much',
  'a chip follows what was typed',
);
assert.equal(
  applyWhyChoice('The sauce was sharp.', 'Too much', choices),
  'The sauce was sharp. Too much',
  'and one full stop, not two',
);
assert.equal(
  applyWhyChoice('Too much of it for us', 'too much', choices),
  'Too much of it for us',
  'a chip already in the words is not added again',
);
assert.equal(
  applyWhyChoice('x'.repeat(1995), 'Too much', choices),
  'x'.repeat(1995),
  'a chip that would pass the note’s length is left out',
);

// Tips, notes and changes written on the screen
{
  const written = buildCookingSnapshot({
    ...{
      uid: UID,
      sessionId: 'session-1',
      now: NOW,
      open: {
        recipeId: 'adobo',
        servings: null,
        plannedMealId: null,
        plannedMealDate: null,
        plate: null,
      },
      currentId: 'adobo',
      positions: { adobo: { stepIndex: 1, servings: 4 } },
      timers: [],
    },
    captured: ['0b0f6a3c-1f0e-4a0e-9d4b-2f6d1a1c9e11', 'note-2'],
  });
  assert.deepEqual(
    parse(written)?.resume.captured,
    ['0b0f6a3c-1f0e-4a0e-9d4b-2f6d1a1c9e11', 'note-2'],
    'what was written while cooking is still listed after the screen is picked up',
  );
  const { captured: ignored, ...withoutKey } = written.resume;
  assert.equal(ignored?.length, 2);
  assert.deepEqual(
    parse({ ...written, resume: withoutKey })?.resume.captured,
    [],
    'a session saved before entries were written reads as none',
  );
  assert.deepEqual(
    parse({ ...written, resume: { ...written.resume, captured: [3, '', {}] } })
      ?.resume.captured,
    [],
    'a list that is not ids is dropped without failing the pick-up',
  );
  assert.equal(
    parse({
      ...written,
      resume: {
        ...written.resume,
        captured: Array.from({ length: 61 }, (_, index) => `n${index}`),
      },
    })?.resume.captured?.length,
    0,
    'more than the cap is not trusted',
  );
  assert.equal(
    buildCookingSnapshot({
      uid: UID,
      sessionId: 's',
      now: NOW,
      open: {
        recipeId: 'adobo',
        servings: null,
        plannedMealId: null,
        plannedMealDate: null,
        plate: null,
      },
      currentId: 'adobo',
      positions: {},
      timers: [],
      captured: Array.from({ length: 80 }, (_, index) => `n${index}`),
    }).resume.captured?.length,
    60,
    'a session keeps at most the cap',
  );
}

console.log('cookSession: all checks passed');

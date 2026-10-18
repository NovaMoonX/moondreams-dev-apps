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
import type { ResumeTimer } from '../../src/apps/pinch/types.ts';
import {
  applyResumePositions,
  buildCookingSnapshot,
  getCookingSessionKey,
  getResumeTimerLine,
  parseCookingSnapshot,
  resolveCookingResume,
} from '../../src/apps/pinch/utils/cookSession.ts';
import { formatClock } from '../../src/utils/durationUtils.ts';
import { clearViewerSessions } from '../../src/utils/viewerSessionUtils.ts';

const NOW = Date.UTC(2026, 9, 16, 19, 30);
const MIN = 60_000;
const UID = 'alex';

const running: ResumeTimer = {
  recipeId: 'adobo',
  stepNumber: 1,
  label: '30 min',
  durationMs: 30 * MIN,
  status: 'running',
  startedAt: NOW - 5 * MIN,
  endsAt: NOW + 25 * MIN,
};
const paused: ResumeTimer = {
  recipeId: 'adobo',
  stepNumber: 2,
  label: '25 min',
  durationMs: 25 * MIN,
  status: 'paused',
  remainingMs: 12 * MIN + 30_000,
};
const done: ResumeTimer = {
  recipeId: 'rice',
  stepNumber: 1,
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
    'recipeId',
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
      timers: Array.from({ length: 9 }, () => paused),
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
const meals = new Set(['meal-1']);
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
  resolveCookingResume(snapshot, recipes, new Set())?.open.plannedMealId,
  null,
  'a planned meal that is gone is let go, so Finish does not mark it',
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

console.log('cookSession: all checks passed');

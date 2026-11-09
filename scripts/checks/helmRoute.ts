import assert from 'node:assert/strict';

import {
  AI_LIMITS,
  readLimitHit,
} from '../../functions/src/apps/helm/aiLimits.ts';
import type { HeldReason } from '../../functions/src/apps/helm/aiLimits.ts';
import { combineMessages } from '../../functions/src/apps/helm/nomos/joinedTurn.ts';
import {
  HAND_OVER_TOOL,
  pickRoute,
  runRouted,
  type Route,
} from '../../functions/src/apps/helm/nomos/route.ts';
import type { CaptureReading } from '../../functions/src/apps/helm/nomos/commands.ts';

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, run: () => void | Promise<void>) =>
  tests.push([name, run]);

const quick = (text: string) => pickRoute({ text, mode: 'full' });

test('a short plain turn is quick', () => {
  assert.equal(quick('Add milk'), 'quick');
  assert.equal(quick('done with the dentist'), 'quick');
  assert.equal(quick('thanks'), 'quick');
});

test('length 280 is quick and 281 is full', () => {
  assert.equal(quick('a'.repeat(280)), 'quick');
  assert.equal(quick('a'.repeat(281)), 'full');
  assert.equal(quick(`  ${'a'.repeat(280)}  `), 'quick');
});

test('a question mark anywhere is full', () => {
  assert.equal(quick('Add milk?'), 'full');
  assert.equal(quick('Add milk, ok? and eggs'), 'full');
});

test('each question opener is full, in any case', () => {
  const openers =
    'what when where who whom whose why how which is are am was were do does did can could should would will shall may might have has had'.split(
      ' ',
    );
  openers.forEach((opener) => {
    assert.equal(quick(`${opener} milk on the list`), 'full', opener);
    assert.equal(
      quick(`${opener.toUpperCase()} milk on the list`),
      'full',
      opener,
    );
  });
});

test('an opener inside the turn or as part of a word stays quick', () => {
  assert.equal(quick('Add what we need'), 'quick');
  assert.equal(quick('Whatever, add milk'), 'quick');
  assert.equal(quick('Island trip packing'), 'quick');
});

test('rest mode is always full', () => {
  assert.equal(pickRoute({ text: 'Add milk', mode: 'rest' }), 'full');
});

test('joined messages are judged as one text', () => {
  const reading: CaptureReading = {
    people: [],
    places: [],
    documents: [],
    commands: [],
    isUrgent: false,
    dates: [],
    addressedAs: null,
  };
  const joined = (texts: string[]) =>
    combineMessages(texts.map((text) => ({ text, reading }))).text;
  assert.equal(quick(joined(['Add milk', 'and eggs'])), 'quick');
  assert.equal(quick(joined(['Add milk', 'when is the dentist?'])), 'full');
  assert.equal(quick(joined(['a'.repeat(200), 'b'.repeat(100)])), 'full');
});

const harness = (input: {
  route: Route;
  handsOver?: boolean;
  held?: Partial<Record<Route, HeldReason>>;
}) => {
  const reserved: Route[] = [];
  const ran: [string, boolean][] = [];
  const result = runRouted({
    route: input.route,
    reserve: async (route) => {
      reserved.push(route);
      return input.held?.[route] ?? null;
    },
    runOn: async (role, canHandOver) => {
      ran.push([role, canHandOver]);
      return { handedOver: role === 'quick' && !!input.handsOver, value: role };
    },
  });
  return { result, reserved, ran };
};

test('a quick run that does not hand over reserves once on quick', async () => {
  const { result, reserved, ran } = harness({ route: 'quick' });
  assert.deepEqual(await result, { value: 'quick', route: 'quick' });
  assert.deepEqual(reserved, ['quick']);
  assert.deepEqual(ran, [['quick', true]]);
});

test('a hand-over reserves on quick then full and the full run cannot hand over', async () => {
  const { result, reserved, ran } = harness({
    route: 'quick',
    handsOver: true,
  });
  assert.deepEqual(await result, { value: 'interpret', route: 'full' });
  assert.deepEqual(reserved, ['quick', 'full']);
  assert.deepEqual(ran, [
    ['quick', true],
    ['interpret', false],
  ]);
});

test('a full start reserves once on full and never offers a hand-over', async () => {
  const { result, reserved, ran } = harness({ route: 'full' });
  assert.deepEqual(await result, { value: 'interpret', route: 'full' });
  assert.deepEqual(reserved, ['full']);
  assert.deepEqual(ran, [['interpret', false]]);
});

test('held on quick stops before running', async () => {
  const { result, reserved, ran } = harness({
    route: 'quick',
    held: { quick: 'recentLimit' },
  });
  assert.deepEqual(await result, { held: 'recentLimit' });
  assert.deepEqual(reserved, ['quick']);
  assert.deepEqual(ran, []);
});

test('held on full after a hand-over returns held', async () => {
  const { result, reserved, ran } = harness({
    route: 'quick',
    handsOver: true,
    held: { full: 'dailyLimit' },
  });
  assert.deepEqual(await result, { held: 'dailyLimit' });
  assert.deepEqual(reserved, ['quick', 'full']);
  assert.deepEqual(ran, [['quick', true]]);
});

test('the hand-over tool is named and bounded', () => {
  assert.equal(HAND_OVER_TOOL.name, 'hand_over');
  const reason = (
    HAND_OVER_TOOL.inputSchema.properties as Record<
      string,
      { maxLength: number }
    >
  ).reason;
  assert.equal(reason.maxLength, 120);
});

test('each route holds at its own limits, the day first', () => {
  (['quick', 'full'] as const).forEach((route) => {
    const { perWindow, perDay } = AI_LIMITS[route];
    assert.equal(readLimitHit(route, perDay - 1, perWindow - 1), null);
    assert.equal(readLimitHit(route, 0, perWindow), 'recentLimit');
    assert.equal(readLimitHit(route, perDay, 0), 'dailyLimit');
    assert.equal(readLimitHit(route, perDay, perWindow), 'dailyLimit');
  });
  assert.deepEqual(AI_LIMITS, {
    quick: { perWindow: 60, perDay: 400 },
    full: { perWindow: 20, perDay: 150 },
  });
  assert.equal(readLimitHit('quick', 100, 25), null);
  assert.equal(readLimitHit('full', 100, 25), 'recentLimit');
});

const failures: string[] = [];
for (const [name, run] of tests) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(
      `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
    );
  }
}
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);

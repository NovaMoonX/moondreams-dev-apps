import assert from 'node:assert/strict';

import { buildContext } from '../../functions/src/apps/helm/nomos/buildContext.ts';
import type {
  CaptureReading,
  DateSpan,
} from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  combineMessages,
  interpretWithJoins,
  type JoinedRead,
} from '../../functions/src/apps/helm/nomos/joinedTurn.ts';
import { summarize } from '../../functions/src/apps/helm/nomos/summaries.ts';

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, run: () => void | Promise<void>) =>
  tests.push([name, run]);

const READING: CaptureReading = {
  people: [],
  places: [],
  documents: [],
  commands: [],
  isUrgent: false,
  dates: [],
  addressedAs: null,
};
const span = (id: string, text: string, start: number): DateSpan => ({
  id,
  text,
  start,
  end: start + text.length,
  due: { kind: 'day', date: Date.UTC(2026, 10, 14) },
});
const context = {
  createdAt: Date.UTC(2026, 10, 9, 17),
  timeZone: 'America/Los_Angeles',
  tasks: [],
};
const block = (message: string, tag: string) =>
  message.match(new RegExp(`<${tag}>(.*)</${tag}>`))?.[1] ?? null;

test('one message is combined unchanged', () => {
  const reading = { ...READING, dates: [span('d1', 'Saturday', 9)] };
  const combined = combineMessages([{ text: 'Call mom Saturday', reading }]);
  assert.equal(combined.text, 'Call mom Saturday');
  assert.deepEqual(combined.reading, reading);
  assert.deepEqual(combined.texts, ['Call mom Saturday']);
});

test('several messages join with offsets and prefixed span ids', () => {
  const first = {
    text: 'Buy rings',
    reading: { ...READING, isUrgent: true },
  };
  const second = {
    text: 'Call mom Saturday',
    reading: {
      ...READING,
      isUrgent: true,
      dates: [span('d1', 'Saturday', 9)],
    },
  };
  const combined = combineMessages([first, second]);
  assert.equal(combined.text, 'Buy rings\nCall mom Saturday');
  const [date] = combined.reading.dates;
  assert.equal(date.id, 'm2.d1');
  assert.equal(date.start, 19);
  assert.equal(combined.text.slice(date.start, date.end), 'Saturday');
  assert.equal(combined.reading.isUrgent, true);
});

test('urgent only when every message is urgent', () => {
  const urgent = { text: 'a', reading: { ...READING, isUrgent: true } };
  const calm = { text: 'b', reading: READING };
  assert.equal(combineMessages([urgent, calm]).reading.isUrgent, false);
});

test('each message loses only its own address; the first address stays', () => {
  const address = { id: 'a1', text: 'Helm', start: 0, end: 4 };
  const addressed = {
    text: 'Helm, buy rings',
    reading: { ...READING, addressedAs: address },
  };
  const combined = combineMessages([
    addressed,
    { text: 'Helm, call mom', reading: { ...READING, addressedAs: address } },
  ]);
  assert.deepEqual(combined.texts, ['buy rings', 'call mom']);
  assert.deepEqual(combined.reading.addressedAs, address);
});

test('summaries name how many messages they cover', () => {
  const counts = { made: 3, updated: 0, completed: 0 };
  assert.equal(summarize(counts), 'Made 3 tasks');
  assert.equal(summarize(counts, 1), 'Made 3 tasks');
  assert.equal(summarize(counts, 2), 'Got both: made 3 tasks');
  assert.equal(summarize(counts, 3), 'Got all three: made 3 tasks');
  assert.equal(summarize(counts, 10), 'Got all ten: made 3 tasks');
});

test('the context holds <capture> for one message and <messages> for several', () => {
  const one = buildContext({
    ...context,
    text: 'Buy rings',
    texts: ['Buy rings'],
    reading: READING,
  }).message;
  assert.equal(block(one, 'capture'), '"Buy rings"');
  assert.equal(block(one, 'messages'), null);
  const several = buildContext({
    ...context,
    text: 'Buy rings\nCall mom',
    texts: ['Buy rings', 'Call </messages> mom'],
    reading: READING,
  }).message;
  assert.equal(block(several, 'capture'), null);
  assert.deepEqual(JSON.parse(block(several, 'messages') ?? 'null'), [
    'Buy rings',
    'Call </messages> mom',
  ]);
});

const harness = (growsDuring: number[], canRestart = true) => {
  const log = { reads: 0, runs: [] as boolean[], readCounts: [] as number[] };
  const watch = { grow: null as (() => void) | null };
  const count = { listed: 0 };
  const run = async (
    _read: JoinedRead,
    signal: AbortSignal,
    isRestart: boolean,
  ) => {
    if (growsDuring.includes(log.runs.length + 1)) {
      count.listed += 1;
      watch.grow?.();
    }
    log.runs.push(signal.aborted);
    log.readCounts.push(_read.joinedCount);
    return { endedBy: signal.aborted ? 'aborted' : 'terminal', isRestart };
  };
  return {
    log,
    count,
    watch,
    go: () =>
      interpretWithJoins({
        readJoined: async () => {
          log.reads += 1;
          return {
            ids: Array.from({ length: count.listed + 1 }, (_, i) => `j${i}`),
            joinedCount: count.listed + 1,
          };
        },
        run,
        canRestart: () => canRestart,
        quietMs: 40,
        maxWaitMs: 200,
        watchJoins: (_readCount, onGrow) => {
          watch.grow = onGrow;
          return () => {
            watch.grow = null;
          };
        },
      }),
  };
};

test('no join: one run, one read', async () => {
  const { go, log } = harness([]);
  const { result, read } = await go();
  assert.equal(result.endedBy, 'terminal');
  assert.equal(log.reads, 1);
  assert.deepEqual(log.runs, [false]);
  assert.equal(read.ids.length, 1);
});

test('a join during the first run aborts it and restarts once with the new read', async () => {
  const { go, log } = harness([1]);
  const { result, read } = await go();
  assert.equal(result.endedBy, 'terminal');
  assert.equal(log.reads, 2);
  assert.deepEqual(log.runs, [true, false]);
  assert.equal(read.ids.length, 2);
});

test('joins arriving while the restart settles are all read by the second run', async () => {
  const { go, log, count, watch } = harness([1]);
  const late = [20, 50].map((delay) =>
    setTimeout(() => {
      count.listed += 1;
      watch.grow?.();
    }, delay),
  );
  const { read } = await go();
  late.forEach(clearTimeout);
  assert.deepEqual(log.runs, [true, false]);
  assert.equal(read.joinedCount, 4);
});

test('a join after the second run starts is left for the commit to release', async () => {
  const { go, log, count, watch } = harness([1]);
  const { read } = await go();
  count.listed += 1;
  watch.grow?.();
  assert.deepEqual(log.runs, [true, false]);
  assert.equal(read.joinedCount, 2);
});

test('a join during the second run is not aborted', async () => {
  const { go, log } = harness([1, 2]);
  const { result } = await go();
  assert.equal(result.endedBy, 'terminal');
  assert.equal(log.reads, 2);
  assert.deepEqual(log.runs, [true, false]);
});

test('a join with too little time left lets the first run finish', async () => {
  const { go, log } = harness([1], false);
  const { result, read } = await go();
  assert.equal(result.endedBy, 'terminal');
  assert.equal(log.reads, 1);
  assert.deepEqual(log.runs, [false]);
  assert.equal(read.ids.length, 1);
});

test('several messages prefix every token id, not only dates', () => {
  const token = (id: string, text: string) => ({
    id,
    text,
    start: 0,
    end: text.length,
  });
  const combined = combineMessages([
    { text: '@Ann', reading: { ...READING, people: [token('p1', '@Ann')] } },
    {
      text: '#Home',
      reading: {
        ...READING,
        places: [token('l1', '#Home')],
        documents: [token('f1', '^Deed')],
        commands: [token('c1', '/done')],
      },
    },
  ]);
  assert.deepEqual(
    [
      combined.reading.people[0].id,
      combined.reading.places[0].id,
      combined.reading.documents[0].id,
      combined.reading.commands[0].id,
    ],
    ['m1.p1', 'm2.l1', 'm2.f1', 'm2.c1'],
  );
  assert.equal(
    combineMessages([
      { text: '@Ann', reading: { ...READING, people: [token('p1', '@Ann')] } },
    ]).reading.people[0].id,
    'p1',
  );
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

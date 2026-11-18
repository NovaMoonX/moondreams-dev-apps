// What Helm keeps: observations at 26 weeks unless a live pattern cites them, stopped patterns cut to their signature, the live and off caps, reflections, seen-as lines and executions, at most 400 steps a run.
import assert from 'node:assert/strict';

import {
  readPrunable,
  type PruneInput,
} from '../../src/apps/helm/engine/retention.ts';

let failures = 0;
const test = (name: string, run: () => void) => {
  try {
    run();
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
};

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 16);
const empty: PruneInput = {
  observations: [],
  patterns: [],
  reflections: [],
  executions: [],
  seenAs: [],
  now: NOW,
};
const pattern = (
  id: string,
  extra: Partial<PruneInput['patterns'][number]> = {},
) => ({
  id,
  isLive: true,
  offReason: null,
  isCut: false,
  offAt: null,
  lastEvidenceAt: NOW,
  sourceKeys: [],
  evidence: {
    kind: 'occurrences' as const,
    from: 0,
    to: 0,
    matched: 4,
    total: 5,
    dayKeys: [],
  },
  ...extra,
});

test('a 27-week observation cited by a live pattern is kept, an uncited one deleted', () => {
  const old = NOW - 27 * 7 * DAY;
  const result = readPrunable({
    ...empty,
    observations: [
      { id: 'cited', at: old },
      { id: 'viaEvidence', at: old },
      { id: 'loose', at: old },
      { id: 'fresh', at: NOW - 5 * DAY },
    ],
    patterns: [
      pattern('p1', { sourceKeys: ['observations/cited'] }),
      pattern('p2', {
        evidence: {
          kind: 'said',
          from: 0,
          to: 0,
          matched: 3,
          dayKeys: [],
          observationIds: ['viaEvidence'],
        },
      }),
    ],
  });
  assert.deepEqual(result.deletes, [
    { collection: 'observations', id: 'loose' },
  ]);
});

test('an observation cited only by a stopped pattern is deleted', () => {
  const result = readPrunable({
    ...empty,
    observations: [{ id: 'o', at: NOW - 30 * 7 * DAY }],
    patterns: [
      pattern('p', {
        isLive: false,
        offReason: 'askedToStop',
        isCut: true,
        sourceKeys: ['observations/o'],
      }),
    ],
  });
  assert.equal(result.deletes.length, 1);
});

test('a stopped pattern is cut once, then left alone', () => {
  const stopped = pattern('s', {
    isLive: false,
    offReason: 'thirdNo',
    offAt: NOW,
  });
  assert.deepEqual(readPrunable({ ...empty, patterns: [stopped] }).cuts, ['s']);
  assert.deepEqual(
    readPrunable({ ...empty, patterns: [{ ...stopped, isCut: true }] }).cuts,
    [],
  );
});

test('past 500 live the oldest by last evidence is retired', () => {
  const live = Array.from({ length: 502 }, (_, at) =>
    pattern(`l${at}`, { lastEvidenceAt: NOW - at * DAY }),
  );
  assert.deepEqual(readPrunable({ ...empty, patterns: live }).retires, [
    'l501',
    'l500',
  ]);
});

test('past 5000 off the oldest by offAt is dropped', () => {
  const off = Array.from({ length: 5001 }, (_, at) =>
    pattern(`o${at}`, {
      isLive: false,
      offReason: 'askedToStop',
      isCut: true,
      offAt: NOW - at * 1000,
    }),
  );
  const result = readPrunable({ ...empty, patterns: off });
  assert.deepEqual(result.deletes, [{ collection: 'patterns', id: 'o5000' }]);
});

test('reflections go 14 days after seen, never before', () => {
  const result = readPrunable({
    ...empty,
    reflections: [
      { dayKey: 'a', seenAt: NOW - 15 * DAY },
      { dayKey: 'b', seenAt: NOW - 13 * DAY },
      { dayKey: 'c', seenAt: null },
    ],
  });
  assert.deepEqual(result.deletes, [{ collection: 'reflections', id: 'a' }]);
});

test('executions go at 13 months', () => {
  const result = readPrunable({
    ...empty,
    executions: [
      { id: 'old', createdAt: NOW - 397 * DAY },
      { id: 'new', createdAt: NOW - 390 * DAY },
    ],
  });
  assert.deepEqual(result.deletes, [{ collection: 'executions', id: 'old' }]);
});

test('seen-as caps drop the oldest derived line and never a correction', () => {
  const seenAs = [
    ...Array.from({ length: 41 }, (_, at) => ({
      id: `s${at}`,
      status: 'shown' as const,
      isDerived: true,
      createdAt: at,
    })),
    {
      id: 'fixed',
      status: 'corrected' as const,
      isDerived: false,
      createdAt: 0,
    },
    ...Array.from({ length: 201 }, (_, at) => ({
      id: `r${at}`,
      status: 'removed' as const,
      isDerived: true,
      createdAt: at,
    })),
  ];
  const ids = readPrunable({ ...empty, seenAs }).deletes.map((drop) => drop.id);
  assert.deepEqual(ids, ['s0', 's1', 'r0']);
});

test('a run is at most 400 steps', () => {
  const observations = Array.from({ length: 900 }, (_, at) => ({
    id: `o${at}`,
    at: NOW - 30 * 7 * DAY,
  }));
  assert.equal(readPrunable({ ...empty, observations }).deletes.length, 400);
});

if (failures > 0) {
  console.error(`check:helm-retention: ${failures} failed`);
  process.exit(1);
}
console.log('check:helm-retention: ok');

// Related things grouped overnight: the engine's id, offer, back-off and delete rules.
import assert from 'node:assert/strict';

import {
  PATTERN_BACKOFF_WEEKS,
  RELATE_SYNCED_CATEGORIES,
} from '../../src/apps/helm/constants.ts';
import {
  GROUPING_BACKOFF_WEEKS,
  applyGroupingNotNow,
  dropSource,
  isNewEvidence,
  readGrouping,
  selectGroupingOffer,
  toGroupingId,
  type GroupingRecord,
} from '../../src/apps/helm/engine/grouping.ts';
import { WHERE_THINGS_LIVE } from '../../src/apps/helm/whereThingsLive.ts';

const NOW = Date.UTC(2030, 0, 10, 12);
const DAY = 86_400_000;

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const make = (
  id: string,
  fields: Partial<GroupingRecord> = {},
): GroupingRecord => {
  const sourceKeys = fields.sourceKeys ?? ['tasks/a', 'tasks/b'];
  return {
    id,
    parentKind: 'project',
    parentId: null,
    sourceKeys,
    sources: sourceKeys.map((key) => ({ key, app: null, kind: 'task' })),
    linkedKeys: [],
    state: 'proposed',
    confidence: 'likely',
    evidence: ['titleMatch'],
    declineCount: 0,
    nextOfferAfter: null,
    answeredAt: null,
    toldAt: null,
    executionId: null,
    dayKey: '2030-01-09',
    proposedAt: NOW - DAY,
    updatedAt: NOW - DAY,
    privacy: 'ordinary',
    createdBy: 'nomos',
    ...fields,
  };
};

const live = (...keys: string[]) => new Set(keys);

test('an id is the same across order, repeats and retries', () => {
  const id = toGroupingId('u1', ['tasks/b', 'notes/c', 'tasks/a']);
  assert.match(id, /^g_[0-9a-f]{24}$/);
  assert.equal(id, toGroupingId('u1', ['notes/c', 'tasks/a', 'tasks/b']));
  assert.equal(
    id,
    toGroupingId('u1', ['tasks/a', 'tasks/b', 'notes/c', 'tasks/a']),
  );
  assert.notEqual(id, toGroupingId('u2', ['tasks/a', 'tasks/b', 'notes/c']));
  assert.notEqual(id, toGroupingId('u1', ['tasks/a', 'tasks/b']));
});

test('a grouping reads back from unknown and a broken one is refused', () => {
  const stored = make('g_1', { state: 'filed', linkedKeys: ['tasks/a'] });
  assert.deepEqual(
    readGrouping('g_1', JSON.parse(JSON.stringify(stored))),
    stored,
  );
  assert.equal(readGrouping('g_2', null), null);
  assert.equal(readGrouping('g_2', { ...stored, state: 'done' }), null);
  assert.equal(
    readGrouping('g_2', { ...stored, sourceKeys: ['tasks/a'] }),
    null,
  );
  const legacy = readGrouping('g_3', {
    state: 'proposed',
    parentKind: 'topic',
    sourceKeys: ['tasks/a', 'notes/b'],
  });
  assert.equal(legacy?.confidence, 'unsure');
  assert.equal(legacy?.declineCount, 0);
  assert.equal(legacy?.nextOfferAfter, null);
  assert.equal(legacy?.privacy, 'ordinary');
});

test('one offer is picked: the surest, then the newest', () => {
  const all = live('tasks/a', 'tasks/b', 'tasks/c');
  const groupings = [
    make('g_old', { confidence: 'likely', proposedAt: NOW - 3 * DAY }),
    make('g_new', { confidence: 'likely', proposedAt: NOW - DAY }),
    make('g_sure', { confidence: 'certain', proposedAt: NOW - 5 * DAY }),
  ];
  assert.equal(selectGroupingOffer(groupings, NOW, all)?.id, 'g_sure');
  assert.equal(
    selectGroupingOffer(groupings.slice(0, 2), NOW, all)?.id,
    'g_new',
  );
  assert.equal(selectGroupingOffer([], NOW, all), null);
});

test('an offer needs two live sources, no wait and fewer than three Not nows', () => {
  const one = live('tasks/a');
  const both = live('tasks/a', 'tasks/b');
  assert.equal(selectGroupingOffer([make('g')], NOW, one), null);
  assert.equal(selectGroupingOffer([make('g')], NOW, both)?.id, 'g');
  const waiting = make('g', {
    state: 'notNow',
    declineCount: 1,
    nextOfferAfter: NOW + DAY,
  });
  assert.equal(selectGroupingOffer([waiting], NOW, both), null);
  assert.equal(selectGroupingOffer([waiting], NOW + DAY, both)?.id, 'g');
  const ended = make('g', {
    state: 'notNow',
    declineCount: 3,
    nextOfferAfter: null,
  });
  assert.equal(selectGroupingOffer([ended], NOW + 400 * DAY, both), null);
  ['filed', 'groupedByYou', 'notRelated'].forEach((state) =>
    assert.equal(
      selectGroupingOffer(
        [make('g', { state: state as GroupingRecord['state'] })],
        NOW,
        both,
      ),
      null,
    ),
  );
});

test('Not now waits 4 weeks, then 8, and the third ends it', () => {
  assert.deepEqual([...GROUPING_BACKOFF_WEEKS], [...PATTERN_BACKOFF_WEEKS]);
  const first = applyGroupingNotNow({ declineCount: 0 }, NOW);
  assert.equal(first.state, 'notNow');
  assert.equal(first.declineCount, 1);
  assert.equal(first.nextOfferAfter, NOW + 28 * DAY);
  const second = applyGroupingNotNow(first, NOW);
  assert.equal(second.declineCount, 2);
  assert.equal(second.nextOfferAfter, NOW + 56 * DAY);
  const third = applyGroupingNotNow(second, NOW);
  assert.equal(third.declineCount, 3);
  assert.equal(third.nextOfferAfter, null);
});

test('Not related stays with the same keys and a new key reopens it', () => {
  const answered = make('g', { state: 'notRelated' });
  assert.equal(isNewEvidence(answered, ['tasks/b', 'tasks/a']), false);
  assert.equal(isNewEvidence(answered, ['tasks/a']), false);
  assert.equal(
    isNewEvidence(answered, ['tasks/a', 'tasks/b', 'notes/c']),
    true,
  );
  assert.equal(
    selectGroupingOffer([answered], NOW, live('tasks/a', 'tasks/b')),
    null,
  );
});

test('a deleted source leaves the grouping, and below two it goes', () => {
  const three = make('g', {
    sourceKeys: ['tasks/a', 'tasks/b', 'notes/c'],
    linkedKeys: ['notes/c', 'tasks/a'],
  });
  const dropped = dropSource(three, 'notes/c');
  assert.deepEqual(dropped?.patch.sourceKeys, ['tasks/a', 'tasks/b']);
  assert.deepEqual(dropped?.patch.linkedKeys, ['tasks/a']);
  assert.deepEqual(
    dropped?.patch.sources.map((source) => source.key),
    ['tasks/a', 'tasks/b'],
  );
  assert.equal(dropped?.isGone, false);
  assert.equal(dropSource(three, 'tasks/zzz'), null);
  assert.equal(dropSource(make('g'), 'tasks/a')?.isGone, true);
});

test('the synced categories the grouping reads match the rows that allow it', () => {
  const fromRows = WHERE_THINGS_LIVE.flatMap((row) =>
    row.grant && row.batchJobs.includes('relate')
      ? [`${row.grant.source}/${row.grant.category}`]
      : [],
  );
  assert.deepEqual([...fromRows].sort(), [...RELATE_SYNCED_CATEGORIES].sort());
});

tests.forEach(([name, run]) => {
  run();
  console.log(`ok  ${name}`);
});

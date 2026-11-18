import assert from 'node:assert/strict';

import { aListHeldActions } from '../../src/apps/a-list/store/heldLists.ts';
import {
  membershipReducer,
  setMembership,
} from '../../src/apps/a-list/store/slices/membershipSlice.ts';
import {
  setViewings,
  viewingsReducer,
} from '../../src/apps/a-list/store/slices/viewingsSlice.ts';
import {
  setWatchlist,
  watchlistReducer,
} from '../../src/apps/a-list/store/slices/watchlistSlice.ts';
import { readAListTarget } from '../../src/apps/a-list/utils/heldHolds.ts';
import { buildHolds } from '../../src/lib/firebase/heldHolds.ts';
import type {
  MembershipProfile,
  Viewing,
  WatchlistItem,
} from '../../src/apps/a-list/types.ts';

const { hold, settle, drop } = aListHeldActions;

const viewing = (id: string, rating: number | null) =>
  ({ id, rating }) as unknown as Viewing;
const holdOf = (
  kind: string,
  token: string,
  scope: string,
  item: { id: string } | null,
  field: string,
  value: unknown,
) =>
  hold({
    token,
    scope,
    writes: {
      [kind]: [
        {
          id: item?.id ?? 'a',
          item,
          fingerprint: JSON.stringify({ [field]: value }),
          token,
          settledAt: null,
          fields: [field],
        },
      ],
    },
  });
const viewingHold = (token: string, scope: string, item: Viewing | null) =>
  holdOf('viewings', token, scope, item, 'rating', item?.rating);

const base = ['apps', 'a-list', 'memberships'];
const built = buildHolds(
  [
    {
      segments: [...base, 'u1', 'viewings', 'v1'],
      before: { rating: 1 },
      after: { rating: 4 },
    },
    {
      segments: [...base, 'u1', 'watchlist', 'w1'],
      before: null,
      after: { priority: 'HIGH' },
    },
    {
      segments: [...base, 'u1'],
      before: { favoriteTheatreId: null },
      after: { favoriteTheatreId: 't1' },
    },
    {
      segments: [...base, 'u2', 'viewings', 'v2'],
      before: null,
      after: { rating: 2 },
    },
    {
      segments: [...base, 'u1', 'calendarShares', 's1'],
      before: null,
      after: { token: 'x' },
    },
    {
      segments: [...base, 'u1', 'viewings', 'v1', 'deep', 'x'],
      before: null,
      after: { a: 1 },
    },
  ],
  (segments) => readAListTarget(segments, 'u1'),
  'k',
);
assert.deepEqual(
  Object.keys(built ?? {}).sort(),
  ['membership', 'viewings', 'watchlist'],
  'only the signed-in member’s lists and own document are held',
);
assert.equal(built?.viewings?.length, 1, 'another member’s record is not held');

const dinner = viewing('a', 1);
const rated = viewing('a', 5);
const delivered = viewingsReducer(
  undefined,
  setViewings({ uid: 'u1', items: [dinner] }),
);
const edited = viewingsReducer(delivered, viewingHold('k', 'u1', rated));
assert.deepEqual(edited.items, [rated], 'a write shows at once');
assert.deepEqual(
  viewingsReducer(edited, setViewings({ uid: 'u1', items: [dinner] })).items,
  [rated],
  'a delivery that still has the old record never brings it back',
);
const landed = viewingsReducer(
  viewingsReducer(edited, settle('k')),
  setViewings({ uid: 'u1', items: [rated] }),
);
assert.deepEqual(landed.hold.held, [], 'landing releases the hold');
assert.deepEqual(
  viewingsReducer(edited, drop('k')).items,
  [dinner],
  'a failed write puts the record back',
);
assert.deepEqual(
  viewingsReducer(delivered, viewingHold('o', 'u2', rated)).hold.held,
  [],
  'a hold for another member is ignored',
);
assert.deepEqual(
  viewingsReducer(undefined, viewingHold('k', 'u1', rated)).hold.held,
  [],
  'a list still loading takes no hold',
);
const switched = viewingsReducer(
  edited,
  setViewings({ uid: 'u2', items: [viewing('z', null)] }),
);
assert.deepEqual(switched.hold.held, [], 'switching member resets the hold');

const removed = viewingsReducer(delivered, viewingHold('r', 'u1', null));
assert.deepEqual(removed.items, [], 'a removal leaves the list at once');
assert.deepEqual(
  viewingsReducer(removed, drop('r')).items,
  [dinner],
  'and a failed removal puts it back',
);

const item = (priority: string) =>
  ({
    id: 'w1',
    movieKey: 'w1',
    priority,
  }) as unknown as WatchlistItem & { id: string };
const listed = watchlistReducer(
  undefined,
  setWatchlist({ uid: 'u1', items: [item('LOW')] }),
);
const created = watchlistReducer(
  listed,
  holdOf('watchlist', 'k', 'u1', item('HIGH'), 'priority', 'HIGH'),
);
assert.equal(created.items[0].priority, 'HIGH', 'a watchlist write is held');
assert.equal(
  watchlistReducer(created, setWatchlist({ uid: 'u1', items: [item('LOW')] }))
    .items[0].priority,
  'HIGH',
  'and survives a stale delivery',
);

const profile = (favoriteTheatreId: string | null) =>
  ({
    id: 'u1',
    uid: 'u1',
    favoriteTheatreId,
  }) as unknown as MembershipProfile & { id: string };
const member = membershipReducer(
  undefined,
  setMembership({ uid: 'u1', membership: profile(null) }),
);
const starred = membershipReducer(
  member,
  holdOf('membership', 'k', 'u1', profile('t1'), 'favoriteTheatreId', 't1'),
);
assert.equal(
  starred.membership?.favoriteTheatreId,
  't1',
  'the member’s document is held over a list of one',
);
assert.equal(
  membershipReducer(starred, drop('k')).membership?.favoriteTheatreId,
  null,
  'and goes back when the write fails',
);
assert.equal(
  membershipReducer(
    undefined,
    holdOf('membership', 'k', 'u1', profile('t1'), 'favoriteTheatreId', 't1'),
  ).membership,
  null,
  'a membership still loading takes no hold',
);

console.log('a-list held lists: ok');

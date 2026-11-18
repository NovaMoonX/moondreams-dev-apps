import assert from 'node:assert/strict';

import { waypointHeldActions } from '../../src/apps/waypoint/store/heldLists.ts';
import {
  eventsReducer,
  setEvents,
  upsertEvent,
} from '../../src/apps/waypoint/store/slices/eventsSlice.ts';
import {
  setTrips,
  tripReducer,
} from '../../src/apps/waypoint/store/slices/tripSlice.ts';
import { readWaypointTarget } from '../../src/apps/waypoint/utils/heldHolds.ts';
import { buildHolds } from '../../src/lib/firebase/heldHolds.ts';
import type {
  TimelineEvent,
  TripSpace,
} from '../../src/apps/waypoint/types.ts';

const { hold, settle, drop } = waypointHeldActions;

const event = (id: string, title: string) =>
  ({ id, title }) as unknown as TimelineEvent;
const holdOf = (token: string, scope: string, item: TimelineEvent | null) =>
  hold({
    token,
    scope,
    writes: {
      events: [
        {
          id: item?.id ?? 'a',
          item,
          fingerprint: JSON.stringify({ title: item?.title }),
          token,
          settledAt: null,
          fields: ['title'],
        },
      ],
    },
  });

const built = buildHolds(
  [
    {
      segments: ['apps', 'waypoint', 'trips', 't1', 'events', 'e1'],
      before: { title: 'Dinner' },
      after: { title: 'Lunch' },
    },
    {
      segments: ['apps', 'waypoint', 'trips', 't2', 'events', 'e2'],
      before: null,
      after: { title: 'Elsewhere' },
    },
    {
      segments: ['apps', 'waypoint', 'trips', 't1', 'trips', 'x'],
      before: null,
      after: { title: 'Nope' },
    },
    {
      segments: ['apps', 'waypoint', 'trips', 't1'],
      before: { title: 'Old' },
      after: { title: 'New' },
    },
    {
      segments: ['apps', 'waypoint', 'pendingRequests', 'u1', 'requests', 'r'],
      before: null,
      after: { uid: 'u1' },
    },
  ],
  (segments) => readWaypointTarget(segments, 't1'),
  'k',
);
assert.deepEqual(
  Object.keys(built ?? {}).sort(),
  ['events', 'trips'],
  'only the open trip’s lists and the trip itself are held',
);
assert.equal(built?.events?.length, 1, 'another trip’s record is not held');

const dinner = event('a', 'Dinner');
const lunch = event('a', 'Lunch');
const delivered = eventsReducer(
  undefined,
  setEvents({ tripId: 't1', events: [dinner] }),
);
const edited = eventsReducer(delivered, holdOf('k', 't1', lunch));
assert.deepEqual(edited.items, [lunch], 'a write shows at once');
assert.deepEqual(
  eventsReducer(edited, setEvents({ tripId: 't1', events: [dinner] })).items,
  [lunch],
  'a delivery that still has the old record never brings it back',
);
const landed = eventsReducer(
  eventsReducer(edited, settle('k')),
  setEvents({ tripId: 't1', events: [lunch] }),
);
assert.deepEqual(
  landed.hold.held,
  [],
  'the hold lets go once the list shows it',
);
assert.deepEqual(
  eventsReducer(edited, drop('k')).items,
  [dinner],
  'a failed write puts the record back',
);
assert.deepEqual(
  eventsReducer(delivered, holdOf('o', 't2', lunch)).hold.held,
  [],
  'a hold for another trip is ignored',
);
const loading = eventsReducer(undefined, holdOf('k', 't1', lunch));
assert.deepEqual(loading.hold.held, [], 'a list still loading takes no hold');

const switched = eventsReducer(
  edited,
  setEvents({ tripId: 't2', events: [event('z', 'Other')] }),
);
assert.deepEqual(switched.hold.held, [], 'switching trips resets the hold');
assert.deepEqual(
  switched.items.map((item) => item.id),
  ['z'],
  'and the other trip shows only its own records',
);

const removed = eventsReducer(delivered, holdOf('r', 't1', null));
assert.deepEqual(removed.items, [], 'a removal leaves the list at once');
assert.deepEqual(
  eventsReducer(removed, drop('r')).items,
  [dinner],
  'and a failed removal puts it back',
);

const created = event('n', 'New');
const upserted = eventsReducer(delivered, upsertEvent(created));
const relayed = eventsReducer(upserted, holdOf('k', 't1', lunch));
assert.deepEqual(
  relayed.items.map((item) => item.id).sort(),
  ['a', 'n'],
  'an upserted event survives a relay',
);

const trip = { id: 't1', title: 'Old' } as unknown as TripSpace;
const renamed = { ...trip, title: 'New' } as unknown as TripSpace;
const tripHold = (token: string, item: TripSpace) =>
  hold({
    token,
    scope: 'ignored',
    writes: {
      trips: [
        {
          id: item.id,
          item,
          fingerprint: JSON.stringify({ title: item.title }),
          token,
          settledAt: null,
          fields: ['title'],
        },
      ],
    },
  });
const trips = tripReducer(undefined, setTrips([trip]));
const heldTrips = tripReducer(trips, tripHold('k', renamed));
assert.deepEqual(
  heldTrips.items,
  [renamed],
  'the trip document is held over the trips list',
);
assert.deepEqual(
  tripReducer(heldTrips, setTrips([trip])).items,
  [renamed],
  'a stale delivery never brings the old trip back',
);
assert.deepEqual(
  tripReducer(tripReducer(undefined, tripHold('k', renamed)), setTrips([trip]))
    .items,
  [trip],
  'a trips list still loading takes no hold',
);

console.log('waypoint held lists: ok');

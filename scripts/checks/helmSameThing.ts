import assert from 'node:assert/strict';

import {
  findOtherTime,
  findPlace,
} from '../../src/apps/helm/engine/authority.ts';
import type { SyncedRecord } from '../../src/apps/helm/types.ts';
import {
  isSameThing,
  mergeSameThings,
} from '../../src/apps/helm/utils/sameThing.ts';

const START = Date.UTC(2026, 10, 14, 3, 0);
const MINUTE = 60_000;

const copy = (
  id: string,
  title: string,
  startAt: number,
  source: { connectorId: string; grantId: string; sameEventKey?: string },
): SyncedRecord => ({
  id,
  connectorId: source.connectorId,
  accountId: source.grantId,
  grantId: source.grantId,
  category: 'events',
  kind: 'event',
  sourceRef: id,
  startAt,
  endAt: startAt + 120 * MINUTE,
  isAllDay: false,
  dueAt: null,
  calendarKey: null,
  isBusy: true,
  sourceUpdatedAt: null,
  syncedAt: 0,
  transformVersion: 1,
  contentHash: null,
  connectionEndedAt: null,
  deleteAfter: null,
  sealed: {
    title,
    subtitle: null,
    detail: null,
    placeLabel: null,
    amountCents: null,
    currency: null,
    deepLink: null,
    extra:
      source.sameEventKey === undefined
        ? {}
        : { sameEventKey: source.sameEventKey },
  },
});

const PERSONAL = { connectorId: 'google:calendar', grantId: 'g-personal' };
const WORK = { connectorId: 'google:calendar', grantId: 'g-work' };
const A_LIST = { connectorId: 'app:a-list', grantId: 'a-list' };
const WAYPOINT = { connectorId: 'app:waypoint', grantId: 'waypoint' };

const calendar = copy('cal', 'Starlight Harbor', START, PERSONAL);

// 15 minutes is the edge: 14 apart is one thing, 16 is two.
assert.equal(
  isSameThing(
    calendar,
    copy('app', 'Starlight Harbor', START + 14 * MINUTE, A_LIST),
  ),
  true,
);
assert.equal(
  isSameThing(
    calendar,
    copy('app', 'Starlight Harbor', START + 15 * MINUTE, A_LIST),
  ),
  true,
);
assert.equal(
  isSameThing(
    calendar,
    copy('app', 'Starlight Harbor', START - 16 * MINUTE, A_LIST),
  ),
  false,
);

// Near titles: case, punctuation and one misspelled long word match; another name does not.
assert.equal(
  isSameThing(calendar, copy('app', 'starlight harbor!', START, A_LIST)),
  true,
);
assert.equal(
  isSameThing(
    copy('cal', 'Flight to Lisbon', START, PERSONAL),
    copy('app', 'Flight to Lisbn', START, WAYPOINT),
  ),
  false,
  'a misspelled short name is another name',
);
assert.equal(
  isSameThing(
    copy('cal', 'Dentist checkup', START, PERSONAL),
    copy('app', 'Dentist chekup', START, WAYPOINT),
  ),
  true,
);
assert.equal(
  isSameThing(
    copy('cal', 'Lunch with Sam', START, PERSONAL),
    copy('app', 'Lunch with Sal', START, WAYPOINT),
  ),
  false,
);

// Two things with one name in one source stay two.
assert.equal(
  isSameThing(
    copy('a', 'Standup', START, PERSONAL),
    copy('b', 'Standup', START, PERSONAL),
  ),
  false,
);

// Two accounts: one event counts once, by its shared key or by title and start.
const twoAccounts = mergeSameThings([
  copy('p', 'Team offsite', START, { ...PERSONAL, sameEventKey: 'k1' }),
  copy('w', 'Team offsite (work)', START + 30 * MINUTE, {
    ...WORK,
    sameEventKey: 'k1',
  }),
  copy('p2', 'Pottery class', START + 300 * MINUTE, PERSONAL),
  copy('w2', 'Pottery class', START + 300 * MINUTE, WORK),
]);
assert.equal(twoAccounts.length, 2);
assert.deepEqual(
  twoAccounts.map(({ record, alsoIn }) => [record.id, alsoIn.map((c) => c.id)]),
  [
    ['p', ['w']],
    ['p2', ['w2']],
  ],
);

// The calendar's time is shown, and the app's differing time is found for its line.
const app = copy('app', 'Starlight Harbor', START + 10 * MINUTE, A_LIST);
const [movie] = mergeSameThings([app, calendar]);
assert.equal(movie.record.id, 'cal');
assert.equal(findOtherTime(movie.record, movie.alsoIn)?.id, 'app');
assert.equal(
  findOtherTime(calendar, [copy('app', 'Starlight Harbor', START, A_LIST)]),
  null,
  'agreeing times say nothing',
);

// A moved event: once the app's showing moves past the window, both show again.
const moved = mergeSameThings([
  calendar,
  copy('app', 'Starlight Harbor', START + 90 * MINUTE, A_LIST),
]);
assert.equal(moved.length, 2);

const theater = {
  ...app,
  sealed: { ...app.sealed, placeLabel: 'AMC Town Center 20' },
};
assert.equal(
  findPlace(calendar, [theater]),
  'AMC Town Center 20',
  'the app holds the place',
);

console.log('check:helm-same-thing: one event shows once.');

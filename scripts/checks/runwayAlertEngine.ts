import assert from 'node:assert/strict';

import {
  ALERT_SHARE_BPS,
  getAlertFigure,
  getAlertLineCents,
  getEachTimeCents,
  stepAlert,
  type AlertState,
} from '../../src/apps/runway/engine/alerts.ts';
import type { Balances } from '../../src/apps/runway/engine/balances.ts';
import type { EnvelopeVersion } from '../../src/apps/runway/types.ts';

const balances = (over: Partial<Balances>) =>
  ({
    isStarted: true,
    hasMoney: true,
    freeToSpendCents: 0,
    assignedByItem: {},
    ...over,
  }) as Balances;
const envelopePayload = (amount: unknown) =>
  ({
    funding: { amount, cadence: { kind: 'everyIncomeDay' } },
  }) as unknown as EnvelopeVersion['payload'];

// What an envelope gets each time: only a set amount has a figure.
assert.equal(
  getEachTimeCents(envelopePayload({ kind: 'exact', cents: 15_000 })),
  15_000,
);
assert.equal(getEachTimeCents(envelopePayload({ kind: 'rest' })), null);
assert.equal(
  getEachTimeCents(
    envelopePayload({ kind: 'percent', bps: 1_000, of: 'dayMoney' }),
  ),
  null,
);

// The line: a set amount, or a share of what it gets each time; a share of nothing fixed is no line.
assert.equal(getAlertLineCents({ kind: 'cents', cents: 2_500 }, null), 2_500);
assert.equal(
  getAlertLineCents({ kind: 'share', bps: ALERT_SHARE_BPS.half }, 15_000),
  7_500,
);
assert.equal(
  getAlertLineCents({ kind: 'share', bps: ALERT_SHARE_BPS.quarter }, 15_001),
  3_750,
);
assert.equal(
  getAlertLineCents({ kind: 'share', bps: ALERT_SHARE_BPS.half }, null),
  null,
  'a share of an envelope with no set amount has no line',
);

// The figure: an envelope's own money, Free to Spend, and over-assigned reads below zero.
const live = new Set(['env-a']);
assert.equal(
  getAlertFigure(
    { kind: 'envelope', itemId: 'env-a' },
    balances({ assignedByItem: { 'env-a': 4_200 } }),
    live,
  ),
  4_200,
);
assert.equal(
  getAlertFigure({ kind: 'envelope', itemId: 'env-a' }, balances({}), live),
  0,
  'an envelope with no entry holds nothing',
);
assert.equal(
  getAlertFigure(
    { kind: 'envelope', itemId: 'env-gone' },
    balances({ assignedByItem: { 'env-gone': 100 } }),
    live,
  ),
  null,
  'an envelope not in the plan today has no figure',
);
assert.equal(
  getAlertFigure(
    { kind: 'freeToSpend' },
    balances({ freeToSpendCents: 9_000 }),
    live,
  ),
  9_000,
);
assert.equal(
  getAlertFigure(
    { kind: 'freeToSpend' },
    balances({ freeToSpendCents: -3_500 }),
    live,
  ),
  -3_500,
  'over-assigned reads negative',
);
assert.equal(
  getAlertFigure({ kind: 'freeToSpend' }, balances({ hasMoney: false }), live),
  null,
  'Free to Spend not known is no figure',
);

// Stepping: a new alert already below doesn't go off; it goes off once on the drop, not again while below, and again after it rearms.
const LINE = 5_000;
const step = (
  previous: AlertState | null,
  figure: number,
  now: number,
  updatedAt = 1,
) => stepAlert(previous, updatedAt, null, figure, LINE, now);
const first = step(null, 3_000, 10);
assert.equal(first.fires, false, 'a new alert already below does not go off');
assert.equal(first.state.isBelow, true);
const above = step(null, 9_000, 10);
assert.equal(above.fires, false);
assert.equal(above.state.isBelow, false);
const drop = step(above.state, 5_000, 20);
assert.equal(drop.fires, true, 'it goes off when the figure falls to the line');
assert.equal(drop.state.lastFiredAt, 20);
const stay = step(drop.state, 1_000, 30);
assert.equal(stay.fires, false, 'it does not go off again while below');
assert.deepEqual(stay.state, drop.state);
const rearmed = step(stay.state, 5_001, 40);
assert.equal(rearmed.fires, false);
assert.equal(rearmed.state.isBelow, false, 'back above rearms it');
assert.equal(rearmed.state.lastFiredAt, 20, 'what fired last is kept');
const again = step(rearmed.state, 4_000, 50);
assert.equal(again.fires, true, 'it goes off again after rearming');
assert.equal(again.state.lastFiredAt, 50);

// A changed alert starts over from where things stand, without going off.
const changed = step(above.state, 100, 60, 2);
assert.equal(changed.fires, false, 'a changed alert takes where things stand');
assert.equal(changed.state.alertUpdatedAt, 2);
assert.equal(changed.state.isBelow, true);
assert.equal(changed.state.heldSince, null);
assert.equal(
  step(drop.state, 100, 60, 2).state.lastFiredAt,
  20,
  'a changed alert keeps when it last went off',
);

// A share line whose envelope amount changed starts over without going off, even when the new line is above the figure.
const share = stepAlert(null, 1, 'version-a', 9_000, 5_000, 10);
const raised = stepAlert(share.state, 1, 'version-b', 9_000, 12_000, 20);
assert.equal(raised.fires, false, 'a raised amount does not set it off');
assert.equal(raised.state.lineFrom, 'version-b');
assert.equal(raised.state.isBelow, true);
assert.equal(
  stepAlert(share.state, 1, 'version-a', 4_000, 5_000, 20).fires,
  true,
  'spending on the same amount still sets it off',
);

// A held alert is dropped on recovery, and kept while still below.
const held: AlertState = { ...drop.state, heldSince: 25 };
assert.equal(
  step(held, 6_000, 70).state.heldSince,
  null,
  'recovery drops the hold',
);
assert.equal(
  step(held, 4_000, 70).state.heldSince,
  25,
  'still below keeps the hold',
);

console.log('runwayAlertEngine: ok');

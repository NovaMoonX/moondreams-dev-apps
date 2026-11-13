import assert from 'node:assert/strict';

import { toDayKey } from '../../src/apps/runway/engine/dates.ts';
import { planCostShares } from '../../src/apps/runway/engine/demands.ts';
import { buildDraft } from '../../src/apps/runway/engine/draft.ts';
import type { HorizonCost } from '../../src/apps/runway/types.ts';

const utc = (year: number, month: number, day: number) =>
  Date.UTC(year, month - 1, day);
const exact = (cents: number) => ({ lowCents: cents, highCents: cents });

const storage: HorizonCost = {
  id: 'storage',
  name: 'Storage unit',
  amount: exact(10_000),
  schedule: { kind: 'monthly', anchor: utc(2027, 2, 1), monthDays: [1] },
  ending: { onDate: null, afterCount: null },
  isOutside: false,
  pricedOn: null,
  endsAfter: null,
  becameBillId: null,
  becameBillOn: null,
  priority: null,
  note: null,
};
const jan15 = utc(2027, 1, 15);
const jan31 = utc(2027, 1, 31);
const horizonEnd = utc(2027, 12, 31);
const days = [jan15, jan31, utc(2027, 2, 14), utc(2027, 2, 28)].map((on) => ({
  dayKey: toDayKey('pay', on),
  sourceId: 'src',
  on,
  amount: exact(200_000),
}));
const item = (startsOn: number | null) => ({
  itemId: 'trip',
  createdAt: 1_000,
  priority: 'should' as const,
  orderIndex: 1,
  rest: { kind: 'pays' as const, startsOn },
  costs: [storage],
  heldCents: 0,
});
const firstParts = (startsOn: number | null) =>
  planCostShares(item(startsOn), days, horizonEnd, 'conservative')[0].parts.map(
    (part) => part.day.on,
  );
const costCentsOn = (on: number, startsOn: number | null) =>
  buildDraft({
    days: days.filter((entry) => entry.on === on),
    plan: {
      envelopes: [],
      bills: [],
      goals: [],
      horizonItems: [item(startsOn)],
      horizon: horizonEnd,
      incomeDays: days,
    },
    stance: 'conservative',
    overrides: { dayCents: {} },
  })
    .lines.filter((line) => line.costId)
    .map((line) => line.cents);

assert.deepEqual(
  [jan15, jan31].map((on) => costCentsOn(on, jan31)),
  [[], [10_000]],
  'pays before the start give nothing and the pays from it split the cost',
);
assert.deepEqual(
  firstParts(jan31),
  [jan31],
  'a payment is carried only by the pays on or after the start',
);
assert.deepEqual(
  firstParts(utc(2027, 2, 14)),
  firstParts(null),
  'a payment due before the start day is carried by its normal pays, never left unfunded',
);

console.log('runway horizon start: ok');

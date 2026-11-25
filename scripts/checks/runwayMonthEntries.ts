// Pure check of the one month reader the phone and the server both open closings' months with.
import assert from 'node:assert/strict';

import {
  CLOSING_MOVE_KINDS,
  openMonthEntries,
  type LedgerDoc,
} from '../../src/apps/runway/engine/monthEntries.ts';
import type { ReadSealed } from '../../src/apps/runway/engine/openDocs.ts';

const DAY_MS = 86_400_000;
const start = Date.UTC(2026, 0, 1);

const doc = (id: string, fields: object): LedgerDoc => ({
  id,
  data: () => ({ ...fields, id: 'not-the-doc-id' }),
});

const day = (id: string, status: string, offset: number) =>
  doc(id, {
    payLineId: 'pay-1',
    sourceId: null,
    expectedOn: start + offset * DAY_MS,
    arrivedOn: status === 'confirmed' ? start + (offset + 1) * DAY_MS : null,
    status,
    createdAt: start,
    confirmedAt: null,
    doneLineIds: [],
    sealed: null,
  });

const move = (kind: string) =>
  doc(`move-${kind}`, {
    kind,
    date: start + DAY_MS,
    refId: `ref-${kind}`,
    reversesMoveId: null,
    createdAt: start,
    sealed: { amountCents: 1_000, paidOn: start, fromFreeCents: 0 },
  });

const identity: ReadSealed = async <T extends object>(sealed: unknown) =>
  sealed as T;

async function main() {
  const asked: string[] = [];
  const kinds = [...CLOSING_MOVE_KINDS, 'start', 'trackingChange', 'autoFund'];
  const entries = await openMonthEntries(
    {
      days: [
        day('day-confirmed', 'confirmed', 2),
        day('day-expected', 'expected', 9),
      ],
      moves: kinds.map(move),
      purchases: [
        doc('purchase-1', {
          date: start + 3 * DAY_MS,
          source: 'manual',
          status: 'posted',
          needsHome: false,
          createdAt: start,
          updatedAt: start,
          sealed: { amountCents: 2_500, merchant: 'Safeway', lines: [] },
        }),
      ],
      getRecords: async (dayId) => {
        asked.push(dayId);
        return [
          doc(`${dayId}-record`, {
            dayId,
            kind: 'confirmed',
            createdAt: start,
            supersedesId: null,
            sealed: { arrivedCents: 100_000, lines: [], differences: [] },
          }),
        ];
      },
    },
    identity,
    start,
    new Set(['bill-rent']),
  );

  assert.deepEqual(
    entries.moves.map((entry) => entry.kind).sort(),
    [...CLOSING_MOVE_KINDS].sort(),
    'only the move kinds a closing sums are kept',
  );
  assert.deepEqual(
    entries.moves.map((entry) => entry.id).sort(),
    CLOSING_MOVE_KINDS.map((kind) => `move-${kind}`).sort(),
    'a move keeps its document id',
  );
  assert.deepEqual(
    asked,
    ['day-confirmed'],
    'records are read only for confirmed days',
  );
  assert.deepEqual(
    entries.records.map((entry) => [entry.id, entry.dayId, entry.kind]),
    [['day-confirmed-record', 'day-confirmed', 'confirmed']],
  );
  assert.deepEqual(entries.days, [
    {
      id: 'day-confirmed',
      expectedOn: start + 2 * DAY_MS,
      arrivedOn: start + 3 * DAY_MS,
    },
    { id: 'day-expected', expectedOn: start + 9 * DAY_MS, arrivedOn: null },
  ]);
  assert.deepEqual(
    entries.purchases.map((entry) => [entry.id, entry.amountCents]),
    [['purchase-1', 2_500]],
  );
  assert.equal(entries.startDate, start);
  assert.deepEqual([...entries.billIds], ['bill-rent']);

  console.log('runway month entries: ok');
}

await main();

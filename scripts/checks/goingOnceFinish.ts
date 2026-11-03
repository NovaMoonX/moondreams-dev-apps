import assert from 'node:assert/strict';

import {
  CONTACT_CLEAR_DELAY_MS,
  INQUIRY_CONTACT_FIELDS,
  clearedSaleFields,
  isDueForClearing,
  planFinish,
  scrubInquiry,
  scrubItem,
} from '../../functions/src/apps/going-once/finishPlan.ts';
import { withoutBuyerName } from '../../src/apps/going-once/utils/finish.ts';
import { buildSeedInquiry } from '../seeds/goingOnce.ts';

let passed = 0;
function check(title: string, run: () => void) {
  try {
    run();
  } catch (error) {
    console.error(`FAILED: ${title}`);
    throw error;
  }
  passed += 1;
}

const DAY = 86_400_000;
const START = Date.UTC(2026, 10, 2);
const MAYA = 'maya-uid';

type Doc = Record<string, unknown>;
interface World {
  sale: Doc;
  inquiries: Doc[];
  items: Doc[];
}

const makeWorld = (): World => ({
  sale: {
    ownerUid: MAYA,
    status: 'OPEN',
    finishedAt: null,
    finishedBy: null,
    contactsClearAt: null,
    contactsClearedAt: null,
    publicLinkId: null,
  },
  inquiries: [
    buildSeedInquiry('s', {
      itemId: 'sofa',
      itemTitle: 'Gray sofa',
      name: 'Priya',
      contact: '2065550142',
      message: 'Thursday after 6?',
      sentAt: START,
    }),
    buildSeedInquiry('s', {
      itemId: 'bike',
      itemTitle: 'Road bike',
      name: 'Marcus',
      contact: 'marcus@example.com',
      message: 'What size?',
      sentAt: START,
    }),
    buildSeedInquiry('s', {
      itemId: 'desk',
      itemTitle: 'Oak desk',
      name: 'Nate',
      contact: '2065550123',
      message: 'Saturday',
      sentAt: START,
    }),
  ],
  items: [
    {
      id: 'desk',
      title: 'Oak desk',
      status: 'PENDING',
      askingPriceCents: 15_000,
      pending: { buyerName: 'Nate', pickupOn: 1, markedBy: MAYA, markedAt: 1 },
      sale: null,
      statusHistory: [{ kind: 'MARK_PENDING', buyerName: 'Nate' }],
    },
    {
      id: 'mixer',
      title: 'Stand mixer',
      status: 'SOLD',
      askingPriceCents: 18_000,
      pending: null,
      sale: { priceCents: 17_000, soldOn: 2, buyerName: 'Jo', markedBy: MAYA },
      statusHistory: [
        { kind: 'MARK_PENDING', buyerName: 'Jo' },
        { kind: 'MARK_SOLD', buyerName: null, priceCents: 17_000 },
      ],
    },
    { id: 'lamp', title: 'Floor lamp', status: 'AVAILABLE', pending: null },
  ],
});

const apply = (world: World, action: 'finish' | 'reopen', now: number) => {
  const plan = planFinish(world.sale, action, MAYA, now);
  assert.ok(plan.isOk, plan.isOk ? '' : plan.message);
  Object.assign(world.sale, plan.fields);
};

/** What one run of the daily function does, stopping after `limit` documents are written when given (a crash). */
const runClear = (world: World, now: number, limit = Infinity) => {
  if (!isDueForClearing(world.sale, now))
    return { written: 0, isMarked: false };
  const writes: (() => void)[] = [
    ...world.inquiries.flatMap((inquiry) => {
      const patch = scrubInquiry(inquiry, now);
      return patch === null ? [] : [() => Object.assign(inquiry, patch)];
    }),
    ...world.items.flatMap((item) => {
      const patch = scrubItem(item);
      return patch === null ? [] : [() => Object.assign(item, patch)];
    }),
  ];
  writes.slice(0, limit).forEach((write) => write());
  if (writes.length > limit) return { written: limit, isMarked: false };
  Object.assign(world.sale, clearedSaleFields(now));
  return { written: writes.length, isMarked: true };
};

const holdsBuyerDetails = (world: World) => {
  const text = JSON.stringify([world.inquiries, world.items]);
  return [
    'Priya',
    'Marcus',
    'Nate',
    'Jo',
    '2065550',
    '@example.com',
    'Saturday',
  ].filter((detail) => text.includes(detail));
};

check(
  'finish sets the status, who and when, and a clear day 30 days on',
  () => {
    const world = makeWorld();
    apply(world, 'finish', START);
    assert.equal(world.sale.status, 'FINISHED');
    assert.equal(world.sale.finishedAt, START);
    assert.equal(world.sale.finishedBy, MAYA);
    assert.equal(world.sale.contactsClearAt, START + 30 * DAY);
    assert.equal(CONTACT_CLEAR_DELAY_MS, 30 * DAY);
    assert.equal(world.sale.contactsClearedAt, null);
  },
);

check('finish and reopen refuse a wrong state in words', () => {
  const world = makeWorld();
  const reopen = planFinish(world.sale, 'reopen', MAYA, START);
  assert.deepEqual(reopen, { isOk: false, message: 'Already open.' });
  apply(world, 'finish', START);
  const again = planFinish(world.sale, 'finish', MAYA, START + 1);
  assert.deepEqual(again, { isOk: false, message: 'Already finished.' });
  assert.equal(planFinish({}, 'reopen', MAYA, START).isOk, false);
});

check(
  'reopening at day 10 cancels the clear, and a later finish sets a new one',
  () => {
    const world = makeWorld();
    apply(world, 'finish', START);
    assert.equal(isDueForClearing(world.sale, START + 10 * DAY), false);
    apply(world, 'reopen', START + 10 * DAY);
    assert.equal(world.sale.status, 'OPEN');
    assert.equal(world.sale.contactsClearAt, null);
    assert.equal(runClear(world, START + 31 * DAY).isMarked, false);
    assert.ok(holdsBuyerDetails(world).length > 0);

    apply(world, 'finish', START + 12 * DAY);
    assert.equal(world.sale.contactsClearAt, START + 42 * DAY);
    assert.equal(runClear(world, START + 30 * DAY).isMarked, false);
    assert.equal(runClear(world, START + 41 * DAY).isMarked, false);
    assert.equal(runClear(world, START + 42 * DAY).isMarked, true);
    assert.deepEqual(holdsBuyerDetails(world), []);
  },
);

check(
  'at day 30 the clear leaves no name, phone, email or message, and keeps totals and history',
  () => {
    const world = makeWorld();
    apply(world, 'finish', START);
    assert.equal(runClear(world, START + 30 * DAY - 1).isMarked, false);
    const result = runClear(world, START + 30 * DAY);
    assert.equal(result.isMarked, true);
    assert.deepEqual(holdsBuyerDetails(world), []);
    world.inquiries.forEach((inquiry) => {
      INQUIRY_CONTACT_FIELDS.forEach((field) =>
        assert.equal(inquiry[field], null),
      );
      assert.equal(inquiry.contactClearedAt, START + 30 * DAY);
      assert.ok(inquiry.itemTitleAtSend && inquiry.status);
    });
    const mixer = world.items[1] as { sale: Doc; statusHistory: Doc[] };
    assert.equal(mixer.sale.priceCents, 17_000);
    assert.equal(mixer.sale.soldOn, 2);
    assert.equal(mixer.statusHistory[1].priceCents, 17_000);
    assert.equal(world.sale.contactsClearAt, null);
    assert.equal(world.sale.contactsClearedAt, START + 30 * DAY);
  },
);

check(
  'a run that stops partway is finished by the next, and a third changes nothing',
  () => {
    const world = makeWorld();
    apply(world, 'finish', START);
    const crashed = runClear(world, START + 30 * DAY, 2);
    assert.deepEqual(crashed, { written: 2, isMarked: false });
    assert.equal(world.sale.contactsClearAt, START + 30 * DAY);
    assert.equal(world.sale.contactsClearedAt, null);
    assert.ok(holdsBuyerDetails(world).length > 0);

    const next = runClear(world, START + 31 * DAY);
    assert.equal(next.isMarked, true);
    assert.equal(next.written, 3);
    assert.deepEqual(holdsBuyerDetails(world), []);
    assert.equal(world.sale.contactsClearedAt, START + 31 * DAY);
    assert.deepEqual(runClear(world, START + 32 * DAY), {
      written: 0,
      isMarked: false,
    });
  },
);

check(
  'a resend after the clear is cleared again, decided on the details and not on the stamp',
  () => {
    const resent: Doc = {
      name: 'Priya',
      email: null,
      phone: '2065550142',
      message: 'Still there?',
      contactClearedAt: null,
    };
    assert.ok(scrubInquiry(resent, START));
    const cleared: Doc = { ...resent, ...scrubInquiry(resent, START) };
    assert.equal(scrubInquiry(cleared, START + 1), null);
    assert.ok(
      scrubInquiry(
        { ...cleared, contactClearedAt: START, message: 'Hi' },
        START,
      ),
    );
    assert.equal(
      scrubItem({
        pending: { buyerName: null },
        sale: null,
        statusHistory: [],
      }),
      null,
    );
    assert.equal(scrubItem('x'), null);
  },
);

check(
  'reopening after the clear keeps the details cleared and starts no new clear',
  () => {
    const world = makeWorld();
    apply(world, 'finish', START);
    runClear(world, START + 30 * DAY);
    apply(world, 'reopen', START + 40 * DAY);
    assert.equal(world.sale.status, 'OPEN');
    assert.equal(world.sale.contactsClearAt, null);
    assert.equal(world.sale.contactsClearedAt, START + 30 * DAY);
    assert.equal(isDueForClearing(world.sale, START + 99 * DAY), false);
  },
);

check('after the clear no written record carries a buyer name', () => {
  const sale = { priceCents: 1, buyerName: 'Jo' };
  assert.equal(withoutBuyerName(sale, true)?.buyerName, null);
  assert.equal(withoutBuyerName(sale, true)?.priceCents, 1);
  assert.equal(withoutBuyerName(sale, false), sale);
  assert.equal(withoutBuyerName(null, true), null);
});

console.log(`going once finish checks passed (${passed})`);

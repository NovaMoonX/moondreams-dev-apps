import assert from 'node:assert/strict';

import {
  goingOnceBundleHooks,
  isInquiryWaiting,
  isItemFresh,
  isNewInterest,
  isPushOff,
  isSaleListening,
} from '../../functions/src/apps/going-once/bundleHooks.ts';
import {
  BUNDLE_WINDOW_MS,
  MAX_BUNDLE_ITEMS,
  decideQueue,
  getNextMorning,
  EMPTY_BUNDLE,
  LEASE_MS,
  MAX_ATTEMPTS,
  claimDue,
  isBundleDue,
  planDueSend,
  planRetry,
  putBackQueued,
  settleSent,
  type BundleItem,
  type BundleState,
} from '../../functions/src/notifications/bundledPush.ts';

const ZONE = 'America/Los_Angeles';
// Oct 20 2026 is PDT (UTC-7): local 12:00 is 19:00Z.
const at = (hour: number, minute = 0, day = 20) =>
  Date.UTC(2026, 9, day, hour + 7, minute);

const makeItem = (
  key: string,
  label: string,
  queuedAt: number,
  groupId = 'sale-1',
  groupLabel = 'Fall clear-out',
): BundleItem => ({
  key,
  groupId,
  label,
  groupLabel,
  url: `https://apps.moondreams.dev/going-once?sale=${groupId}&tab=inbox&inquiry=${key}`,
  queuedAt,
});

const { summarize } = goingOnceBundleHooks;
const send = (state: BundleState, confirmed: BundleItem[], now: number) =>
  planDueSend(state, confirmed, summarize) &&
  settleSent(state, state.items, now, true);

// The first inquiry after a quiet spell goes at once and alone.
const first = makeItem('a', 'Gray sofa', at(12));
const afterFirst = decideQueue(undefined, first, ZONE, at(12));
assert.equal(afterFirst.sendNow, true);
assert.equal(afterFirst.next.lastSentAt, at(12));
assert.deepEqual(afterFirst.next.items, []);
assert.deepEqual(summarize([first], { isOvernight: false }), {
  title: 'New interest in Gray sofa',
  body: 'Fall clear-out · Open your inbox to reply.',
  url: first.url,
});

// Three more in the next ten minutes wait, and none moves the time the bundle goes.
const second = makeItem('b', 'Oak desk', at(12, 2));
const third = makeItem('c', 'Road bike', at(12, 5));
const fourth = makeItem('d', 'Gray sofa', at(12, 10));
const queued = [second, third, fourth].reduce<BundleState>((state, item) => {
  const decision = decideQueue(state, item, ZONE, item.queuedAt);
  assert.equal(decision.sendNow, false);
  return decision.next;
}, afterFirst.next);
assert.equal(queued.items.length, 3);
assert.equal(
  queued.nextSendAt,
  at(12) + BUNDLE_WINDOW_MS,
  'goes 15 minutes after the last push',
);
assert.equal(isBundleDue(queued, at(12, 14)), false);
assert.equal(isBundleDue(queued, at(12, 15)), true);
assert.equal(
  decideQueue(queued, second, ZONE, at(12, 11)).next.items.length,
  3,
  'the same inquiry queued twice is one item',
);

const bundle = summarize(queued.items, { isOvernight: false });
assert.deepEqual(bundle, {
  title: '3 new inquiries · Gray sofa and 2 more',
  body: 'Fall clear-out · Open your inbox to reply.',
  url: 'https://apps.moondreams.dev/going-once?sale=sale-1&tab=inbox&view=new',
});
assert.equal(
  planDueSend(queued, [], summarize),
  null,
  'nothing left to tell sends nothing',
);

// After the bundle, the window starts again; a later one is alone only once it is over.
const afterBundle = send(queued, queued.items, at(12, 15));
assert.ok(afterBundle);
assert.equal(
  decideQueue(afterBundle, makeItem('e', 'Lamp', at(12, 20)), ZONE, at(12, 20))
    .sendNow,
  false,
);
assert.equal(
  decideQueue(afterBundle, makeItem('e', 'Lamp', at(12, 31)), ZONE, at(12, 31))
    .sendNow,
  true,
);

// A 23:00 inquiry waits for 08:00 in the sale's zone, and so does everything after it that night.
const night = makeItem('n1', 'Gray sofa', at(23));
const nightQueued = decideQueue(undefined, night, ZONE, at(23));
assert.equal(nightQueued.sendNow, false);
assert.equal(nightQueued.next.nextSendAt, at(8, 0, 21));
const later = decideQueue(
  nightQueued.next,
  makeItem('n2', 'Oak desk', at(2, 0, 21)),
  ZONE,
  at(2, 0, 21),
).next;
assert.equal(later.nextSendAt, at(8, 0, 21));
assert.equal(later.items.length, 2);
assert.equal(isBundleDue(later, at(7, 59, 21)), false);
assert.equal(isBundleDue(later, at(8, 0, 21)), true);
assert.equal(
  summarize(later.items, { isOvernight: true }).title,
  '2 new inquiries overnight · Oak desk and 1 more',
);
assert.equal(
  getNextMorning(at(5), ZONE),
  at(8),
  'before 08:00 it is the same morning',
);
assert.equal(getNextMorning(at(9), ZONE), at(8, 0, 21));
assert.equal(
  decideQueue(undefined, first, 'Not/AZone', Date.UTC(2026, 9, 20, 23)).next
    .nextSendAt,
  Date.UTC(2026, 9, 21, 8),
  'an unknown zone reads as UTC',
);
assert.equal(
  decideQueue(undefined, first, null, Date.UTC(2026, 9, 20, 23)).next
    .nextSendAt,
  Date.UTC(2026, 9, 21, 8),
  'no zone reads as UTC',
);
// A window that ends in quiet hours goes at 08:00, not at the window's end.
const lateWindow = decideQueue(
  { ...EMPTY_BUNDLE, lastSentAt: at(21, 50), zone: ZONE },
  first,
  ZONE,
  at(21, 55),
);
assert.equal(lateWindow.next.nextSendAt, at(8, 0, 21));

// An inquiry handled before its bundle left is left out; cleared, deleted and finished sales too; a deleted thing still counts.
const fresh = {
  status: 'NEW',
  name: 'Priya',
  email: null,
  phone: '5551234',
  message: 'Still there?',
};
assert.equal(isInquiryWaiting(fresh), true);
assert.equal(
  isInquiryWaiting({ ...fresh, status: 'HANDLED' }),
  false,
  'handled',
);
assert.equal(
  isInquiryWaiting({ ...fresh, name: null, phone: null, message: null }),
  false,
  'cleared',
);
assert.equal(isInquiryWaiting(undefined), false, 'deleted');
const stillWaiting = queued.items.filter((_, index) =>
  isInquiryWaiting(index === 1 ? { ...fresh, status: 'HANDLED' } : fresh),
);
assert.deepEqual(
  stillWaiting.map((item) => item.key),
  ['b', 'd'],
);
assert.equal(
  summarize(stillWaiting, { isOvernight: false }).title,
  '2 new inquiries · Gray sofa and 1 more',
);
assert.equal(
  isSaleListening({ members: ['maya', 'theo'] }, 'theo'),
  true,
  'a sale without a status reads as open',
);
assert.equal(
  isSaleListening({ status: 'OPEN', members: ['maya'] }, 'theo'),
  false,
  'left the sale',
);
assert.equal(
  isSaleListening({ status: 'FINISHED', members: ['theo'] }, 'theo'),
  false,
  'finished',
);
assert.equal(isSaleListening(undefined, 'theo'), false, 'sale gone');
assert.equal(isPushOff({ inquiryPushOffSaleIds: ['sale-1'] }, 'sale-1'), true);
assert.equal(isPushOff({ inquiryPushOffSaleIds: ['sale-2'] }, 'sale-1'), false);
assert.equal(isPushOff(undefined, 'sale-1'), false, 'on by default');

// Only a new inquiry or one reopened from Handled pushes.
assert.equal(isNewInterest(undefined, fresh), true);
assert.equal(
  isNewInterest({ ...fresh, status: 'HANDLED' }, fresh),
  true,
  'reopened',
);
assert.equal(
  isNewInterest(fresh, { ...fresh, message: 'Hello again' }),
  false,
  'a resend while still New',
);
assert.equal(
  isNewInterest(fresh, { ...fresh, status: 'HANDLED' }),
  false,
  'handled',
);
assert.equal(isNewInterest(fresh, undefined), false, 'deleted');

// Several sales, and the cap on what is kept.
const other = makeItem('x', 'Bike', at(12, 8), 'sale-2', 'Garage sale');
const several = summarize([first, other], { isOvernight: false });
assert.equal(
  several.title,
  '2 new inquiries in Garage sale and Fall clear-out',
);
assert.equal(several.url, 'https://apps.moondreams.dev/going-once');
const flood = Array.from({ length: MAX_BUNDLE_ITEMS + 5 }, (_, index) =>
  makeItem(`k${index}`, 'Thing', at(12, 1)),
);
const capped = flood.reduce<BundleState>(
  (state, item) => decideQueue(state, item, ZONE, at(12, 1)).next,
  afterFirst.next,
);
assert.equal(capped.items.length, MAX_BUNDLE_ITEMS);
assert.equal(
  capped.items.at(-1)?.key,
  `k${MAX_BUNDLE_ITEMS + 4}`,
  'the newest are kept',
);

// A failed send never drops: the claim keeps the items, a lease holds other runs off, and a retry stays out of quiet hours.
const due = { ...queued, nextSendAt: at(12, 15) };
const claim = claimDue(due, at(12, 15));
assert.equal(claim.kind, 'send');
if (claim.kind !== 'send') throw new Error('expected a claim');
assert.equal(claim.next.items.length, 3, 'claiming keeps the items');
assert.equal(claim.next.sending.length, 3);
assert.equal(claim.next.attempts, 1);
assert.equal(
  claim.next.lastSentAt,
  at(12),
  'claiming does not move lastSentAt',
);
assert.equal(isBundleDue(claim.next, at(12, 16)), false, 'leased');
assert.equal(claimDue(claim.next, at(12, 16)).kind, 'skip');
const reclaimed = claimDue(claim.next, at(12, 15) + LEASE_MS);
assert.equal(reclaimed.kind, 'send', 'an expired lease is claimed again');
assert.equal(reclaimed.kind === 'send' && reclaimed.next.attempts, 2);

const lateFail = planRetry({ ...claim.next, zone: ZONE }, at(21, 59));
assert.equal(lateFail.items.length, 3, 'a failed send keeps every item');
assert.equal(
  lateFail.nextSendAt,
  at(8, 0, 21),
  'a retry never lands in quiet hours',
);
assert.equal(lateFail.sendingUntil, null);
assert.equal(
  planRetry(claim.next, at(12, 16)).nextSendAt,
  at(12, 17),
  'by day a retry is a minute on',
);

let tries = claim.next;
for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
  const again = claimDue({ ...tries, nextSendAt: at(13) }, at(13));
  assert.equal(again.kind, 'send');
  tries = again.kind === 'send' ? again.next : tries;
}
assert.equal(tries.attempts, MAX_ATTEMPTS);
const gaveUp = claimDue({ ...tries, nextSendAt: at(14) }, at(14));
assert.equal(gaveUp.kind, 'give-up', 'five tries and it gives up');
assert.deepEqual(gaveUp.kind === 'give-up' && gaveUp.next.items, []);
assert.equal(gaveUp.kind === 'give-up' && gaveUp.next.attempts, 0);

// Items that came in during a send wait for their own window; an acknowledged send moves lastSentAt.
const during = makeItem('z', 'Lamp', at(12, 16));
const acknowledged = settleSent(
  { ...claim.next, items: [...claim.next.items, during] },
  claim.sending,
  at(12, 16),
  true,
);
assert.deepEqual(
  acknowledged.items.map((item) => item.key),
  ['z'],
);
assert.equal(acknowledged.lastSentAt, at(12, 16));
assert.equal(acknowledged.nextSendAt, at(12, 16) + BUNDLE_WINDOW_MS);
assert.equal(acknowledged.sendingUntil, null);
assert.equal(acknowledged.attempts, 0);

// A bundle whose items were all handled meanwhile sends nothing and leaves lastSentAt alone.
const handled = settleSent(claim.next, claim.sending, at(12, 11), false);
assert.equal(handled.lastSentAt, at(12));
assert.equal(handled.nextSendAt, null);
assert.equal(
  decideQueue(handled, makeItem('h', 'Chair', at(12, 11)), ZONE, at(12, 11))
    .sendNow,
  false,
  'still inside the window of the last real push',
);
assert.equal(
  decideQueue(handled, makeItem('h', 'Chair', at(12, 11)), ZONE, at(12, 11))
    .next.nextSendAt,
  at(12) + BUNDLE_WINDOW_MS,
);

// A failed immediate send puts the item back, deduped by key, outside quiet hours, with the window given back.
const immediate = decideQueue(undefined, first, ZONE, at(21, 59));
const putBack = putBackQueued(
  immediate.next,
  first,
  at(21, 59),
  null,
  at(21, 59),
  ZONE,
);
assert.deepEqual(
  putBack.items.map((item) => item.key),
  ['a'],
);
assert.equal(putBack.lastSentAt, null);
assert.equal(putBack.nextSendAt, at(8, 0, 21));
assert.equal(
  putBackQueued(
    putBack,
    { ...first, queuedAt: at(22) },
    at(21, 59),
    null,
    at(22),
    ZONE,
  ).items.length,
  1,
  'queued twice is one item',
);

// Items older than a day are no longer news.
assert.equal(isItemFresh(first, first.queuedAt + 86_400_000), true);
assert.equal(isItemFresh(first, first.queuedAt + 86_400_001), false);

// Nothing a buyer wrote reaches a payload: build the items from an inquiry full of marker values.
const buyer = {
  name: 'ZZ-BUYER-NAME',
  email: 'zz-buyer@example.com',
  phone: '5550001111',
  message: 'ZZ-MESSAGE',
  priceCents: 12345,
};
const payloadItems = [
  { ...makeItem('p1', 'Gray sofa', at(12)), buyer },
  { ...makeItem('p2', 'Oak desk', at(12, 1)), buyer },
];
const payloads = [
  summarize([payloadItems[0]], { isOvernight: false }),
  summarize(payloadItems, { isOvernight: false }),
  summarize(payloadItems, { isOvernight: true }),
  summarize([...payloadItems, other], { isOvernight: false }),
];
payloads.forEach((payload) => {
  const text = JSON.stringify(payload);
  [
    buyer.name,
    buyer.email,
    buyer.phone,
    buyer.message,
    String(buyer.priceCents),
    '$',
  ].forEach((secret) =>
    assert.equal(text.includes(secret), false, `payload leaks ${secret}`),
  );
});

console.log('going-once push: ok');

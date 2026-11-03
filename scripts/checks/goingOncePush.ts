import assert from 'node:assert/strict';

import {
  goingOnceBundleHooks,
  isInquiryWaiting,
  isNewInterest,
  isPushOff,
  isSaleListening,
} from '../../functions/src/apps/going-once/bundleHooks.ts';
import {
  BUNDLE_WINDOW_MS,
  MAX_BUNDLE_ITEMS,
  decideQueue,
  getNextMorning,
  isBundleDue,
  planDueSend,
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
  planDueSend(state, confirmed, summarize) && {
    ...state,
    lastSentAt: now,
    nextSendAt: null,
    items: [],
  };

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
  { lastSentAt: at(21, 50), nextSendAt: null, items: [], zone: ZONE },
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

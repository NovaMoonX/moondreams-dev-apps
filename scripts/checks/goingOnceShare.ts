import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SHARE_ID_LENGTH,
  isShareId,
  mintShareId,
} from '../../functions/src/share/shareIds.ts';
import {
  NOT_FOUND_RESULT,
  PUBLIC_CONDITIONS,
  PUBLIC_STATUSES,
  SALE_PAGE_LIMITS,
  isLinkId,
  COPY_SIZES,
  isListable as isListableOnServer,
  publicCopyPath,
  readCopyablePhotos,
  sealPage,
  toPublicSale,
  toPublicThing,
  toSalePage,
} from '../../functions/src/apps/going-once/salePageView.ts';
import * as clientConstants from '../../src/apps/going-once/constants.ts';
import { isListable as isListableOnClient } from '../../src/apps/going-once/utils/listing.ts';
import { SEED_SALE_LINK_ID } from '../seeds/goingOnce.ts';

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

const OWNER = 'owner-uid-secret';
const photo = {
  id: 'p1',
  path: 'apps/going-once/sales/s/items/i/p1.jpg',
  width: 1,
  height: 1,
  sizeBytes: 1,
  createdAt: 1,
};

const thing = (extra: Record<string, unknown> = {}) => ({
  id: 'gray-sofa',
  saleId: 'sale-id-secret',
  title: 'Gray sofa',
  condition: 'LIKE_NEW',
  askingPriceCents: 35_000,
  floorPriceCents: 30_000,
  description: 'Comfy.',
  brandModel: 'West Elm',
  size: '84 in',
  originalPriceCents: 90_000,
  showOriginalPrice: false,
  boughtFrom: 'West Elm, 2021',
  boughtOn: 1,
  boughtUrl: 'https://store.example/sofa',
  boughtUrlPreview: { title: 'Sofa' },
  notes: 'Private note',
  photos: [photo],
  status: 'AVAILABLE',
  pending: { buyerName: 'Nate secret', inquiryId: 'inq-secret' },
  sale: { priceCents: 1, buyerName: 'Buyer secret' },
  statusHistory: [{ buyerName: 'History secret' }],
  createdBy: OWNER,
  createdAt: 5,
  lastEditedAt: 6,
  lastEditedBy: OWNER,
  ...extra,
});

const sale = (extra: Record<string, unknown> = {}) => ({
  id: 'sale-id-secret',
  name: 'Fall clear-out',
  pickupArea: 'Capitol Hill, Seattle',
  buyerNote: 'Evenings.',
  currency: 'USD',
  ownerUid: OWNER,
  createdBy: OWNER,
  members: [OWNER, 'theo-uid-secret'],
  memberJoinedAt: { 'theo-uid-secret': 1 },
  publicLinkId: 'secret-link',
  timeZone: 'America/Los_Angeles',
  status: 'OPEN',
  createdAt: 1,
  lastEditedAt: null,
  ...extra,
});

const THING_KEYS = [
  'askingPriceCents',
  'brandModel',
  'condition',
  'description',
  'id',
  'originalPriceCents',
  'photos',
  'size',
  'status',
  'title',
];

check("every cap and list here equals the app's own", () => {
  const client: Record<string, unknown> = clientConstants;
  Object.entries(SALE_PAGE_LIMITS)
    .filter(([name]) => name !== 'MAX_PAGE_THINGS')
    .forEach(([name, value]) =>
      assert.equal(
        client[name],
        value,
        `${name} drifted from src/apps/going-once/constants.ts`,
      ),
    );
  assert.deepEqual(
    [...PUBLIC_CONDITIONS].sort(),
    clientConstants.CONDITION_OPTIONS.map((option) => option.value).sort(),
  );
  assert.deepEqual(
    [...PUBLIC_STATUSES],
    clientConstants.STATUS_VIEWS.filter((status) => status !== 'SOLD'),
  );
});

check(
  'the listable test gives the same answer as the app, case by case',
  () => {
    const cases = [
      { photos: [photo], title: 'Sofa', askingPriceCents: 100 },
      { photos: [photo], title: 'Sofa', askingPriceCents: 0 },
      { photos: [photo], title: 'Sofa', askingPriceCents: null },
      { photos: [], title: 'Sofa', askingPriceCents: 100 },
      { photos: [photo], title: '', askingPriceCents: 100 },
      { photos: [photo], title: '   ', askingPriceCents: 100 },
      { photos: [photo, photo], title: ' Sofa ', askingPriceCents: 5 },
    ];
    cases.forEach((item) =>
      assert.equal(
        isListableOnServer(item),
        isListableOnClient(item),
        JSON.stringify(item),
      ),
    );
    [null, undefined, 'x', 3, [], {}].forEach((value) =>
      assert.equal(isListableOnServer(value), false),
    );
  },
);

check(
  'a thing keeps exactly the named public keys and drops everything else',
  () => {
    const result = toPublicThing(thing());
    assert.ok(result);
    assert.deepEqual(Object.keys(result).sort(), THING_KEYS);
    const body = JSON.stringify(result);
    [
      OWNER,
      'sale-id-secret',
      'West Elm, 2021',
      'store.example',
      'Private note',
      'Nate secret',
      'inq-secret',
      'Buyer secret',
      'History secret',
    ].forEach((secret) => assert.ok(!body.includes(secret), secret));
  },
);

check('the original price leaves only when the seller chose to show it', () => {
  assert.equal(toPublicThing(thing())?.originalPriceCents, null);
  assert.equal(
    toPublicThing(thing({ showOriginalPrice: true }))?.originalPriceCents,
    90_000,
  );
  assert.equal(
    toPublicThing(thing({ showOriginalPrice: 'true' }))?.originalPriceCents,
    null,
  );
});

check(
  'only Available and listable things are served, Pending too, never Sold or taken off',
  () => {
    assert.ok(toPublicThing(thing({ status: 'PENDING' })));
    ['SOLD', 'WITHDRAWN', 'sold', '', null, 7].forEach((status) =>
      assert.equal(toPublicThing(thing({ status })), null, String(status)),
    );
    assert.equal(toPublicThing(thing({ photos: [] })), null);
    assert.equal(toPublicThing(thing({ title: '  ' })), null);
    assert.equal(toPublicThing(thing({ askingPriceCents: null })), null);
    assert.ok(toPublicThing(thing({ askingPriceCents: 0 })));
    assert.equal(toPublicThing(thing({ askingPriceCents: -1 })), null);
    assert.equal(toPublicThing(thing({ id: '../x' })), null);
  },
);

check(
  'a text field is cut to its cap and an unknown condition reads as none',
  () => {
    const long = 'x'.repeat(5000);
    const result = toPublicThing(
      thing({ title: long, description: long, condition: 'MINT' }),
    );
    assert.ok(result);
    assert.equal(result.title.length, SALE_PAGE_LIMITS.MAX_ITEM_TITLE_LENGTH);
    assert.equal(
      result.description?.length,
      SALE_PAGE_LIMITS.MAX_ITEM_DESCRIPTION_LENGTH,
    );
    assert.equal(result.condition, null);
  },
);

check('the sale keeps its name, pickup area and note and nothing else', () => {
  const result = toPublicSale(sale());
  assert.deepEqual(result, {
    name: 'Fall clear-out',
    pickupArea: 'Capitol Hill, Seattle',
    buyerNote: 'Evenings.',
  });
  assert.equal(toPublicSale(sale({ name: '' })), null);
});

check(
  'the page orders Available before Pending and holds no id, uid, name or email',
  () => {
    const page = toSalePage(
      sale(),
      [
        thing({ id: 'a', status: 'PENDING', title: 'Desk' }),
        thing({ id: 'b', title: 'Lamp' }),
        thing({ id: 'c', status: 'SOLD', title: 'Mixer' }),
        thing({ id: 'd', title: 'Unlisted', photos: [] }),
      ],
      true,
    );
    assert.ok(page.status === 'ok');
    assert.deepEqual(
      page.things.map((entry) => entry.id),
      ['b', 'a'],
    );
    assert.deepEqual(Object.keys(page).sort(), [
      'isMember',
      'sale',
      'status',
      'things',
    ]);
    const body = JSON.stringify(page);
    [OWNER, 'theo-uid-secret', 'sale-id-secret', 'secret-link', 'UTC'].forEach(
      (secret) => assert.ok(!body.includes(secret), secret),
    );
  },
);

check(
  'the final pass drops a field a later edit added and a thing that no longer fits',
  () => {
    const page = toSalePage(sale(), [thing()], false);
    assert.ok(page.status === 'ok');
    const tampered = {
      ...page,
      ownerUid: OWNER,
      sale: { ...page.sale, members: [OWNER] },
      things: [
        { ...page.things[0], floorPriceCents: 30_000, notes: 'Private note' },
        { ...page.things[0], status: 'SOLD' },
      ],
    };
    const sealed = sealPage(tampered as never);
    assert.ok(sealed.status === 'ok');
    assert.deepEqual(Object.keys(sealed).sort(), [
      'isMember',
      'sale',
      'status',
      'things',
    ]);
    assert.deepEqual(Object.keys(sealed.sale).sort(), [
      'buyerNote',
      'name',
      'pickupArea',
    ]);
    assert.equal(sealed.things.length, 1);
    assert.deepEqual(Object.keys(sealed.things[0]).sort(), THING_KEYS);
  },
);

check(
  'a sale with no name, and anything that is not a page, answers the one not-found',
  () => {
    assert.deepEqual(
      toSalePage(sale({ name: '' }), [thing()], false),
      NOT_FOUND_RESULT,
    );
    assert.deepEqual(sealPage(NOT_FOUND_RESULT), NOT_FOUND_RESULT);
    assert.equal(
      JSON.stringify(sealPage({ status: 'gone' } as never)),
      JSON.stringify(NOT_FOUND_RESULT),
    );
  },
);

check('the page never serves more than 300 things', () => {
  const items = Array.from({ length: 320 }, (_, index) =>
    thing({ id: `t${index}` }),
  );
  const page = toSalePage(sale(), items, false);
  assert.ok(page.status === 'ok');
  assert.equal(page.things.length, SALE_PAGE_LIMITS.MAX_PAGE_THINGS);
});

check('link ids are the minted 26-character shape and nothing looser', () => {
  assert.equal(SHARE_ID_LENGTH, 26);
  const minted = mintShareId();
  assert.ok(isLinkId(minted) && isShareId(minted));
  assert.ok(isLinkId(SEED_SALE_LINK_ID));
  [
    '',
    'short',
    minted.toUpperCase(),
    `${minted}a`,
    minted.slice(1),
    `${minted.slice(1)}0`,
    `${minted.slice(1)}/`,
    `${minted.slice(1)}\n`,
    '../../publicLinks/x',
    7,
    null,
    {},
  ].forEach((value) => assert.equal(isLinkId(value), false, String(value)));
});

const LINK = 'seedsalefall23456789abcdef';
const PHOTO_A = 'photo-aaaa-1';
const PHOTO_B = 'photo-bbbb-2';
const listedPhoto = (id: string, itemId = 'gray-sofa') => ({
  ...photo,
  id,
  path: `apps/going-once/sales/sale-id-secret/items/${itemId}/${id}.jpg`,
});
const copyListing = (ids: string[], itemId = 'gray-sofa') => ({
  saleId: 'sale-id-secret',
  linkId: LINK,
  paths: new Set(
    ids.flatMap((id) => [
      publicCopyPath(LINK, itemId, id, 's'),
      publicCopyPath(LINK, itemId, id, 'm'),
    ]),
  ),
});

check(
  'photos are the public copies only, cover first, in the thing order, and only once both sizes exist',
  () => {
    const item = thing({
      photos: [listedPhoto(PHOTO_A), listedPhoto(PHOTO_B)],
    });
    const result = toPublicThing(item, copyListing([PHOTO_A, PHOTO_B]));
    assert.ok(result);
    assert.deepEqual(
      result.photos.map((entry) => entry.s),
      [
        publicCopyPath(LINK, 'gray-sofa', PHOTO_A, 's'),
        publicCopyPath(LINK, 'gray-sofa', PHOTO_B, 's'),
      ],
    );
    assert.deepEqual(
      toPublicThing(
        { ...item, photos: [...item.photos].reverse() },
        copyListing([PHOTO_A, PHOTO_B]),
      )?.photos[0].m,
      publicCopyPath(LINK, 'gray-sofa', PHOTO_B, 'm'),
    );
    assert.equal(toPublicThing(item, copyListing([PHOTO_B]))?.photos.length, 1);
    assert.equal(toPublicThing(item, null)?.photos.length, 0);
    const half = copyListing([PHOTO_A]);
    half.paths = new Set([publicCopyPath(LINK, 'gray-sofa', PHOTO_A, 's')]);
    assert.equal(toPublicThing(item, half)?.photos.length, 0);
    const body = JSON.stringify(
      toSalePage(sale(), [item], false, copyListing([PHOTO_A, PHOTO_B])),
    );
    assert.ok(
      !body.includes('/sales/'),
      'a listing-size path reached the page',
    );
    assert.ok(!body.includes('.jpg'));
    assert.ok(body.includes('/public/'));
  },
);

check(
  'at most 12 photos get copies and a path outside the thing is refused',
  () => {
    const ids = Array.from(
      { length: 14 },
      (_, index) => `photo-id-${index + 10}`,
    );
    const many = thing({ photos: ids.map((id) => listedPhoto(id)) });
    assert.equal(
      readCopyablePhotos('sale-id-secret', 'gray-sofa', many).length,
      12,
    );
    const odd = thing({
      photos: [
        listedPhoto(PHOTO_A, 'other-thing'),
        { ...listedPhoto(PHOTO_B), id: '../x' },
        {
          ...listedPhoto('photo-cccc-3'),
          path: 'apps/going-once/sales/sale-id-secret/items/gray-sofa/../x.jpg',
        },
        listedPhoto('photo-dddd-4'),
      ],
    });
    assert.deepEqual(
      readCopyablePhotos('sale-id-secret', 'gray-sofa', odd).map(
        (entry) => entry.id,
      ),
      ['photo-dddd-4'],
    );
    assert.deepEqual(COPY_SIZES, { s: 480, m: 1280 });
  },
);

check(
  'the final pass keeps a well-formed copy path and drops any other string',
  () => {
    const page = toSalePage(
      sale(),
      [thing({ photos: [listedPhoto(PHOTO_A)] })],
      false,
      copyListing([PHOTO_A]),
    );
    assert.ok(page.status === 'ok');
    const tampered = {
      ...page,
      things: [
        {
          ...page.things[0],
          photos: [
            ...page.things[0].photos,
            { s: 'apps/going-once/sales/x/items/y/z.jpg', m: 'x' },
            { s: 5, m: null },
            { ...page.things[0].photos[0], extra: 'secret-extra' },
          ],
        },
      ],
    };
    const sealed = sealPage(tampered as never);
    assert.ok(sealed.status === 'ok');
    assert.equal(sealed.things[0].photos.length, 2);
    assert.deepEqual(Object.keys(sealed.things[0].photos[1]).sort(), [
      'm',
      's',
    ]);
    assert.ok(!JSON.stringify(sealed).includes('secret-extra'));
  },
);

const firestoreRules = readFileSync('firestore.rules', 'utf8');
const saleBlock = firestoreRules.slice(
  firestoreRules.indexOf('match /apps/going-once/sales/{saleId} {'),
  firestoreRules.indexOf('match /apps/going-once/emailInvites/{inviteId}'),
);

check(
  "the rules never let a client write the sale's link fields, and have no publicLinks rule",
  () => {
    assert.ok(
      saleBlock.includes(
        "hasOnly(['name', 'pickupArea', 'buyerNote', 'lastEditedAt'])",
      ),
    );
    assert.ok(saleBlock.includes("get('publicLinkId', null) == null"));
    assert.ok(saleBlock.includes("get('publicLinkChangedAt', null) == null"));
    assert.ok(!firestoreRules.includes('/apps/going-once/publicLinks'));
  },
);

check(
  'nothing shared names an app, and the public function never reads the private fields',
  () => {
    [
      'functions/src/share/shareIds.ts',
      'functions/src/share/shareFiles.ts',
      'functions/src/share/imageCopies.ts',
    ].forEach((path) =>
      assert.ok(
        !/recipe|pinch|sale|trip/i.test(readFileSync(path, 'utf8')),
        path,
      ),
    );
    const view = readFileSync(
      'functions/src/apps/going-once/salePageView.ts',
      'utf8',
    );
    [
      'floorPriceCents',
      'boughtFrom',
      'boughtUrl',
      'notes',
      'statusHistory',
      'ownerUid',
      'members',
      'buyerName',
    ].forEach((field) =>
      assert.ok(!view.includes(field), `${field} is named in salePageView.ts`),
    );
  },
);

console.log(`going once share checks passed (${passed})`);

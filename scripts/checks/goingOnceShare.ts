import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SHARE_ID_LENGTH,
  isShareId,
  mintShareId,
} from '../../functions/src/share/shareIds.ts';
import {
  FINISHED_SALE_STATUS,
  NOT_FOUND_RESULT,
  PUBLIC_CONDITIONS,
  PUBLIC_STATUSES,
  SALE_PAGE_LIMITS,
  isLinkId,
  COPY_SIZES,
  isListable as isListableOnServer,
  publicCopyPath,
  readCopyablePhotos,
  readBundleDeal,
  sealPage,
  toPublicSale,
  toPublicThing,
  toSalePage,
} from '../../functions/src/apps/going-once/salePageView.ts';
import {
  INQUIRY_LIMITS,
  readContact as readContactOnServer,
  toInquiryId,
} from '../../functions/src/apps/going-once/inquiryView.ts';
import { OPEN_SALE_STATUS } from '../../functions/src/apps/going-once/finishPlan.ts';
import * as clientConstants from '../../src/apps/going-once/constants.ts';
import { getBundleParts } from '../../src/apps/going-once/utils/bundles.ts';
import { readContact as readContactOnClient } from '../../src/apps/going-once/utils/contact.ts';
import {
  isListable as isListableOnClient,
  listingText,
} from '../../src/apps/going-once/utils/listing.ts';
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
  showBoughtUrl: false,
  isDraft: false,
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
  paymentMethods: ['Cash', 'Venmo'],
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
  'bundleId',
  'condition',
  'description',
  'id',
  'isBundleOnly',
  'originalPriceCents',
  'photos',
  'size',
  'status',
  'storeUrl',
  'title',
];

check("every cap and list here equals the app's own", () => {
  const client: Record<string, unknown> = clientConstants;
  Object.entries(SALE_PAGE_LIMITS)
    .filter(([name]) => !['MAX_PAGE_THINGS', 'MAX_PAGE_BUNDLES'].includes(name))
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

check("the finished status is the functions' and the client's", () => {
  assert.equal(clientConstants.FINISHED_SALE_STATUS, FINISHED_SALE_STATUS);
  assert.deepEqual(
    Object.keys(clientConstants.SALE_STATUS_LABELS).sort(),
    [FINISHED_SALE_STATUS, OPEN_SALE_STATUS].sort(),
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
      { photos: [photo], title: 'Sofa', askingPriceCents: 100, isDraft: true },
    ].map((item) => ({ isDraft: false, ...item }));
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
    const legacy = { photos: [photo], title: 'Sofa', askingPriceCents: 100 };
    assert.equal(isListableOnServer(legacy), true);
    assert.equal(
      isListableOnClient({ ...legacy, isDraft: undefined as never }),
      true,
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

check('a draft is never public; a thing from before drafts is not one', () => {
  assert.equal(toPublicThing(thing({ isDraft: true })), null);
  assert.ok(toPublicThing(thing({ isDraft: false })));
  const legacy = { ...thing(), isDraft: undefined };
  assert.ok(toPublicThing(legacy));
  const page = toSalePage(sale(), [thing({ isDraft: true })], false);
  assert.ok(page.status === 'ok');
  assert.equal(page.things.length, 0);
});

check(
  "the store's link leaves only when shown, only as a plain web link",
  () => {
    assert.equal(toPublicThing(thing())?.storeUrl, null);
    const shown = (extra: Record<string, unknown>) =>
      toPublicThing(thing({ showBoughtUrl: true, ...extra }))?.storeUrl;
    assert.equal(shown({}), 'https://store.example/sofa');
    assert.equal(
      shown({ boughtUrl: 'http://store.example/a' }),
      'http://store.example/a',
    );
    [
      'javascript:alert(1)',
      'data:text/html,x',
      'ftp://store.example/a',
      'store.example/sofa',
      '',
      null,
      7,
      'https://store.example/' +
        'a'.repeat(SALE_PAGE_LIMITS.MAX_STORE_URL_LENGTH),
    ].forEach((boughtUrl) =>
      assert.equal(shown({ boughtUrl }), null, String(boughtUrl)),
    );
    assert.equal(
      shown({ boughtUrl: 'https://me:secret@store.example/sofa?id=4#reviews' }),
      'https://store.example/sofa?id=4',
      'credentials and the fragment never leave',
    );
    ['true', 1, null, undefined].forEach((showBoughtUrl) =>
      assert.equal(
        toPublicThing(thing({ showBoughtUrl }))?.storeUrl,
        null,
        String(showBoughtUrl),
      ),
    );
    const body = JSON.stringify(toPublicThing(thing({ showBoughtUrl: true })));
    ['West Elm, 2021', 'Haven'].forEach((secret) =>
      assert.ok(!body.includes(secret), secret),
    );
    const sealed = sealPage(
      {
        status: 'ok',
        sale: toPublicSale(sale()) as never,
        things: [
          { ...toPublicThing(thing())!, storeUrl: 'javascript:alert(1)' },
        ],
        bundles: [],
        isMember: false,
      },
      null,
    );
    assert.ok(sealed.status === 'ok');
    assert.equal(sealed.things[0].storeUrl, null);
  },
);

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
    paymentMethods: ['Cash', 'Venmo'],
  });
  assert.equal(toPublicSale(sale({ name: '' })), null);
});

check(
  'the ways to pay are trimmed, capped, emptied of blanks and at most 8',
  () => {
    const methods = (paymentMethods: unknown) =>
      toPublicSale(sale({ paymentMethods }))?.paymentMethods;
    const long = 'x'.repeat(100);
    assert.deepEqual(methods([' Cash ', '', '   ', 7, null, long]), [
      'Cash',
      'x'.repeat(SALE_PAGE_LIMITS.MAX_PAYMENT_METHOD_LENGTH),
    ]);
    assert.equal(
      methods(Array.from({ length: 20 }, (_, index) => 'm' + index))?.length,
      SALE_PAGE_LIMITS.MAX_PAYMENT_METHODS,
    );
    ['Cash', 7, null, undefined, {}].forEach((value) =>
      assert.deepEqual(methods(value), [], String(value)),
    );
    const legacy = { ...sale(), paymentMethods: undefined };
    assert.deepEqual(toPublicSale(legacy)?.paymentMethods, []);
    const sealed = sealPage(
      {
        status: 'ok',
        sale: {
          ...toPublicSale(sale())!,
          paymentMethods: [long, ' ', 'Zelle'],
        },
        things: [],
        bundles: [],
        isMember: false,
      },
      null,
    );
    assert.ok(sealed.status === 'ok');
    assert.deepEqual(sealed.sale.paymentMethods, [
      'x'.repeat(SALE_PAGE_LIMITS.MAX_PAYMENT_METHOD_LENGTH),
      'Zelle',
    ]);
  },
);

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
      'bundles',
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
    const sealed = sealPage(tampered as never, null);
    assert.ok(sealed.status === 'ok');
    assert.deepEqual(Object.keys(sealed).sort(), [
      'bundles',
      'isMember',
      'sale',
      'status',
      'things',
    ]);
    assert.deepEqual(Object.keys(sealed.sale).sort(), [
      'buyerNote',
      'name',
      'paymentMethods',
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
    assert.deepEqual(sealPage(NOT_FOUND_RESULT, null), NOT_FOUND_RESULT);
    assert.equal(
      JSON.stringify(sealPage({ status: 'gone' } as never, null)),
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
    const sealed = sealPage(tampered as never, LINK);
    assert.ok(sealed.status === 'ok');
    assert.equal(sealed.things[0].photos.length, 2);
    assert.deepEqual(Object.keys(sealed.things[0].photos[1]).sort(), [
      'm',
      's',
    ]);
    assert.ok(!JSON.stringify(sealed).includes('secret-extra'));
  },
);

check(
  'the final pass drops a path from another link or thing, a swapped size and two different photos',
  () => {
    const own = (id: string, size: 's' | 'm') =>
      publicCopyPath(LINK, 'gray-sofa', id, size);
    const OTHER_LINK = 'seedsalefall23456789abcdeh';
    const page = toSalePage(
      sale(),
      [thing({ photos: [listedPhoto(PHOTO_A)] })],
      false,
      copyListing([PHOTO_A]),
    );
    assert.ok(page.status === 'ok');
    const seal = (photos: unknown[], linkId: string | null = LINK) => {
      const sealed = sealPage(
        { ...page, things: [{ ...page.things[0], photos }] } as never,
        linkId,
      );
      assert.ok(sealed.status === 'ok');
      return sealed.things[0].photos.length;
    };
    const good = { s: own(PHOTO_A, 's'), m: own(PHOTO_A, 'm') };
    assert.equal(seal([good]), 1);
    assert.equal(seal([good], OTHER_LINK), 0, 'a path under another link');
    assert.equal(seal([good], null), 0, 'a page with no link');
    assert.equal(
      seal([
        { s: publicCopyPath(OTHER_LINK, 'gray-sofa', PHOTO_A, 's'), m: good.m },
      ]),
      0,
      'one path under another link',
    );
    assert.equal(
      seal([
        {
          s: publicCopyPath(LINK, 'other-thing', PHOTO_A, 's'),
          m: publicCopyPath(LINK, 'other-thing', PHOTO_A, 'm'),
        },
      ]),
      0,
      'paths under another thing',
    );
    assert.equal(seal([{ s: good.m, m: good.s }]), 0, 'sizes swapped');
    assert.equal(
      seal([{ s: own(PHOTO_A, 's'), m: own(PHOTO_B, 'm') }]),
      0,
      'two different photos',
    );
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
        "hasOnly(['name', 'pickupArea', 'buyerNote', 'paymentMethods', 'lastEditedAt'])",
      ),
    );
    assert.equal(
      saleBlock.split("get('paymentMethods', []).size() <= 8").length - 1,
      2,
      'create and update both cap the ways to pay at 8',
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
      'boughtOn',
      'boughtUrlPreview',
      'notes',
      'statusHistory',
      'ownerUid',
      'members',
      'buyerName',
    ].forEach((field) =>
      assert.ok(!view.includes(field), `${field} is named in salePageView.ts`),
    );
    assert.equal(
      view.split('boughtUrl').length - 1,
      1,
      'the store link is read in one place, behind showBoughtUrl',
    );
    assert.ok(
      view.includes('raw.showBoughtUrl === true ? toStoreUrl(raw.boughtUrl)'),
    );
  },
);

check('the interest form caps equal those of the app', () => {
  assert.equal(
    INQUIRY_LIMITS.MAX_NAME_LENGTH,
    clientConstants.MAX_INQUIRY_NAME_LENGTH,
  );
  assert.equal(
    INQUIRY_LIMITS.MAX_CONTACT_LENGTH,
    clientConstants.MAX_INQUIRY_CONTACT_LENGTH,
  );
  assert.equal(
    INQUIRY_LIMITS.MAX_MESSAGE_LENGTH,
    clientConstants.MAX_INQUIRY_MESSAGE_LENGTH,
  );
});

check(
  'the phone-or-email field is read the same on the phone and in the function',
  () => {
    [
      '206-555-0142',
      '(206) 555.0142',
      '+1 206 555 0142',
      ' Priya@Example.COM ',
      'priya@example',
      'priya@',
      '12345',
      '12345678901234567890123',
      'call me',
      '',
    ].forEach((text) => {
      const server = readContactOnServer(text);
      const client = readContactOnClient(text);
      assert.equal(client?.kind ?? null, server?.kind ?? null, text);
      assert.equal(
        client?.value ?? null,
        (server?.kind === 'email' ? server.email : server?.phone) ?? null,
        text,
      );
    });
  },
);

check(
  'an inquiry id is 26 base32 characters, the same for the same contact and thing, different otherwise',
  () => {
    const id = toInquiryId('sofa', '2065550142');
    assert.match(id, /^[a-z2-7]{26}$/);
    assert.equal(id, toInquiryId('sofa', '2065550142'));
    assert.notEqual(id, toInquiryId('desk', '2065550142'));
    assert.notEqual(id, toInquiryId('sofa', '2065550143'));
    assert.equal(readContactOnServer('(206) 555-0142')?.key, '2065550142');
  },
);

const bundleDoc = (extra: Record<string, unknown> = {}) => ({
  id: 'cat-stuff',
  saleId: 'sale-id-secret',
  name: '  Cat stuff ',
  itemIds: ['a', 'b', 'c', 'd'],
  priceCents: 2_000,
  status: 'ACTIVE',
  dealItemIds: null,
  sale: { buyerName: 'Buyer secret' },
  history: [{ byUid: OWNER }],
  createdBy: OWNER,
  createdAt: 1,
  ...extra,
});
const member = (id: string, extra: Record<string, unknown> = {}) =>
  thing({
    id,
    title: `Thing ${id}`,
    askingPriceCents: 1_000,
    bundleId: 'cat-stuff',
    ...extra,
  });
const BUNDLE_KEYS = [
  'goneCount',
  'id',
  'name',
  'priceCents',
  'separateCents',
  'status',
  'thingIds',
];

check(
  'a bundle is served with its public keys and only a count of what is gone',
  () => {
    const items = [
      member('a', { isBundleOnly: true }),
      member('b'),
      member('c'),
      member('d', { status: 'SOLD' }),
    ];
    const page = toSalePage(sale(), items, false, null, [bundleDoc()]);
    assert.ok(page.status === 'ok');
    assert.equal(page.bundles.length, 1);
    const [bundle] = page.bundles;
    assert.deepEqual(Object.keys(bundle).sort(), BUNDLE_KEYS);
    assert.deepEqual(bundle.thingIds, ['a', 'b', 'c']);
    assert.equal(bundle.name, 'Cat stuff');
    assert.equal(bundle.goneCount, 1);
    assert.equal(bundle.separateCents, 3_000);
    assert.equal(bundle.priceCents, 2_000);
    assert.equal(bundle.status, 'AVAILABLE');
    const body = JSON.stringify(page);
    ['Thing d', '"d"', OWNER, 'Buyer secret', 'sale-id-secret'].forEach(
      (value) => assert.ok(!body.includes(value), `leaked ${value}`),
    );
    const byId = Object.fromEntries(
      page.things.map((entry) => [entry.id, entry]),
    );
    assert.equal(byId.a.bundleId, 'cat-stuff');
    assert.equal(byId.a.isBundleOnly, true);
    assert.equal(byId.b.isBundleOnly, false);
    assert.equal(byId.d, undefined);
  },
);

check(
  'a bundle clamps its price, orders Pending last and a held one serves its deal',
  () => {
    const items = [
      member('a', { bundleId: 'open' }),
      member('b', { bundleId: 'open' }),
      member('c', { status: 'PENDING', bundleId: 'held' }),
      member('d', { status: 'PENDING', bundleId: 'held' }),
    ];
    const page = toSalePage(sale(), items, false, null, [
      bundleDoc({
        id: 'held',
        status: 'PENDING',
        itemIds: ['c', 'd'],
        dealItemIds: ['c', 'd'],
        priceCents: 9_999,
      }),
      bundleDoc({ id: 'open', itemIds: ['a', 'b'], priceCents: 9_999 }),
    ]);
    assert.ok(page.status === 'ok');
    assert.deepEqual(
      page.bundles.map((bundle) => bundle.id),
      ['open', 'held'],
    );
    assert.ok(
      page.bundles.every(
        (bundle) => bundle.priceCents === bundle.separateCents,
      ),
    );
    assert.equal(page.bundles[1].status, 'PENDING');
    const byId = Object.fromEntries(
      page.things.map((entry) => [entry.id, entry]),
    );
    assert.equal(byId.a.bundleId, 'open');
  },
);

check(
  'a bundle with fewer than two listable things, a sold one or an unsafe id is not served',
  () => {
    const items = [member('a'), member('b', { photos: [] }), member('c')];
    const served = (extra: Record<string, unknown>) => {
      const page = toSalePage(sale(), items, false, null, [
        bundleDoc({ itemIds: ['a', 'b', 'c'], ...extra }),
      ]);
      assert.ok(page.status === 'ok');
      return page;
    };
    assert.equal(served({ itemIds: ['a', 'b'] }).bundles.length, 0);
    assert.equal(served({ status: 'SOLD' }).bundles.length, 0);
    assert.equal(served({ id: '../x' }).bundles.length, 0);
    assert.equal(served({ name: '  ' }).bundles.length, 0);
    assert.equal(served({}).bundles.length, 1);
    const lone = served({ itemIds: ['a', 'b'] });
    assert.equal(lone.things.find((entry) => entry.id === 'a')?.bundleId, null);
    assert.equal(served({ name: 'x'.repeat(200) }).bundles[0].name.length, 60);
  },
);

check(
  'a thing a bundle lists but that names another bundle is not served in it',
  () => {
    const page = toSalePage(
      sale(),
      [member('a'), member('b'), member('c', { bundleId: 'other' })],
      false,
      null,
      [bundleDoc({ itemIds: ['a', 'b', 'c'] })],
    );
    assert.ok(page.status === 'ok');
    assert.deepEqual(page.bundles[0].thingIds, ['a', 'b']);
    assert.equal(page.things.find((entry) => entry.id === 'c')?.bundleId, null);
  },
);

check('the final pass drops a bundle id a thing does not belong to', () => {
  const page = toSalePage(sale(), [member('a'), member('b')], false, null, [
    bundleDoc({ itemIds: ['a', 'b'] }),
  ]);
  assert.ok(page.status === 'ok');
  const sealed = sealPage(
    {
      ...page,
      things: page.things.map((entry) => ({
        ...entry,
        bundleId: 'other',
        isBundleOnly: true,
      })),
      bundles: [
        ...page.bundles,
        { ...page.bundles[0], id: 'one', thingIds: ['a'] },
      ],
    },
    null,
  );
  assert.ok(sealed.status === 'ok');
  assert.equal(sealed.bundles.length, 1);
  assert.ok(
    sealed.things.every(
      (entry) => entry.bundleId === null && !entry.isBundleOnly,
    ),
  );
});

check('the server reads a bundle deal like the app does', () => {
  const stored = [
    member('a'),
    member('b', { status: 'PENDING' }),
    member('c', { status: 'SOLD' }),
  ] as unknown as Record<string, unknown>[];
  const byId = new Map(stored.map((entry) => [entry.id as string, entry]));
  [
    bundleDoc({ itemIds: ['a', 'b', 'c'] }),
    bundleDoc({
      status: 'PENDING',
      itemIds: ['a', 'b', 'c'],
      dealItemIds: ['b', 'c'],
    }),
  ].forEach((doc) =>
    assert.deepEqual(
      readBundleDeal(doc, byId),
      getBundleParts(doc as never, Object.fromEntries(byId) as never).deal.map(
        (entry) => entry.id,
      ),
    ),
  );
});

check('a bundle inquiry id differs from a solo one and is stable', () => {
  const solo = toInquiryId('a', '2065550142');
  const bundle = toInquiryId('a', '2065550142', 'cat-stuff');
  assert.notEqual(solo, bundle);
  assert.equal(bundle, toInquiryId('a', '2065550142', 'cat-stuff'));
  assert.notEqual(bundle, toInquiryId('a', '2065550142', 'other'));
  assert.equal(solo, toInquiryId('a', '2065550142', null));
});

check('the copied listing text holds only what buyers already see', () => {
  const base = {
    title: 'Gray sofa',
    condition: 'LIKE_NEW' as const,
    askingPriceCents: 35_000,
    description: 'No stains.',
    brandModel: 'Haven',
    size: '84 in wide',
    originalPriceCents: 129_900,
    floorPriceCents: 30_000,
    boughtFrom: 'SECRET-STORE',
    boughtUrl: 'https://secret.example/sofa',
    notes: 'SECRET-NOTE',
    pending: { buyerName: 'SECRET-BUYER' },
  };
  const hidden = listingText({ ...base, showOriginalPrice: false });
  ['$300', '$1,299', 'SECRET'].forEach((value) =>
    assert.ok(!hidden.includes(value), `leaked ${value}`),
  );
  assert.ok(hidden.includes('$350') && hidden.includes('No stains.'));
  assert.ok(
    listingText({ ...base, showOriginalPrice: true }).includes('Was $1,299'),
  );
});

console.log(`going once share checks passed (${passed})`);

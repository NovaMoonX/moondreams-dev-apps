import {
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
  EMPTY_SEED_RESULT,
} from './types.ts';

const SALE_ID = 'seed-going-once-fall-clear-out';

// A fixed id from the link alphabet, so the seeded page opens by hand: /going-once/s/<id>.
export const SEED_SALE_LINK_ID = 'seedsalefall23456789abcdef';
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

// A 16x12 solid-colour JPEG split into the bytes every colour shares and the few that set it, so the seed needs no asset files.
const JPEG_START = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAMABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwA=',
  'base64',
);
const JPEG_ENDS = [
  'd9a28a2b80eb3fffd9',
  'b54514541cc7ffd9',
  'e928a28ae03acfffd9',
  '7514515ca6e7ffd9',
  '7d14515d2729ffd9',
  '9a8a28ae33d53fffd9',
];
export const JPEG_SIZE = { width: 16, height: 12 };

/** The status fields of a thing; the shapes `src/apps/going-once/types.ts` reads. */
export interface SeedStatusFields {
  status: 'AVAILABLE' | 'PENDING' | 'SOLD' | 'WITHDRAWN';
  pending: {
    inquiryId: null;
    buyerName: string | null;
    pickupOn: number | null;
    markedBy: string;
    markedAt: number;
  } | null;
  sale: {
    priceCents: number;
    method: 'CASH' | 'VENMO' | 'ZELLE' | 'OTHER' | null;
    soldOn: number;
    buyerName: string | null;
    markedBy: string;
    markedAt: number;
  } | null;
  statusHistory: {
    kind: 'MARK_PENDING' | 'MARK_SOLD' | 'TAKE_OFF';
    status: SeedStatusFields['status'];
    byUid: string;
    at: number;
    priceCents: number | null;
    fromPriceCents: number | null;
    buyerName: string | null;
    pickupOn: number | null;
  }[];
}

export type SeedStatus =
  | { kind: 'AVAILABLE' }
  | {
      kind: 'PENDING';
      by: string;
      buyerName: string | null;
      /** Days from today to the pickup day, or `'saturday'` for the coming one. */
      pickup: number | 'saturday' | null;
      daysAgo: number;
    }
  | {
      kind: 'SOLD';
      by: string;
      priceCents: number;
      method: 'CASH' | 'VENMO' | 'ZELLE' | 'OTHER' | null;
      daysAgo: number;
      /** Held for someone first. */
      heldFor?: string;
    }
  | { kind: 'WITHDRAWN'; by: string; daysAgo: number };

const HOUR_MS = 3_600_000;

/** Builds a thing's status fields relative to the seed's "now", so the sale reads the same on any day. */
export function buildSeedStatus(
  status: SeedStatus,
  now: number,
): SeedStatusFields {
  const today = new Date(now);
  // The person's calendar day (local getters), stored as the date-only value a date picker writes (UTC midnight).
  const dayOnly = (offset: number) =>
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  const untilSaturday = (6 - today.getDay() + 7) % 7 || 7;
  const getPickupOn = (pickup: number | 'saturday' | null) => {
    if (pickup === null) return null;
    return dayOnly(pickup === 'saturday' ? untilSaturday : pickup);
  };
  if (status.kind === 'AVAILABLE')
    return {
      status: 'AVAILABLE',
      pending: null,
      sale: null,
      statusHistory: [],
    };
  if (status.kind === 'PENDING') {
    const at = now - status.daysAgo * DAY_MS;
    const pickupOn = getPickupOn(status.pickup);
    return {
      status: 'PENDING',
      pending: {
        inquiryId: null,
        buyerName: status.buyerName,
        pickupOn,
        markedBy: status.by,
        markedAt: at,
      },
      sale: null,
      statusHistory: [
        {
          kind: 'MARK_PENDING',
          status: 'PENDING',
          byUid: status.by,
          at,
          priceCents: null,
          fromPriceCents: null,
          buyerName: status.buyerName,
          pickupOn,
        },
      ],
    };
  }
  if (status.kind === 'SOLD') {
    const at = now - status.daysAgo * DAY_MS;
    const held =
      status.heldFor === undefined
        ? []
        : [
            {
              kind: 'MARK_PENDING' as const,
              status: 'PENDING' as const,
              byUid: status.by,
              at: at - 3 * HOUR_MS,
              priceCents: null,
              fromPriceCents: null,
              buyerName: status.heldFor,
              pickupOn: null,
            },
          ];
    return {
      status: 'SOLD',
      pending: null,
      sale: {
        priceCents: status.priceCents,
        method: status.method,
        soldOn: dayOnly(-status.daysAgo),
        buyerName: status.heldFor ?? null,
        markedBy: status.by,
        markedAt: at,
      },
      statusHistory: [
        ...held,
        {
          kind: 'MARK_SOLD',
          status: 'SOLD',
          byUid: status.by,
          at,
          priceCents: status.priceCents,
          fromPriceCents: null,
          buyerName: null,
          pickupOn: null,
        },
      ],
    };
  }
  const at = now - status.daysAgo * DAY_MS;
  return {
    status: 'WITHDRAWN',
    pending: null,
    sale: null,
    statusHistory: [
      {
        kind: 'TAKE_OFF',
        status: 'WITHDRAWN',
        byUid: status.by,
        at,
        priceCents: null,
        fromPriceCents: null,
        buyerName: null,
        pickupOn: null,
      },
    ],
  };
}

type SeedCondition = 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR' | 'WELL_USED';

/** A thing's optional fields as an older thing has them: every key present, nothing filled in. */
export const EMPTY_OPTIONALS = {
  description: null as string | null,
  brandModel: null as string | null,
  size: null as string | null,
  originalPriceCents: null as number | null,
  showOriginalPrice: false,
  boughtFrom: null as string | null,
  boughtOn: null as number | null,
  boughtUrl: null as string | null,
  boughtUrlPreview: null as {
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    siteName: string | null;
    fetchedAt: number;
  } | null,
  notes: null as string | null,
};

interface SeedThing {
  id: string;
  title: string;
  photoCount: number;
  condition: SeedCondition;
  askingPriceCents: number | null;
  floorPriceCents: number | null;
  optionals?: Partial<typeof EMPTY_OPTIONALS>;
  status?: (people: { maya: string; theo: string }) => SeedStatus;
}

// The table in canvas.md "Example data"; today there is Mon Nov 2.
const SEED_THINGS: SeedThing[] = [
  {
    id: 'gray-sofa',
    title: 'Gray sofa',
    photoCount: 5,
    condition: 'LIKE_NEW',
    askingPriceCents: 35000,
    floorPriceCents: 30000,
    optionals: {
      description:
        'Three-seat sofa in light gray fabric. No stains, smoke-free home.',
      brandModel: 'West Elm Haven',
      size: '84 in wide',
      originalPriceCents: 129900,
      showOriginalPrice: true,
      boughtFrom: 'West Elm',
      boughtOn: Date.UTC(2023, 2, 14),
      boughtUrl: 'https://www.westelm.com/products/haven-sofa/',
      boughtUrlPreview: {
        title: 'Haven Sofa',
        description: 'A deep, comfortable sofa with a clean, modern shape.',
        imageUrl: null,
        siteName: 'West Elm',
        fetchedAt: Date.UTC(2025, 9, 1),
      },
      notes: 'Delivery was $120. The legs unscrew, so it fits through a door.',
    },
  },
  {
    id: 'dining-chairs',
    title: 'Dining chairs (set of 4)',
    photoCount: 4,
    condition: 'GOOD',
    askingPriceCents: 12000,
    floorPriceCents: null,
  },
  {
    id: 'coffee-table',
    title: 'Coffee table',
    photoCount: 4,
    condition: 'GOOD',
    askingPriceCents: 6000,
    floorPriceCents: null,
  },
  {
    id: 'floor-lamp',
    title: 'Floor lamp',
    photoCount: 3,
    condition: 'GOOD',
    askingPriceCents: 2500,
    floorPriceCents: null,
    optionals: {
      description: 'Brushed brass with a linen shade.',
    },
  },
  {
    id: 'area-rug',
    title: 'Area rug',
    photoCount: 4,
    condition: 'WELL_USED',
    askingPriceCents: 3000,
    floorPriceCents: null,
  },
  {
    id: 'plant-stand',
    title: 'Plant stand',
    photoCount: 3,
    condition: 'LIKE_NEW',
    askingPriceCents: 1500,
    floorPriceCents: null,
  },
  {
    id: 'road-bike',
    title: 'Road bike',
    photoCount: 6,
    condition: 'GOOD',
    askingPriceCents: 20000,
    floorPriceCents: 16000,
    optionals: {
      brandModel: 'Trek Domane',
      size: '56 cm frame',
      notes: 'New tires last spring. Pedals not included.',
    },
  },
  {
    id: 'oak-desk',
    title: 'Oak desk',
    photoCount: 5,
    condition: 'GOOD',
    askingPriceCents: 15000,
    floorPriceCents: 12000,
    optionals: {
      description: 'Solid oak with a small ring mark near the left corner.',
      size: '60 x 30 in',
      originalPriceCents: 24000,
      boughtFrom: 'Craigslist',
      notes: 'Two drawers; the left one sticks in humid weather.',
    },
    status: ({ theo }) => ({
      kind: 'PENDING',
      by: theo,
      buyerName: 'Nate',
      pickup: 'saturday',
      daysAgo: 2,
    }),
  },
  {
    id: 'monitor',
    title: '27" monitor',
    photoCount: 7,
    condition: 'GOOD',
    askingPriceCents: 9000,
    floorPriceCents: null,
    optionals: {
      brandModel: 'Dell U2720Q',
      originalPriceCents: 54900,
      showOriginalPrice: true,
      boughtFrom: 'Best Buy',
    },
    status: ({ theo }) => ({
      kind: 'PENDING',
      by: theo,
      buyerName: 'Dev',
      pickup: null,
      daysAgo: 1,
    }),
  },
  {
    id: 'stand-mixer',
    title: 'Stand mixer',
    photoCount: 4,
    condition: 'LIKE_NEW',
    askingPriceCents: 18000,
    floorPriceCents: null,
    status: ({ theo }) => ({
      kind: 'SOLD',
      by: theo,
      priceCents: 17000,
      method: 'VENMO',
      daysAgo: 2,
    }),
  },
  {
    id: 'bookshelf',
    title: 'Bookshelf',
    photoCount: 3,
    condition: 'FAIR',
    askingPriceCents: 4000,
    floorPriceCents: null,
    status: ({ maya }) => ({
      kind: 'SOLD',
      by: maya,
      priceCents: 4000,
      method: 'CASH',
      daysAgo: 3,
    }),
  },
  {
    id: 'cast-iron-pan',
    title: 'Cast iron pan',
    photoCount: 2,
    condition: 'GOOD',
    askingPriceCents: 2500,
    floorPriceCents: 2000,
    status: ({ theo }) => ({
      kind: 'SOLD',
      by: theo,
      priceCents: 1500,
      method: 'CASH',
      daysAgo: 1,
    }),
  },
  {
    id: 'wall-mirror',
    title: 'Wall mirror',
    photoCount: 1,
    condition: 'LIKE_NEW',
    askingPriceCents: 4500,
    floorPriceCents: null,
  },
  {
    id: 'bluetooth-speaker',
    title: 'Bluetooth speaker',
    photoCount: 1,
    condition: 'GOOD',
    askingPriceCents: null,
    floorPriceCents: null,
  },
  {
    id: 'desk-chair',
    title: 'Desk chair',
    photoCount: 3,
    condition: 'FAIR',
    askingPriceCents: 4000,
    floorPriceCents: null,
    status: ({ maya }) => ({ kind: 'WITHDRAWN', by: maya, daysAgo: 1 }),
  },
];

const getPhotoPath = (thingId: string, photoId: string) =>
  `apps/going-once/sales/${SALE_ID}/items/seed-go-${thingId}/${photoId}.jpg`;

const getSeedBucket = () =>
  process.env.STORAGE_BUCKET ??
  process.env.VITE_FIREBASE_STORAGE_BUCKET ??
  'moondreams-dev-apps.firebasestorage.app';

const getStorageEmulatorHost = () =>
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199';

/** Makes the seeded sale's public photo copies with the same code the trigger runs, so the seeded page shows photos even when the Functions emulator is down or points at another bucket. Emulators only. */
async function makeSeedCopies() {
  process.env.FIREBASE_CONFIG ??= JSON.stringify({
    projectId: process.env.GCLOUD_PROJECT ?? 'moondreams-dev-apps',
    storageBucket: getSeedBucket(),
  });
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = getStorageEmulatorHost();
  const { syncSaleCopies } =
    await import('../../functions/src/apps/going-once/salePhotoCopies.ts');
  return syncSaleCopies(SALE_ID);
}

/** Uploads a seeded photo to the Storage emulator; a bucket the app isn't configured for leaves the photo unreadable. */
export async function uploadSeedPhoto(path: string, colorIndex: number) {
  const bucket = getSeedBucket();
  const host = getStorageEmulatorHost();
  const body = Buffer.concat([
    JPEG_START,
    Buffer.from(JPEG_ENDS[colorIndex % JPEG_ENDS.length], 'hex'),
  ]);
  const response = await fetch(
    `http://${host}/v0/b/${bucket}/o?name=${encodeURIComponent(path)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', Authorization: 'Bearer owner' },
      body,
    },
  ).catch(() => null);
  return { isUploaded: response?.ok === true, sizeBytes: body.length };
}

export async function seedGoingOnce(context: SeedContext): Promise<SeedResult> {
  const maya = FIXTURE_USERS.goingOnceSeller;
  const theo = FIXTURE_USERS.goingOnceCoSeller;
  const sale = context.firestore
    .collection('apps')
    .doc('going-once')
    .collection('sales')
    .doc(SALE_ID);

  await sale.set({
    id: SALE_ID,
    name: 'Fall clear-out',
    pickupArea: 'Capitol Hill, Seattle',
    buyerNote: 'Evenings and weekends. Cash or Venmo.',
    currency: 'USD',
    ownerUid: maya.uid,
    createdBy: maya.uid,
    members: [maya.uid, theo.uid],
    memberJoinedAt: { [theo.uid]: context.now - 5 * DAY_MS },
    publicLinkId: SEED_SALE_LINK_ID,
    publicLinkChangedAt: context.now - 4 * DAY_MS,
    createdAt: context.now - 6 * DAY_MS,
    lastEditedAt: null,
  });

  await context.firestore
    .collection('apps')
    .doc('going-once')
    .collection('publicLinks')
    .doc(SEED_SALE_LINK_ID)
    .set({
      id: SEED_SALE_LINK_ID,
      saleId: SALE_ID,
      createdBy: maya.uid,
      createdAt: context.now - 4 * DAY_MS,
    });

  const waitingEmail = 'sam@example.test';
  await context.firestore
    .collection('apps')
    .doc('going-once')
    .collection('emailInvites')
    .doc(`${SALE_ID}_${waitingEmail}`)
    .set({
      saleId: SALE_ID,
      email: waitingEmail,
      invitedBy: maya.uid,
      saleName: 'Fall clear-out',
      inviterName: 'Maya',
      createdAt: context.now - 2 * DAY_MS,
    });

  const things = await Promise.all(
    SEED_THINGS.map(async (thing, thingIndex) => {
      const itemId = `seed-go-${thing.id}`;
      const createdAt = context.now - 5 * DAY_MS + thingIndex * 10 * MINUTE_MS;
      const photos = await Promise.all(
        Array.from({ length: thing.photoCount }, async (_, photoIndex) => {
          const id = `${itemId}-photo-${photoIndex + 1}`;
          const path = getPhotoPath(thing.id, id);
          const upload = await uploadSeedPhoto(path, thingIndex + photoIndex);
          return {
            photo: {
              id,
              path,
              ...JPEG_SIZE,
              sizeBytes: upload.sizeBytes,
              createdAt: createdAt + photoIndex * MINUTE_MS,
            },
            isUploaded: upload.isUploaded,
          };
        }),
      );
      await sale
        .collection('items')
        .doc(itemId)
        .set({
          id: itemId,
          saleId: SALE_ID,
          title: thing.title,
          condition: thing.condition,
          askingPriceCents: thing.askingPriceCents,
          floorPriceCents: thing.floorPriceCents,
          ...EMPTY_OPTIONALS,
          ...thing.optionals,
          photos: photos.map(({ photo }) => photo),
          ...buildSeedStatus(
            thing.status?.({ maya: maya.uid, theo: theo.uid }) ?? {
              kind: 'AVAILABLE',
            },
            context.now,
          ),
          createdBy: maya.uid,
          createdAt,
          lastEditedAt: null,
          lastEditedBy: null,
        });
      return photos;
    }),
  );

  const uploads = things.flat();
  if (uploads.some(({ isUploaded }) => !isUploaded)) {
    console.warn(
      'Going Once seed: could not upload photos to the Storage emulator, so the things list photos that cannot be opened.',
    );
  }

  const copies = await makeSeedCopies().catch((error: unknown) => {
    console.warn(
      `Going Once seed: the public page has no photo copies yet; the Functions emulator makes them when it runs. (${error instanceof Error ? error.message : String(error)})`,
    );
    return null;
  });
  if (copies !== null && copies.failed > 0) {
    console.warn(
      `Going Once seed: ${copies.failed} photo copies failed; see the log lines above.`,
    );
  }

  return { ...EMPTY_SEED_RESULT, firestoreDocuments: 3 + SEED_THINGS.length };
}

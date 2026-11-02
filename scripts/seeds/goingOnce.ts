import {
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
  EMPTY_SEED_RESULT,
} from './types.ts';

const SALE_ID = 'seed-going-once-fall-clear-out';
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
const JPEG_SIZE = { width: 16, height: 12 };

type SeedCondition = 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR' | 'WELL_USED';

interface SeedThing {
  id: string;
  title: string;
  photoCount: number;
  condition: SeedCondition;
  askingPriceCents: number | null;
  floorPriceCents: number | null;
}

// The table in canvas.md "Example data". Only what exists so far is seeded: statuses, the original price and where each
// thing was bought arrive with the issues that read them, so every thing here is Available.
const SEED_THINGS: SeedThing[] = [
  {
    id: 'gray-sofa',
    title: 'Gray sofa',
    photoCount: 5,
    condition: 'LIKE_NEW',
    askingPriceCents: 35000,
    floorPriceCents: 30000,
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
  },
  {
    id: 'oak-desk',
    title: 'Oak desk',
    photoCount: 5,
    condition: 'GOOD',
    askingPriceCents: 15000,
    floorPriceCents: 12000,
  },
  {
    id: 'monitor',
    title: '27" monitor',
    photoCount: 7,
    condition: 'GOOD',
    askingPriceCents: 9000,
    floorPriceCents: null,
  },
  {
    id: 'stand-mixer',
    title: 'Stand mixer',
    photoCount: 4,
    condition: 'LIKE_NEW',
    askingPriceCents: 18000,
    floorPriceCents: null,
  },
  {
    id: 'bookshelf',
    title: 'Bookshelf',
    photoCount: 3,
    condition: 'FAIR',
    askingPriceCents: 4000,
    floorPriceCents: null,
  },
  {
    id: 'cast-iron-pan',
    title: 'Cast iron pan',
    photoCount: 2,
    condition: 'GOOD',
    askingPriceCents: 2500,
    floorPriceCents: 2000,
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
  },
];

const getPhotoPath = (thingId: string, photoId: string) =>
  `apps/going-once/sales/${SALE_ID}/items/seed-go-${thingId}/${photoId}.jpg`;

/** Uploads a seeded photo to the Storage emulator; a bucket the app isn't configured for leaves the photo unreadable. */
async function uploadSeedPhoto(path: string, colorIndex: number) {
  const bucket =
    process.env.STORAGE_BUCKET ??
    process.env.VITE_FIREBASE_STORAGE_BUCKET ??
    'moondreams-dev-apps.firebasestorage.app';
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199';
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
    members: [maya.uid],
    createdAt: context.now - 6 * DAY_MS,
    lastEditedAt: null,
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
          photos: photos.map(({ photo }) => photo),
          status: 'AVAILABLE',
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

  return { ...EMPTY_SEED_RESULT, firestoreDocuments: 1 + SEED_THINGS.length };
}

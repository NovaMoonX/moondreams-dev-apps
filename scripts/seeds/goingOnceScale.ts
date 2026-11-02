import {
  buildSeedStatus,
  EMPTY_OPTIONALS,
  JPEG_SIZE,
  uploadSeedPhoto,
  type SeedStatus,
} from './goingOnce.ts';
import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const SALE_ID = 'seed-going-once-scale';
const THING_COUNT = 50;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const CONDITIONS = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'WELL_USED'] as const;
const NOUNS = [
  'Armchair',
  'Bookcase',
  'Blender',
  'Bike rack',
  'Camp stove',
  'Desk lamp',
  'Dresser',
  'Espresso machine',
  'Fan',
  'Guitar',
  'Hammock',
  'Ironing board',
  'Kettle',
  'Mirror',
  'Nightstand',
  'Ottoman',
  'Printer',
  'Record player',
  'Shoe rack',
  'Toaster',
];
const MATERIALS = ['oak', 'steel', 'walnut', 'wicker', 'glass', 'linen'];

const BUYERS = ['Nate', 'Dev', 'Priya', 'Marcus', 'Lena'];
const METHODS = ['CASH', 'VENMO', 'ZELLE', 'OTHER'] as const;

/** Four Pending (one with a long name), eight Sold and three taken off the list; the rest stay Available. */
const buildStatus = (
  index: number,
  people: { maya: string; theo: string },
): SeedStatus => {
  if (index % 12 === 3)
    return {
      kind: 'PENDING',
      by: people.theo,
      buyerName:
        index === 3
          ? 'Alexandra Wilhelmina Featherstonehaugh-Smythe'
          : BUYERS[index % BUYERS.length],
      pickup: index % 24 === 15 ? null : 'saturday',
      daysAgo: 1 + (index % 3),
    };
  if (index % 6 === 2)
    return {
      kind: 'SOLD',
      by: index % 4 === 2 ? people.maya : people.theo,
      priceCents: (4 + ((index * 5) % 40)) * 500,
      method: index % 8 === 2 ? null : METHODS[index % METHODS.length],
      daysAgo: 1 + (index % 5),
      heldFor: index % 4 === 0 ? BUYERS[index % BUYERS.length] : undefined,
    };
  if ([7, 19, 43].includes(index))
    return { kind: 'WITHDRAWN', by: people.maya, daysAgo: 1 + (index % 4) };
  return { kind: 'AVAILABLE' };
};

const buildThing = (index: number) => {
  const noun = NOUNS[index % NOUNS.length];
  const material = MATERIALS[(index * 3) % MATERIALS.length];
  const isLong = index % 11 === 0;
  return {
    id: `scale-thing-${index + 1}`,
    title: isLong
      ? `${noun}, ${material} finish, with the original box, manual and every spare part it came with`
      : `${noun} (${material}) ${index + 1}`,
    isUnlisted: index % 9 === 4,
    photoCount: 1 + (index % 3),
    condition: CONDITIONS[index % CONDITIONS.length],
    askingPriceCents: (5 + ((index * 7) % 60)) * 500,
    floorPriceCents: index % 4 === 0 ? (3 + ((index * 7) % 60)) * 500 : null,
    optionals:
      index % 3 === 0
        ? {
            description: `A ${material} ${noun.toLowerCase()} in steady use for a few years.`,
            brandModel: index % 6 === 0 ? 'Made in Sweden' : null,
            notes: index % 5 === 0 ? 'Smells faintly of cedar.' : null,
          }
        : {},
  };
};

/** Seeds Maya's second sale with 50 things (about 100 photos in the Storage emulator, 6 of them not listed yet) for checking that the Things tab stays fast; returns the documents written. Emulators only. */
export async function seedGoingOnceScale(
  context: SeedContext,
): Promise<SeedResult> {
  const maya = FIXTURE_USERS.goingOnceSeller;
  const theo = FIXTURE_USERS.goingOnceCoSeller;
  const sale = context.firestore
    .collection('apps')
    .doc('going-once')
    .collection('sales')
    .doc(SALE_ID);

  await sale.set({
    id: SALE_ID,
    name: 'Big garage sale (scale test)',
    pickupArea: 'Ballard, Seattle',
    buyerNote: 'Cash or Venmo. Bring a friend for the big pieces.',
    currency: 'USD',
    ownerUid: maya.uid,
    createdBy: maya.uid,
    members: [maya.uid, theo.uid],
    createdAt: context.now - 9 * DAY_MS,
    lastEditedAt: null,
  });

  await Promise.all(
    Array.from({ length: THING_COUNT }, async (_, index) => {
      const thing = buildThing(index);
      const itemId = `seed-go-${thing.id}`;
      const createdAt = context.now - 8 * DAY_MS + index * 37 * MINUTE_MS;
      const photos = await Promise.all(
        Array.from({ length: thing.photoCount }, async (_, photoIndex) => {
          const id = `${itemId}-photo-${photoIndex + 1}`;
          const path = `apps/going-once/sales/${SALE_ID}/items/${itemId}/${id}.jpg`;
          const upload = await uploadSeedPhoto(path, index + photoIndex);
          return {
            id,
            path,
            ...JPEG_SIZE,
            sizeBytes: upload.sizeBytes,
            createdAt: createdAt + photoIndex * MINUTE_MS,
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
          askingPriceCents: thing.isUnlisted ? null : thing.askingPriceCents,
          floorPriceCents: thing.isUnlisted ? null : thing.floorPriceCents,
          ...EMPTY_OPTIONALS,
          ...thing.optionals,
          photos,
          ...buildSeedStatus(
            buildStatus(index, { maya: maya.uid, theo: theo.uid }),
            context.now,
          ),
          createdBy: maya.uid,
          createdAt,
          lastEditedAt: null,
          lastEditedBy: null,
        });
    }),
  );

  return { ...EMPTY_SEED_RESULT, firestoreDocuments: 1 + THING_COUNT };
}

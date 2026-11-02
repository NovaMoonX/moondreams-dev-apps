import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';

import {
  describeError,
  saveFileUnderNewToken,
} from '../../share/shareFiles.js';
import { toWebpCopy } from '../../share/imageCopies.js';
import { saleRef } from './saleLinkStore.js';
import {
  COPY_SIZES,
  COPY_SIZE_KEYS,
  FINISHED_SALE_STATUS,
  isLinkId,
  isSafeId,
  publicCopyPath,
  publicFolder,
  readCopyablePhotos,
  toPublicThing,
  type CopySize,
} from './salePageView.js';

const MAX_PASSES = 3;

export interface CopyCounts {
  made: number;
  deleted: number;
  skipped: number;
}

const NOTHING: CopyCounts = { made: 0, deleted: 0, skipped: 0 };

type WantedPhoto = ReturnType<typeof readCopyablePhotos>[number];

async function makeCopies(
  saleId: string,
  itemId: string,
  linkId: string,
  photo: WantedPhoto,
  sizes: CopySize[],
): Promise<CopyCounts> {
  const [exists] = await getStorage().bucket().file(photo.path).exists();
  if (!exists) {
    return { ...NOTHING, skipped: 1 };
  }

  const [source] = await getStorage().bucket().file(photo.path).download();
  await Promise.all(
    sizes.map(async (size) =>
      saveFileUnderNewToken(
        publicCopyPath(linkId, itemId, photo.id, size),
        await toWebpCopy(source, COPY_SIZES[size]),
        'image/webp',
      ),
    ),
  );
  return { ...NOTHING, made: sizes.length };
}

const add = (a: CopyCounts, b: CopyCounts): CopyCounts => ({
  made: a.made + b.made,
  deleted: a.deleted + b.deleted,
  skipped: a.skipped + b.skipped,
});

/** One look at current state: reads the sale and the thing, then deletes the copies no longer wanted and makes the missing ones. */
async function runPass(saleId: string, itemId: string): Promise<CopyCounts> {
  const sale = await saleRef(saleId).get();
  const linkId: unknown = sale.get('publicLinkId');
  if (!sale.exists || !isLinkId(linkId)) {
    return NOTHING;
  }

  const item = await saleRef(saleId).collection('items').doc(itemId).get();
  const wanted =
    sale.get('status') === FINISHED_SALE_STATUS
      ? []
      : toPublicThing(item.data()) === null
        ? []
        : readCopyablePhotos(saleId, itemId, item.data());
  const wantedPaths = new Set(
    wanted.flatMap((photo) =>
      COPY_SIZE_KEYS.map((size) =>
        publicCopyPath(linkId, itemId, photo.id, size),
      ),
    ),
  );

  const [files] = await getStorage()
    .bucket()
    .getFiles({ prefix: `${publicFolder(linkId)}${itemId}/` });
  const existing = new Set(files.map((file) => file.name));
  const unwanted = files.filter((file) => !wantedPaths.has(file.name));
  await Promise.all(
    unwanted.map((file) => file.delete({ ignoreNotFound: true })),
  );

  const made = await wanted.reduce<Promise<CopyCounts>>(
    async (previous, photo) => {
      const total = await previous;
      const missing = COPY_SIZE_KEYS.filter(
        (size) => !existing.has(publicCopyPath(linkId, itemId, photo.id, size)),
      );
      return missing.length === 0
        ? total
        : add(total, await makeCopies(saleId, itemId, linkId, photo, missing));
    },
    Promise.resolve(NOTHING),
  );
  return { ...made, deleted: unwanted.length };
}

/**
 * Brings one thing's public copies in line with what the page shows now. Each pass reads current state, never an event, and a pass that changed anything is followed by another, so a thing that sold mid-copy loses the copies a slower run just made.
 * Returns what it did in total; a rerun on unchanged state returns zeros.
 */
export async function syncThingCopies(
  saleId: string,
  itemId: string,
): Promise<CopyCounts> {
  if (!isSafeId(saleId) || !isSafeId(itemId)) {
    return NOTHING;
  }

  const loop = async (pass: number, total: CopyCounts): Promise<CopyCounts> => {
    const done = await runPass(saleId, itemId).catch((error: unknown) => {
      logger.error('goingOnce.copies.failed', { code: describeError(error) });
      return null;
    });
    if (done === null) {
      return total;
    }

    const next = add(total, done);
    const changed = done.made + done.deleted > 0;
    return changed && pass < MAX_PASSES ? loop(pass + 1, next) : next;
  };
  return loop(1, NOTHING);
}

/** Syncs every thing of a sale, a few at a time. */
export async function syncSaleCopies(saleId: string): Promise<CopyCounts> {
  const items = await getFirestore()
    .collection(`apps/going-once/sales/${saleId}/items`)
    .select()
    .limit(300)
    .get();
  const ids = items.docs.map((item) => item.id);
  const BATCH = 4;
  return Array.from({ length: Math.ceil(ids.length / BATCH) }, (_, index) =>
    ids.slice(index * BATCH, (index + 1) * BATCH),
  ).reduce<Promise<CopyCounts>>(async (previous, batch) => {
    const total = await previous;
    const counts = await Promise.all(
      batch.map((itemId) => syncThingCopies(saleId, itemId)),
    );
    return counts.reduce(add, total);
  }, Promise.resolve(NOTHING));
}

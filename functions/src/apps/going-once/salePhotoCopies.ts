import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';

import {
  describeError,
  removeFolderFiles,
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
const SWEEP_BATCH = 4;

export interface CopyCounts {
  made: number;
  deleted: number;
  skipped: number;
  failed: number;
}

const NOTHING: CopyCounts = { made: 0, deleted: 0, skipped: 0, failed: 0 };

type WantedPhoto = ReturnType<typeof readCopyablePhotos>[number];

const add = (a: CopyCounts, b: CopyCounts): CopyCounts => ({
  made: a.made + b.made,
  deleted: a.deleted + b.deleted,
  skipped: a.skipped + b.skipped,
  failed: a.failed + b.failed,
});

async function makeCopies(
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
  const saved = await Promise.all(
    sizes.map(async (size) =>
      saveFileUnderNewToken(
        publicCopyPath(linkId, itemId, photo.id, size),
        await toWebpCopy(source, COPY_SIZES[size]),
        'image/webp',
      ),
    ),
  );
  return { ...NOTHING, made: saved.filter(Boolean).length };
}

/** One photo that can't be copied (a corrupt file, one too large to decode) is counted and logged, and never stops the thing's other photos. */
const makeCopiesOrCount = (
  itemId: string,
  linkId: string,
  photo: WantedPhoto,
  sizes: CopySize[],
): Promise<CopyCounts> =>
  makeCopies(itemId, linkId, photo, sizes).catch((error: unknown) => {
    logger.error('goingOnce.copies.photoFailed', {
      item: itemId,
      photo: photo.id,
      code: describeError(error),
    });
    return { ...NOTHING, failed: 1 };
  });

/** One look at current state: reads the sale and the thing, then deletes the copies no longer wanted and makes the missing ones. */
async function runPass(
  saleId: string,
  itemId: string,
): Promise<{ counts: CopyCounts; linkId: string | null }> {
  const sale = await saleRef(saleId).get();
  const linkId: unknown = sale.get('publicLinkId');
  if (!sale.exists || !isLinkId(linkId)) {
    return { counts: NOTHING, linkId: null };
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
        : add(total, await makeCopiesOrCount(itemId, linkId, photo, missing));
    },
    Promise.resolve(NOTHING),
  );
  return { counts: { ...made, deleted: unwanted.length }, linkId };
}

/** Removes what a run made under a link that ended while it worked; the new address is filled by the run that follows. */
async function removeStaleCopies(itemId: string, linkIds: string[]) {
  await Promise.all(
    linkIds.map((linkId) =>
      removeFolderFiles(`${publicFolder(linkId)}${itemId}/`).catch(
        (error: unknown) =>
          logger.error('goingOnce.copies.staleFailed', {
            item: itemId,
            code: describeError(error),
          }),
      ),
    ),
  );
}

async function readLinkId(saleId: string) {
  const sale = await saleRef(saleId).get();
  const linkId: unknown = sale.get('publicLinkId');
  return isLinkId(linkId) ? linkId : null;
}

/**
 * Brings one thing's public copies in line with what the page shows now. Each pass reads current state, never an event, and a pass that changed anything is followed by another, so a thing that sold mid-copy loses the copies a slower run just made.
 * When the sale's link changed while the run worked, what it made under the old link is removed and the thing is synced once more under the new one.
 * Returns what it did in total; a rerun on unchanged state returns zeros.
 */
export async function syncThingCopies(
  saleId: string,
  itemId: string,
  round = 1,
): Promise<CopyCounts> {
  if (!isSafeId(saleId) || !isSafeId(itemId)) {
    return NOTHING;
  }

  const loop = async (
    pass: number,
    total: CopyCounts,
    used: string[],
  ): Promise<{ total: CopyCounts; used: string[] }> => {
    const done = await runPass(saleId, itemId).catch((error: unknown) => {
      logger.error('goingOnce.copies.failed', {
        item: itemId,
        code: describeError(error),
      });
      return null;
    });
    if (done === null) {
      return { total, used };
    }

    const next = add(total, done.counts);
    const nextUsed =
      done.linkId === null || used.includes(done.linkId)
        ? used
        : [...used, done.linkId];
    const changed = done.counts.made + done.counts.deleted > 0;
    return changed && pass < MAX_PASSES
      ? loop(pass + 1, next, nextUsed)
      : { total: next, used: nextUsed };
  };
  const { total, used } = await loop(1, NOTHING, []);

  const current = await readLinkId(saleId).catch(() => null);
  const stale = used.filter((linkId) => linkId !== current);
  if (stale.length === 0) {
    return total;
  }

  await removeStaleCopies(itemId, stale);
  return current !== null && round < 2
    ? add(total, await syncThingCopies(saleId, itemId, round + 1))
    : total;
}

export interface SweepResult extends CopyCounts {
  /** True when the time ran out before every thing was looked at. */
  partial: boolean;
}

/**
 * Syncs every thing of a sale, a few at a time, and stops starting new ones once `deadline` (epoch ms) has passed, so a big sale ends cleanly inside its function's timeout.
 * Things it didn't reach are caught by their next write or by running this again, which skips every copy that exists.
 */
export async function syncSaleCopies(
  saleId: string,
  deadline = Number.POSITIVE_INFINITY,
): Promise<SweepResult> {
  const items = await getFirestore()
    .collection(`apps/going-once/sales/${saleId}/items`)
    .select()
    .limit(300)
    .get();
  const ids = items.docs.map((item) => item.id);
  return Array.from(
    { length: Math.ceil(ids.length / SWEEP_BATCH) },
    (_, index) => ids.slice(index * SWEEP_BATCH, (index + 1) * SWEEP_BATCH),
  ).reduce<Promise<SweepResult>>(
    async (previous, batch) => {
      const total = await previous;
      if (total.partial || Date.now() >= deadline) {
        return { ...total, partial: true };
      }

      const counts = await Promise.all(
        batch.map((itemId) => syncThingCopies(saleId, itemId)),
      );
      return { ...counts.reduce(add, total), partial: false };
    },
    Promise.resolve({ ...NOTHING, partial: false }),
  );
}

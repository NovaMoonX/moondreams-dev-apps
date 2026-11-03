import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { ZipFile } from 'yazl';

import { describeError } from '../../share/shareFiles.js';
import { saleRef } from './saleLinkStore.js';
import {
  FINISHED_SALE_STATUS,
  isRecord,
  isSafeId,
  readCopyablePhotos,
} from './salePageView.js';

const MAX_PHOTOS_PER_THING = 12;
const MAX_PHOTOS = 1500;
const MAX_NAME_LENGTH = 60;
const SAVED_STATUSES: readonly unknown[] = ['AVAILABLE', 'PENDING'];

// eslint-disable-next-line no-control-regex
const UNSAFE_NAME_CHARACTERS = /[\u0000-\u001f\u007f\\/:*?"<>|]/g;

/** A name that is safe as a folder, file or download name on iPhone, Android, Windows and macOS; emoji stay. */
export function toSafeName(value: unknown, fallback: string) {
  const text = typeof value === 'string' ? value : '';
  const cleaned = Array.from(
    text.replace(UNSAFE_NAME_CHARACTERS, ' ').replace(/\s+/g, ' ').trim(),
  )
    .slice(0, MAX_NAME_LENGTH)
    .join('')
    .replace(/[\s.]+$/, '');
  return cleaned === '' ? fallback : cleaned;
}

/** A Content-Disposition value with a plain-ASCII filename and the full one as `filename*`. */
export function toAttachmentHeader(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(
    fileName,
  ).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )}`;
}

interface ArchiveEntry {
  path: string;
  zipPath: string;
}

const toNumber = (value: unknown) => (typeof value === 'number' ? value : 0);

/** Each saved thing's folder and files, newest thing first (the Things tab's order), photos in the thing's own order. */
function toEntries(
  saleId: string,
  things: Record<string, unknown>[],
  existing: ReadonlySet<string>,
): ArchiveEntry[] {
  const saved = things
    .filter((thing) => SAVED_STATUSES.includes(thing.status))
    .sort(
      (a, b) =>
        toNumber(b.createdAt) - toNumber(a.createdAt) ||
        String(a.id).localeCompare(String(b.id)),
    );
  return saved.flatMap((thing, index) => {
    const photos = readCopyablePhotos(saleId, String(thing.id), thing)
      .slice(0, MAX_PHOTOS_PER_THING)
      .filter((photo) => existing.has(photo.path));
    const name = toSafeName(thing.title, 'Thing');
    const folder = `${String(index + 1).padStart(2, '0')} ${name}`;
    return photos.map((photo, photoIndex) => ({
      path: photo.path,
      zipPath: `${folder}/${name} ${photoIndex + 1}.jpg`,
    }));
  });
}

async function listExistingPaths(saleId: string) {
  const [files] = await getStorage()
    .bucket()
    .getFiles({ prefix: `apps/going-once/sales/${saleId}/items/` });
  return new Set(files.map((file) => file.name));
}

async function writeArchive(
  saleId: string,
  entries: ArchiveEntry[],
  fileName: string,
) {
  const bucket = getStorage().bucket();
  const zip = new ZipFile();
  entries.forEach((entry) =>
    zip.addReadStreamLazy(entry.zipPath, { compress: false }, (done) =>
      done(
        null,
        bucket
          .file(entry.path)
          .createReadStream()
          // yazl doesn't pass a failing source on, so the upload is stopped here rather than left waiting.
          .on('error', (error) =>
            (zip.outputStream as Readable).destroy(error),
          ),
      ),
    ),
  );
  zip.end();

  const target = bucket.file(
    `apps/going-once/sales/${saleId}/exports/photos.zip`,
  );
  await pipeline(
    zip.outputStream,
    target.createWriteStream({
      resumable: false,
      contentType: 'application/zip',
      metadata: {
        contentDisposition: toAttachmentHeader(fileName),
        cacheControl: 'private, max-age=0',
        metadata: { firebaseStorageDownloadTokens: randomUUID() },
      },
    }),
  );
  const [metadata] = await target.getMetadata();
  return { path: target.name, sizeBytes: Number(metadata.size) || 0 };
}

/**
 * Builds one zip of the Available and Pending things' photos (first 12 each, listing size, a folder per thing) for a member of the sale, and replaces `exports/photos.zip` with it.
 * Each photo streams from Storage into a STORE-mode zip and the zip streams into Storage, so the memory used does not grow with the photo count. A missing sale and a caller outside it answer one `not-found`.
 */
export const buildSalePhotoArchive = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    memory: '1GiB',
    timeoutSeconds: 540,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to save photos.');
    }

    const data = isRecord(request.data) ? request.data : {};
    if (!isSafeId(data.saleId)) {
      throw new HttpsError('invalid-argument', 'Choose a sale.');
    }

    const saleId = data.saleId;
    const sale = await saleRef(saleId).get();
    const members: unknown = sale.get('members');
    if (!sale.exists || !Array.isArray(members) || !members.includes(uid)) {
      throw new HttpsError(
        'not-found',
        "We couldn't find this sale. It may already be deleted.",
      );
    }
    if (sale.get('status') === FINISHED_SALE_STATUS) {
      throw new HttpsError('failed-precondition', 'This sale is finished.');
    }

    const [things, existing] = await Promise.all([
      getFirestore()
        .collection(`apps/going-once/sales/${saleId}/items`)
        .get()
        .then((snapshot) =>
          snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
        ),
      listExistingPaths(saleId),
    ]);
    const entries = toEntries(saleId, things, existing);
    if (entries.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'Nothing to save yet: no Available or Pending thing has a photo.',
      );
    }
    if (entries.length > MAX_PHOTOS) {
      throw new HttpsError(
        'resource-exhausted',
        "That's more than 1,500 photos. Save fewer at a time.",
      );
    }

    try {
      const saleName = toSafeName(sale.get('name'), 'Sale');
      const { path, sizeBytes } = await writeArchive(
        saleId,
        entries,
        `${saleName} photos.zip`,
      );
      logger.info('goingOnce.archive.built', {
        photoCount: entries.length,
        sizeBytes,
      });
      return { path, photoCount: entries.length, sizeBytes };
    } catch (error) {
      logger.error('goingOnce.archive.failed', {
        photoCount: entries.length,
        code: describeError(error),
      });
      throw new HttpsError(
        'internal',
        "We couldn't build the zip. Check your connection and try again in a moment.",
      );
    }
  },
);

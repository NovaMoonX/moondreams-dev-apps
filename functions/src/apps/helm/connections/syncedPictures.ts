import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { gcmEncrypt } from '../../../appKeys/gcm.js';
import { toWebpCopy } from '../../../share/imageCopies.js';
import type { HelmKey } from '../helmKey.js';

export interface SyncedPicture {
  /** Names the source photo it was made from, so an unchanged one is never copied again. */
  hash: string;
  nonce: string;
  contentType: string;
  keyId: string;
}

export const PICTURE_PX = 256;
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const EXISTS_CHUNK = 300;
const SWEEP_MIN_AGE_MS = 10 * 60 * 1000;

export const chunk = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

const SOURCE_PREFIXES: Record<string, string> = {
  'app:nine-lives': 'nine-lives/households/',
};

export interface PictureFile {
  getMetadata(): Promise<
    [
      {
        md5Hash?: string;
        generation?: string | number;
        size?: string | number;
      },
      ...unknown[],
    ]
  >;
  download(): Promise<[Buffer]>;
  save(
    data: Buffer,
    options: { contentType: string; resumable: boolean },
  ): Promise<unknown>;
  delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
}

export interface PictureBucket {
  file(path: string): PictureFile;
  getFiles(options: { prefix: string }): Promise<
    [
      {
        name: string;
        metadata?: { timeCreated?: string };
        delete(): Promise<unknown>;
      }[],
      ...unknown[],
    ]
  >;
}

export const syncedPicturePath = (uid: string, id: string) =>
  `apps/helm/syncedPictures/${uid}/${id}`;

/** Null unless the path sits under the source app's own Storage area. */
export const readPictureSource = (connectorId: string, value: unknown) => {
  const prefix = SOURCE_PREFIXES[connectorId];
  return prefix !== undefined &&
    typeof value === 'string' &&
    value.startsWith(prefix) &&
    !value.includes('..') &&
    value.length <= 300
    ? value
    : null;
};

export type PictureSource =
  { status: 'none' } | { status: 'unknown' } | { status: 'ok'; hash: string };

export type PictureAction = 'none' | 'copy' | 'delete';

export const planPicture = (
  source: PictureSource,
  stored: SyncedPicture | null,
  failedSource: string | null = null,
): PictureAction => {
  if (source.status === 'unknown') return 'none';
  if (source.status === 'none')
    return stored === null && failedSource === null ? 'none' : 'delete';
  return (stored !== null && stored.hash === source.hash) ||
    failedSource === source.hash
    ? 'none'
    : 'copy';
};

export const readFailedSource = (value: unknown) =>
  typeof value === 'string' && value !== '' ? value : null;

const isNotFound = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 404;

const readSource = async (
  bucket: PictureBucket,
  path: string | null,
  toHash: (version: string) => string,
): Promise<PictureSource> => {
  if (path === null) return { status: 'none' };
  try {
    const [metadata] = await bucket.file(path).getMetadata();
    if (Number(metadata.size ?? 0) > MAX_SOURCE_BYTES) {
      logger.warn('helm.syncedPicture.tooLarge');
      return { status: 'unknown' };
    }
    return {
      status: 'ok',
      hash: toHash(`${metadata.md5Hash ?? ''}|${metadata.generation ?? ''}`),
    };
  } catch (error) {
    return isNotFound(error) ? { status: 'none' } : { status: 'unknown' };
  }
};

export async function syncPicture(input: {
  bucket: PictureBucket;
  uid: string;
  id: string;
  key: HelmKey;
  sourcePath: string | null;
  stored: SyncedPicture | null;
  failedSource: string | null;
  toHash: (version: string) => string;
}): Promise<{
  picture: SyncedPicture | null;
  failedSource: string | null;
  isChanged: boolean;
}> {
  const { bucket, uid, id, key, sourcePath, stored, failedSource, toHash } =
    input;
  const source = await readSource(bucket, sourcePath, toHash);
  const action = planPicture(source, stored, failedSource);
  const keep = { picture: stored, failedSource, isChanged: false };
  if (action === 'none') return keep;
  const target = bucket.file(syncedPicturePath(uid, id));
  try {
    if (action === 'delete' || source.status !== 'ok' || sourcePath === null) {
      await target.delete({ ignoreNotFound: true });
      return { picture: null, failedSource: null, isChanged: true };
    }
    const [bytes] = await bucket.file(sourcePath).download();
    const copy = await toWebpCopy(bytes, PICTURE_PX).catch(() => null);
    if (copy === null) {
      logger.warn('helm.syncedPicture.undecodable');
      return { picture: stored, failedSource: source.hash, isChanged: true };
    }
    const sealed = gcmEncrypt(key.key, copy, null);
    await target.save(Buffer.from(sealed.ciphertext, 'base64'), {
      contentType: 'application/octet-stream',
      resumable: false,
    });
    return {
      picture: {
        hash: source.hash,
        nonce: sealed.nonce,
        contentType: 'image/webp',
        keyId: key.keyId,
      },
      failedSource: null,
      isChanged: true,
    };
  } catch (error) {
    logger.warn('helm.syncedPicture.failed', {
      cause: error instanceof Error ? error.name : 'error',
    });
    return keep;
  }
}

/** Every delete is tried; any failure rejects, so the records naming them stay for the next run. */
export const deletePictures = (
  bucket: PictureBucket,
  uid: string,
  ids: string[],
) =>
  Promise.all(
    ids.map((id) =>
      bucket.file(syncedPicturePath(uid, id)).delete({ ignoreNotFound: true }),
    ),
  );

/** Removes objects no record names: one saved before its record's batch committed, or whose record was deleted meanwhile. */
export async function sweepOrphanPictures(
  bucket: PictureBucket,
  firestore: Firestore,
  uid: string,
) {
  const prefix = `${syncedPicturePath(uid, '')}`;
  const [files] = await bucket.getFiles({ prefix });
  const now = Date.now();
  // A fresh object may belong to a sync whose batch has not committed yet.
  const entries = files
    .filter((file) => {
      const createdAt = Date.parse(file.metadata?.timeCreated ?? '');
      return Number.isNaN(createdAt) || now - createdAt > SWEEP_MIN_AGE_MS;
    })
    .map((file) => ({ file, id: file.name.slice(prefix.length) }));
  const present = new Set(
    (
      await Promise.all(
        chunk(entries, EXISTS_CHUNK).map((group) =>
          firestore.getAll(
            ...group.map(({ id }) =>
              firestore.doc(`apps/helm/users/${uid}/synced/${id}`),
            ),
          ),
        ),
      )
    )
      .flat()
      .filter((doc) => doc.exists)
      .map((doc) => doc.id),
  );
  const orphans = entries.filter(({ id }) => id !== '' && !present.has(id));
  await Promise.all(orphans.map(({ file }) => file.delete()));
  return orphans.length;
}

export const readStoredPicture = (value: unknown): SyncedPicture | null => {
  if (typeof value !== 'object' || value === null) return null;
  const { hash, nonce, contentType, keyId } = value as Record<string, unknown>;
  return typeof hash === 'string' &&
    typeof nonce === 'string' &&
    typeof contentType === 'string' &&
    typeof keyId === 'string'
    ? { hash, nonce, contentType, keyId }
    : null;
};

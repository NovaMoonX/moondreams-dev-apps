import { logger } from 'firebase-functions';

import { gcmEncrypt } from '../../../appKeys/gcm.js';
import { toWebpCopy } from '../../../share/imageCopies.js';
import type { HelmKey } from '../helmKey.js';

/** The small sealed copy of another app's photo that sits beside a synced record; its bytes are in Storage, the rest on the record. */
export interface SyncedPicture {
  /** Names the source photo it was made from, so an unchanged one is never copied again. */
  hash: string;
  nonce: string;
  contentType: string;
  keyId: string;
}

export const PICTURE_PX = 256;

const SOURCE_PREFIXES: Record<string, string> = {
  'app:nine-lives': 'nine-lives/households/',
};

export interface PictureFile {
  getMetadata(): Promise<
    [{ md5Hash?: string; generation?: string | number }, ...unknown[]]
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
}

export const syncedPicturePath = (uid: string, id: string) =>
  `apps/helm/syncedPictures/${uid}/${id}`;

/** The source object a record's photo is read from, only when it sits under its own app's Storage area; any other address is ignored. */
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

/** What to do with the copy: make one for a photo with none or a changed one, drop it when the source has no photo, and leave it alone when the source cannot be read right now. */
export const planPicture = (
  source: PictureSource,
  stored: SyncedPicture | null,
): PictureAction => {
  if (source.status === 'unknown') return 'none';
  if (source.status === 'none') return stored === null ? 'none' : 'delete';
  return stored !== null && stored.hash === source.hash ? 'none' : 'copy';
};

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
    return {
      status: 'ok',
      hash: toHash(`${metadata.md5Hash ?? ''}|${metadata.generation ?? ''}`),
    };
  } catch (error) {
    return isNotFound(error) ? { status: 'none' } : { status: 'unknown' };
  }
};

/** Settles one record's copy: reads the source's version, and makes, replaces or deletes the sealed avatar. A read that fails keeps what is stored. */
export async function syncPicture(input: {
  bucket: PictureBucket;
  uid: string;
  id: string;
  key: HelmKey;
  sourcePath: string | null;
  stored: SyncedPicture | null;
  toHash: (version: string) => string;
}): Promise<{ picture: SyncedPicture | null; isChanged: boolean }> {
  const { bucket, uid, id, key, sourcePath, stored, toHash } = input;
  const source = await readSource(bucket, sourcePath, toHash);
  const action = planPicture(source, stored);
  const keep = { picture: stored, isChanged: false };
  if (action === 'none') return keep;
  const target = bucket.file(syncedPicturePath(uid, id));
  try {
    if (action === 'delete' || source.status !== 'ok' || sourcePath === null) {
      await target.delete({ ignoreNotFound: true });
      return { picture: null, isChanged: true };
    }
    const [bytes] = await bucket.file(sourcePath).download();
    const sealed = gcmEncrypt(
      key.key,
      await toWebpCopy(bytes, PICTURE_PX),
      null,
    );
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
      isChanged: true,
    };
  } catch (error) {
    logger.warn('helm.syncedPicture.failed', {
      cause: error instanceof Error ? error.name : 'error',
    });
    return keep;
  }
}

/** Deletes the copies' objects; a failure throws, so the records that name them stay and the next run tries again. */
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

/** The picture a record's document names, or null for none. */
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

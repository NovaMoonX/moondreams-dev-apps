import type { Firestore } from 'firebase-admin/firestore';

import { gcmDecrypt } from '../../../appKeys/gcm.js';
import type { SealedPayload } from '../../../appKeys/seal.js';
import type { ToolLoopContent } from '../../../ai/modelProvider.js';
import { toWebpCopy } from '../../../share/imageCopies.js';
import { openForHelm, type HelmKey } from '../helmKey.js';
import { ATTACHMENT_IMAGE_PX, MAX_ATTACHMENTS_PER_TURN } from './mediaCaps.js';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface MediaBucket {
  file(path: string): {
    download(): Promise<[Buffer]>;
    delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
  };
}

export const mediaObjectPath = (uid: string, id: string, isThumb = false) =>
  `apps/helm/media/${uid}/${id}${isThumb ? '.thumb' : ''}`;

/** The readable part of a medium that decides whether a turn may read it. */
export interface MediaRow {
  kind?: unknown;
  status?: unknown;
  sourceCaptureId?: unknown;
  sealed?: unknown;
}

/** A photo opened for the model, with the words sealed beside its bytes. */
export interface OpenedPhoto {
  id: string;
  alias: string;
  words: Record<string, unknown>;
  block: ToolLoopContent;
}

const listIds = (listed: unknown): string[] => [
  ...new Set(
    (Array.isArray(listed) ? listed : []).filter(
      (id): id is string => typeof id === 'string' && ID_RE.test(id),
    ),
  ),
];

/** The photos a turn sent that it may read: only those still received and sent with this very capture, each once, at most the cap; the rest of the eligible ones are refused. */
export const choosePhotos = (
  listed: unknown,
  captureId: string,
  rows: Map<string, MediaRow | undefined>,
): { ids: string[]; refused: string[] } => {
  const eligible = listIds(listed).filter((id) => {
    const row = rows.get(id);
    return (
      row?.kind === 'photo' &&
      row.status === 'received' &&
      row.sourceCaptureId === captureId
    );
  });
  return {
    ids: eligible.slice(0, MAX_ATTACHMENTS_PER_TURN),
    refused: eligible.slice(MAX_ATTACHMENTS_PER_TURN),
  };
};

/** The ids a turn lists, read under the person's own account; `refused` and `unopened` are the photos to let go. */
export async function openMedia(input: {
  firestore: Firestore;
  bucket: MediaBucket;
  base: string;
  uid: string;
  key: HelmKey;
  captureId: string;
  listed: unknown;
}): Promise<{
  photos: OpenedPhoto[];
  unopened: string[];
  refused: string[];
}> {
  const { firestore, bucket, base, uid, key, captureId, listed } = input;
  const candidates = listIds(listed);
  const snapshots = candidates.length
    ? await firestore.getAll(
        ...candidates.map((id) => firestore.doc(`${base}/media/${id}`)),
      )
    : [];
  const rows = new Map<string, MediaRow | undefined>(
    snapshots.map((snapshot) => [
      snapshot.id,
      snapshot.data() as MediaRow | undefined,
    ]),
  );
  const { ids, refused } = choosePhotos(candidates, captureId, rows);
  const opened = await Promise.all(
    ids.map(async (id) => {
      try {
        const words = openForHelm(key, rows.get(id)?.sealed as SealedPayload);
        if (words.keyId !== key.keyId || typeof words.bytesNonce !== 'string') {
          return null;
        }
        const [sealed] = await bucket.file(mediaObjectPath(uid, id)).download();
        const plain = gcmDecrypt(
          key.key,
          sealed.toString('base64'),
          words.bytesNonce,
          null,
        );
        const copy = await toWebpCopy(plain, ATTACHMENT_IMAGE_PX);
        return { id, words, data: copy.toString('base64') };
      } catch {
        return null;
      }
    }),
  );
  const photos = opened
    .flatMap((entry) => (entry ? [entry] : []))
    .map((entry, index): OpenedPhoto => ({
      id: entry.id,
      alias: `m${index + 1}`,
      words: entry.words,
      block: { type: 'image', mediaType: 'image/webp', data: entry.data },
    }));
  return {
    photos,
    unopened: ids.filter((id) => !photos.some((photo) => photo.id === id)),
    refused,
  };
}

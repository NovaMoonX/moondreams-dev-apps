import {
  collection,
  deleteDoc,
  doc,
  type DocumentData,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

import { db, storage } from '@lib/firebase/config';
import { deleteFile } from '@lib/firebase/storage';

import { generateUuid } from '@/utils/idUtils';
import { DAY_MS, PHOTOS_PER_RECORD } from '@apps/helm/constants';
import { sealBytes, sealJson } from '@apps/helm/security';
import type {
  HelmEncryption,
  Media,
  MediaAttachment,
  MediaSealed,
} from '@apps/helm/types';
import { getMediaObjectPath } from '@apps/helm/utils/mediaPath';

/** The who or place a photo shows on. */
export type PhotoOwner = MediaAttachment;

export type AddPhotoResult = 'added' | 'full' | 'missing';

const mediaOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'media');

const ownerRef = (uid: string, owner: PhotoOwner) =>
  doc(
    db,
    'apps',
    'helm',
    'users',
    uid,
    owner.kind === 'who' ? 'who' : 'places',
    owner.id,
  );

/** A who keeps all its photos in `mediaIds` with the main one named in `photoMediaId`; a place keeps them in order in `photoMediaIds` and the first is its cover. */
const listField = (owner: PhotoOwner) =>
  owner.kind === 'who' ? 'mediaIds' : 'photoMediaIds';

const idsOf = (data: DocumentData, owner: PhotoOwner): string[] => {
  const list: unknown = data[listField(owner)];
  return Array.isArray(list)
    ? list.filter((entry): entry is string => typeof entry === 'string')
    : [];
};

const mainOf = (data: DocumentData, owner: PhotoOwner) =>
  owner.kind === 'who'
    ? typeof data.photoMediaId === 'string'
      ? data.photoMediaId
      : null
    : (idsOf(data, owner)[0] ?? null);

const bytesOf = async (file: File) => new Uint8Array(await file.arrayBuffer());

const uploadSealed = (path: string, bytes: Uint8Array) =>
  uploadBytes(ref(storage, path), bytes, {
    contentType: 'application/octet-stream',
  });

/** Deletes each object and answers which ones are gone. */
const deleteObjects = async (paths: string[]) =>
  (await Promise.allSettled(paths.map((path) => deleteFile(path)))).flatMap(
    (outcome, index) => (outcome.status === 'fulfilled' ? [paths[index]] : []),
  );

interface HeldObject {
  path: string;
  /** Null when the bytes could not be read, so Undo cannot put the object back. */
  bytes: Uint8Array | null;
}

const holdObjects = (paths: string[]): Promise<HeldObject[]> =>
  Promise.all(
    paths.map(async (path) => ({
      path,
      bytes: new Uint8Array(await getBytes(ref(storage, path))),
    })),
  );

/** Deletes the held objects, then the document once every object is gone; answers which objects are gone. A document left behind is already marked to be swept. */
const eraseObjects = async (
  mediaRef: ReturnType<typeof doc>,
  held: HeldObject[],
) => {
  const gone = await deleteObjects(held.map((entry) => entry.path));
  if (gone.length === held.length) await deleteDoc(mediaRef);
  else console.error('A removed photo is left to be swept', mediaRef.id);
  return gone;
};

const putObjectsBack = (held: HeldObject[], gone: string[]) =>
  Promise.all(
    held.flatMap((entry) =>
      entry.bytes !== null && gone.includes(entry.path)
        ? [uploadSealed(entry.path, entry.bytes)]
        : [],
    ),
  );

/** Seals a photo and its thumbnail on this device and uploads both, with the document `uploading` first so a failure is marked; then, in one transaction, marks it kept and puts it on the who or place (the first photo of a who or place is its main one). A failure leaves no object or document behind, or a document marked to be swept after a day. */
export async function addPhoto(
  uid: string,
  encryption: HelmEncryption,
  owner: PhotoOwner,
  picture: { file: File; thumb: File },
): Promise<AddPhotoResult> {
  if (!picture.file.type.startsWith('image/')) {
    throw new Error('A photo has to be an image.');
  }
  const id = generateUuid();
  const paths = [
    getMediaObjectPath(uid, id, false),
    getMediaObjectPath(uid, id, true),
  ];
  const [sealedBytes, sealedThumb] = await Promise.all([
    bytesOf(picture.file).then((bytes) => sealBytes(bytes, encryption)),
    bytesOf(picture.thumb).then((bytes) => sealBytes(bytes, encryption)),
  ]);
  const now = Date.now();
  const mediaRef = doc(mediaOf(uid), id);
  const uploading: Media = {
    kind: 'photo',
    role: 'photo',
    status: 'uploading',
    mimeType: picture.file.type,
    hasThumb: true,
    attachedTo: [],
    decidedBy: null,
    createdAt: now,
    decidedAt: null,
    deleteAfter: now + DAY_MS,
    sealed: await sealJson<MediaSealed>(
      {
        bytesNonce: sealedBytes.nonce,
        thumbNonce: sealedThumb.nonce,
        keyId: encryption.keyId,
      },
      encryption,
    ),
  };
  await setDoc(mediaRef, uploading);

  const letGo = async () => {
    const gone = await deleteObjects(paths);
    if (gone.length === paths.length) await deleteDoc(mediaRef);
  };

  try {
    await Promise.all([
      uploadSealed(paths[0], sealedBytes.bytes),
      uploadSealed(paths[1], sealedThumb.bytes),
    ]);
    const result = await runTransaction(
      db,
      async (transaction): Promise<AddPhotoResult> => {
        const target = ownerRef(uid, owner);
        const snapshot = await transaction.get(target);
        const data = snapshot.data();
        if (!data) return 'missing';
        const ids = idsOf(data, owner);
        if (ids.length >= PHOTOS_PER_RECORD) return 'full';
        transaction.update(mediaRef, {
          status: 'kept',
          attachedTo: [owner],
          decidedBy: 'person',
          decidedAt: now,
          deleteAfter: null,
        });
        transaction.update(target, {
          [listField(owner)]: [...ids, id],
          ...(owner.kind === 'who' && mainOf(data, owner) === null
            ? { photoMediaId: id }
            : {}),
        });
        return 'added';
      },
    );
    if (result !== 'added') await letGo();
    return result;
  } catch (error) {
    await letGo().catch((cleanupError: unknown) =>
      console.error('A photo upload was not cleaned up', cleanupError),
    );
    throw error;
  }
}

/** Makes one of the who's or place's photos its main one; `restore` puts the previous main photo (and a place's order) back. */
export async function makeMainPhoto(
  uid: string,
  owner: PhotoOwner,
  mediaId: string,
): Promise<{ restore: () => Promise<void> } | 'missing'> {
  const target = ownerRef(uid, owner);
  const before = await runTransaction(db, async (transaction) => {
    const data = (await transaction.get(target)).data();
    if (!data) return null;
    const ids = idsOf(data, owner);
    if (!ids.includes(mediaId)) return null;
    transaction.update(
      target,
      owner.kind === 'who'
        ? { photoMediaId: mediaId }
        : { photoMediaIds: [mediaId, ...ids.filter((id) => id !== mediaId)] },
    );
    return { ids, main: mainOf(data, owner) };
  });
  if (!before) return 'missing';
  return {
    restore: () =>
      runTransaction(db, async (transaction) => {
        const data = (await transaction.get(target)).data();
        if (!data) return;
        const current = idsOf(data, owner);
        transaction.update(
          target,
          owner.kind === 'who'
            ? {
                photoMediaId:
                  before.main !== null && current.includes(before.main)
                    ? before.main
                    : mainOf(data, owner),
              }
            : {
                photoMediaIds: [
                  ...before.ids.filter((id) => current.includes(id)),
                  ...current.filter((id) => !before.ids.includes(id)),
                ],
              },
        );
      }),
  };
}

/** Every photo a who or place has: those it lists and any medium whose document names it. */
export async function getPhotoIdsOf(uid: string, owner: PhotoOwner) {
  const [snapshot, attached] = await Promise.all([
    getDoc(ownerRef(uid, owner)),
    getDocs(query(mediaOf(uid), where('attachedTo', 'array-contains', owner))),
  ]);
  return Array.from(
    new Set([
      ...idsOf(snapshot.data() ?? {}, owner),
      ...attached.docs.map((entry) => entry.id),
    ]),
  );
}

/** Deletes these photos' sealed objects and documents for a record that is being forgotten (the record's own lists are not touched), keeping the sealed bytes in memory so `restore` can put the photos back. Every photo's bytes are read before anything is deleted; if any delete fails, the photos already deleted are put back and it fails. */
export async function removeMediaOf(uid: string, mediaIds: string[]) {
  const held = (
    await Promise.all(
      mediaIds.map(async (mediaId) => {
        const mediaRef = doc(mediaOf(uid), mediaId);
        const previous = (await getDoc(mediaRef)).data() ?? null;
        if (!previous) return [];
        const paths = [
          getMediaObjectPath(uid, mediaId, false),
          ...(previous.hasThumb === true
            ? [getMediaObjectPath(uid, mediaId, true)]
            : []),
        ];
        return [{ mediaRef, previous, held: await holdObjects(paths) }];
      }),
    )
  ).flat();
  const settled = await Promise.allSettled(
    held.map(async (entry) => {
      await updateDoc(entry.mediaRef, {
        status: 'discarded',
        decidedAt: Date.now(),
        deleteAfter: Date.now() + DAY_MS,
      });
      return { ...entry, gone: await eraseObjects(entry.mediaRef, entry.held) };
    }),
  );
  const taken = settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const restore = () =>
    Promise.all(
      taken.map(async ({ mediaRef, previous, held: bytes, gone }) => {
        await putObjectsBack(bytes, gone);
        await setDoc(mediaRef, previous);
      }),
    ).then(() => undefined);
  const failure = settled.find((result) => result.status === 'rejected');
  if (failure) {
    await restore().catch((error: unknown) => {
      console.error('Helm photos were not put back', error);
    });
    throw failure.reason;
  }
  return { count: taken.length, restore };
}

export interface RemovedPhoto {
  /** Puts the photo back as it was; null when its document was already gone. */
  restore: (() => Promise<void>) | null;
}

/** Takes a photo off its who or place and deletes its sealed objects and document, keeping the sealed bytes in memory so Undo can put it back. The document is marked to be swept first, so a failed delete never leaves bytes nobody can see. */
export async function removePhoto(
  uid: string,
  owner: PhotoOwner,
  mediaId: string,
  hasThumb: boolean,
): Promise<RemovedPhoto | 'missing'> {
  const paths = [
    getMediaObjectPath(uid, mediaId, false),
    ...(hasThumb ? [getMediaObjectPath(uid, mediaId, true)] : []),
  ];
  const held = await holdObjects(paths);
  const target = ownerRef(uid, owner);
  const mediaRef = doc(mediaOf(uid), mediaId);
  const taken = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(target);
    const mediaSnapshot = await transaction.get(mediaRef);
    const data = snapshot.data();
    if (!data) return null;
    const ids = idsOf(data, owner);
    const remaining = ids.filter((id) => id !== mediaId);
    const wasMain = mainOf(data, owner) === mediaId;
    transaction.update(target, {
      [listField(owner)]: remaining,
      ...(owner.kind === 'who' && wasMain
        ? { photoMediaId: remaining[0] ?? null }
        : {}),
    });
    const previous = mediaSnapshot.data() ?? null;
    if (previous) {
      transaction.update(mediaRef, {
        status: 'discarded',
        decidedAt: Date.now(),
        deleteAfter: Date.now() + DAY_MS,
      });
    }
    return {
      index: ids.indexOf(mediaId),
      wasMain,
      promotedId: wasMain ? (remaining[0] ?? null) : null,
      previous,
    };
  });
  if (!taken) return 'missing';

  const gone = await eraseObjects(mediaRef, held);

  const { previous } = taken;
  if (!previous) return { restore: null };
  return {
    restore: async () => {
      await putObjectsBack(held, gone);
      const outcome = await runTransaction(db, async (transaction) => {
        const data = (await transaction.get(target)).data();
        if (!data) return 'missing';
        const ids = idsOf(data, owner);
        if (ids.includes(mediaId)) return 'restored';
        if (ids.length >= PHOTOS_PER_RECORD) return 'full';
        transaction.set(mediaRef, previous);
        transaction.update(target, {
          [listField(owner)]: [
            ...ids.slice(0, taken.index),
            mediaId,
            ...ids.slice(taken.index),
          ],
          ...(owner.kind === 'who' &&
          (mainOf(data, owner) === null ||
            (taken.wasMain && mainOf(data, owner) === taken.promotedId))
            ? { photoMediaId: mediaId }
            : {}),
        });
        return 'restored';
      });
      if (outcome === 'restored') return;
      await deleteObjects(held.map((entry) => entry.path));
      throw new Error(
        outcome === 'full'
          ? 'There is no room to put this photo back.'
          : 'This page is gone.',
      );
    },
  };
}

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
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

import { db, functions, storage } from '@lib/firebase/config';
import { deleteFile } from '@lib/firebase/storage';

import { generateUuid } from '@/utils/idUtils';
import { DAY_MS, HELM_COPY, PHOTOS_PER_RECORD } from '@apps/helm/constants';
import { sealBytes, sealJson } from '@apps/helm/security';
import type {
  Execution,
  ExecutionSealed,
  HelmEncryption,
  Media,
  MediaAttachment,
  MediaKind,
  MediaSealed,
  OpenMedia,
  PhotoOwner,
} from '@apps/helm/types';
import {
  isMediaExpired,
  LET_GO_WINDOW_MS,
  MEDIA_SWEEP_LIMIT,
} from '@apps/helm/utils/mediaCaps';
import {
  getMediaObjectPath,
  getMediaObjectPaths,
} from '@apps/helm/utils/mediaPath';

export type { PhotoOwner };

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
  /** Null when the object was already gone, so there is nothing for Undo to put back. */
  bytes: Uint8Array | null;
}

const holdObjects = (paths: string[]): Promise<HeldObject[]> =>
  Promise.all(
    paths.map(async (path) => ({
      path,
      bytes: await getBytes(ref(storage, path)).then(
        (sealed) => new Uint8Array(sealed),
        (error: unknown) => {
          if ((error as { code?: string }).code === 'storage/object-not-found')
            return null;
          throw error;
        },
      ),
    })),
  );

/** Deletes the held objects, then the document once every object is gone; answers which objects are gone. A document left behind is already marked discarded and the next sweep deletes it. */
const eraseObjects = async (
  mediaRef: ReturnType<typeof doc>,
  held: HeldObject[],
) => {
  const gone = await deleteObjects(held.map((entry) => entry.path));
  if (gone.length === held.length) {
    await deleteDoc(mediaRef).catch((error: unknown) => {
      console.error('A removed photo document was left behind', error);
    });
  } else console.error('A removed photo is left to be swept', mediaRef.id);
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

/** What a medium is made of, before it is sealed: the bytes of a photo, PDF or voice note (none for Markdown, whose text goes in the document), a photo's thumbnail, and what the device measured. */
export interface MediaInput {
  kind: MediaKind;
  mimeType: string;
  file: Blob | null;
  thumb: Blob | null;
  durationMs: number | null;
  pageCount: number | null;
  fileName: string | null;
  text: string | null;
}

const toBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

/** Seals a medium on this device and writes its document as `uploading`, due to be swept in a day, so a failed upload is marked (a Markdown file has no object, so it is written as `received`); the objects are uploaded by `upload`, and `letGo` deletes whatever got there. */
async function startUpload(
  uid: string,
  encryption: HelmEncryption,
  input: MediaInput,
  role: Media['role'],
) {
  const { kind, file, thumb } = input;
  if (kind === 'photo' && !input.mimeType.startsWith('image/')) {
    throw new Error('A photo has to be an image.');
  }
  const id = generateUuid();
  const paths = getMediaObjectPaths(uid, id, kind, thumb !== null);
  const [sealedBytes, sealedThumb] = await Promise.all([
    file ? toBytes(file).then((bytes) => sealBytes(bytes, encryption)) : null,
    thumb ? toBytes(thumb).then((bytes) => sealBytes(bytes, encryption)) : null,
  ]);
  const now = Date.now();
  const mediaRef = doc(mediaOf(uid), id);
  const uploading: Media = {
    kind,
    role,
    status: kind === 'markdown' ? 'received' : 'uploading',
    mimeType: input.mimeType,
    hasThumb: sealedThumb !== null,
    durationMs: input.durationMs,
    pageCount: input.pageCount,
    attachedTo: [],
    decidedBy: null,
    createdAt: now,
    decidedAt: null,
    deleteAfter: now + DAY_MS,
    sourceCaptureId: null,
    executionId: null,
    sealed: await sealJson<MediaSealed>(
      {
        bytesNonce: sealedBytes?.nonce ?? null,
        thumbNonce: sealedThumb?.nonce ?? null,
        caption: null,
        keyId: encryption.keyId,
        fileName: input.fileName,
        text: input.text,
      },
      encryption,
    ),
  };
  await setDoc(mediaRef, uploading);
  return {
    id,
    now,
    mediaRef,
    upload: () =>
      Promise.all(
        [sealedBytes, sealedThumb].flatMap((sealed, index) =>
          sealed ? [uploadSealed(paths[index], sealed.bytes)] : [],
        ),
      ),
    letGo: async () => {
      const gone = await deleteObjects(paths);
      if (gone.length === paths.length) await deleteDoc(mediaRef);
    },
  };
}

/** Seals a photo and its thumbnail on this device and uploads both; then, in one transaction, marks it kept and puts it on the who or place (the first photo of a who or place is its main one). A failure leaves no object or document behind, or a document marked to be swept after a day. */
export async function addPhoto(
  uid: string,
  encryption: HelmEncryption,
  owner: PhotoOwner,
  picture: { file: File; thumb: File },
): Promise<AddPhotoResult> {
  const { id, now, mediaRef, upload, letGo } = await startUpload(
    uid,
    encryption,
    {
      kind: 'photo',
      mimeType: picture.file.type,
      file: picture.file,
      thumb: picture.thumb,
      durationMs: null,
      pageCount: null,
      fileName: null,
      text: null,
    },
    'photo',
  );

  try {
    await upload();
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

/** Uploads a photo, PDF, voice note or Markdown file sent with a turn, sealed on this device: the document is `uploading` first and `received` once its objects are in. Answers its id; a failure leaves nothing behind, or a document marked to be swept after a day. */
export async function uploadAttachment(
  uid: string,
  encryption: HelmEncryption,
  input: MediaInput,
) {
  const { id, mediaRef, upload, letGo } = await startUpload(
    uid,
    encryption,
    input,
    'attachment',
  );
  try {
    await upload();
    if (input.kind !== 'markdown') {
      await updateDoc(mediaRef, { status: 'received' });
    }
    return id;
  } catch (error) {
    await letGo().catch((cleanupError: unknown) =>
      console.error('A photo upload was not cleaned up', cleanupError),
    );
    throw error;
  }
}

/** Deletes a photo, PDF, voice note or Markdown file that was picked but not sent: marked to be swept first, then its objects, then its document. */
export async function removeAttachment(
  uid: string,
  mediaId: string,
  kind: MediaKind,
) {
  const mediaRef = doc(mediaOf(uid), mediaId);
  await updateDoc(mediaRef, {
    status: 'discarded',
    decidedAt: Date.now(),
    deleteAfter: Date.now() + LET_GO_WINDOW_MS,
  });
  await eraseObjects(
    mediaRef,
    getMediaObjectPaths(uid, mediaId, kind, kind === 'photo').map((path) => ({
      path,
      bytes: null,
    })),
  );
}

const executionsOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'executions');

export type KeepResult = 'kept' | 'gone';

export type VoiceNoteWritten =
  { status: 'ready'; text: string } | { status: 'held'; reason: string | null };

const transcribeCallable = httpsCallable<
  { mediaId: string; timeZone: string },
  { status: string; text?: string; reason?: string }
>(functions, 'transcribeHelmVoiceNote');

/** Has the server write out an uploaded voice note; `held` when today's allowance or the service turned it away. */
export async function transcribeVoiceNote(
  mediaId: string,
  timeZone: string,
): Promise<VoiceNoteWritten> {
  const { data } = await transcribeCallable({ mediaId, timeZone });
  return data.status === 'ready' && typeof data.text === 'string'
    ? { status: 'ready', text: data.text }
    : { status: 'held', reason: data.reason ?? null };
}

/** Keeps a photo, file or recording the assistant let go: one transaction marks it kept on `target` (or on nothing) and writes the person's Execution, so Undo can take it back. The photo must still be there and let go. */
export async function keepLetGoMedia(
  uid: string,
  encryption: HelmEncryption,
  input: {
    captureId: string;
    mediaId: string;
    kind: MediaKind;
    fileName: string | null;
    target: { attachment: MediaAttachment; title: string } | null;
  },
): Promise<KeepResult> {
  const { captureId, mediaId, target } = input;
  const noun = HELM_COPY.mediaNoun(input.kind, input.fileName);
  const mediaRef = doc(mediaOf(uid), mediaId);
  const executionRef = doc(executionsOf(uid));
  const title =
    target?.title ?? HELM_COPY.mediaFallbackTitle(input.kind, input.fileName);
  const now = Date.now();
  const sealed = await sealJson<ExecutionSealed>(
    {
      summary: target
        ? HELM_COPY.mediaKeptOn(noun, target.title)
        : HELM_COPY.mediaKeptNoRecord(noun),
      commands: [],
      effects: [
        {
          written: {
            status: 'kept',
            attachedTo: target ? [target.attachment] : [],
            'sealed.title': title,
          },
          previous: {
            status: 'discarded',
            attachedTo: [],
            'sealed.title': title,
          },
        },
      ],
      undoReport: null,
      spoken: null,
      goneIds: null,
      lines: null,
    },
    encryption,
  );
  const execution: Execution = {
    captureId,
    actor: 'person',
    category: 'organize',
    autonomyLevel: 1,
    state: 'succeeded',
    effectRefs: [{ op: 'update', collection: 'media', docId: mediaId }],
    linkedWhoIds: [],
    linkedPlaceIds: [],
    undoesExecutionId: null,
    undoneByExecutionId: null,
    questionRef: null,
    errorCode: null,
    createdAt: now,
    decidedAt: now,
    finishedAt: now,
    sealed,
  };
  return runTransaction(db, async (transaction): Promise<KeepResult> => {
    const data = (await transaction.get(mediaRef)).data();
    if (
      !data ||
      data.status !== 'discarded' ||
      isMediaExpired(data.deleteAfter, now)
    ) {
      return 'gone';
    }
    transaction.update(mediaRef, {
      status: 'kept',
      role: 'attachment',
      attachedTo: target ? [target.attachment] : [],
      decidedBy: 'person',
      decidedAt: now,
      deleteAfter: null,
      executionId: executionRef.id,
    });
    transaction.set(executionRef, execution);
    return 'kept';
  });
}

export interface RemovedKeptPhoto {
  /** Puts the photo back on the record as it was. */
  restore: () => Promise<void>;
}

/** Takes a kept photo off one record (or, with none, off the turn that kept it). With nothing left holding it, it is let go for 24 hours like any photo the assistant didn't keep, so the turn's line stays true and Undo puts it back. */
export async function removeKeptMedia(
  uid: string,
  media: OpenMedia,
  record: MediaAttachment | null,
): Promise<RemovedKeptPhoto | 'gone'> {
  const mediaRef = doc(mediaOf(uid), media.id);
  const previous = (await getDoc(mediaRef)).data() ?? null;
  if (!previous) return 'gone';
  const remaining = toAttached(previous.attachedTo).filter(
    (entry) =>
      record !== null &&
      !(entry.kind === record.kind && entry.id === record.id),
  );
  await updateDoc(
    mediaRef,
    remaining.length > 0
      ? { attachedTo: remaining }
      : {
          status: 'discarded',
          attachedTo: [],
          decidedAt: Date.now(),
          deleteAfter: Date.now() + LET_GO_WINDOW_MS,
        },
  );
  return {
    restore: () =>
      updateDoc(mediaRef, {
        attachedTo: toAttached(previous.attachedTo),
        status: previous.status,
        deleteAfter: previous.deleteAfter ?? null,
        decidedAt: previous.decidedAt ?? null,
      }),
  };
}

const toAttached = (value: unknown): MediaAttachment[] =>
  Array.isArray(value) ? (value as MediaAttachment[]) : [];

/** Lists a sent turn's photos as it sends them: each gets its turn's id and stops being due, in the same batch as the turn, so the batch queues offline. */
export function attachToTurn(
  batch: ReturnType<typeof writeBatch>,
  uid: string,
  mediaIds: string[],
  captureId: string,
) {
  mediaIds.forEach((mediaId) =>
    batch.update(doc(mediaOf(uid), mediaId), {
      sourceCaptureId: captureId,
      deleteAfter: null,
    }),
  );
}

/** Lets go of a held or failed turn's photos: each is discarded and due in 24 hours, in the batch the caller commits. */
export function letGoTurnPhotos(
  batch: ReturnType<typeof writeBatch>,
  uid: string,
  mediaIds: string[],
  now: number,
) {
  mediaIds.forEach((mediaId) =>
    batch.update(doc(mediaOf(uid), mediaId), {
      status: 'discarded',
      decidedBy: 'person',
      decidedAt: now,
      deleteAfter: now + LET_GO_WINDOW_MS,
    }),
  );
}

const sweeping = new Set<string>();

/** Deletes the objects, then the document, of up to 20 of these photos whose time is up (uploads that never finished and photos let go). Best effort: one that fails waits for the next open. Never touches a kept photo; works from the photos already held, with no query. */
export async function sweepExpiredMedia(
  uid: string,
  items: OpenMedia[],
  now: number,
) {
  const due = items
    .filter(
      (item) =>
        item.status !== 'kept' &&
        isMediaExpired(item.deleteAfter, now) &&
        !sweeping.has(item.id),
    )
    .slice(0, MEDIA_SWEEP_LIMIT);
  due.forEach((item) => sweeping.add(item.id));
  await Promise.allSettled(
    due.map(async (item) => {
      try {
        const paths = getMediaObjectPaths(
          uid,
          item.id,
          item.kind,
          item.hasThumb,
        );
        const gone = await deleteObjects(paths);
        if (gone.length === paths.length) {
          await deleteDoc(doc(mediaOf(uid), item.id));
        }
      } catch (error) {
        console.error('An expired photo was not swept', error);
      } finally {
        sweeping.delete(item.id);
      }
    }),
  );
}

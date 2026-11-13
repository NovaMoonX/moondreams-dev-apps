import {
  collection,
  limit,
  onSnapshot,
  query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
  where,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { MEDIA_LIMIT } from '@apps/helm/constants';
import type {
  Media,
  MediaAttachment,
  MediaKind,
  MediaSealed,
  OpenMedia,
} from '@apps/helm/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your photos did not open.');

const toText = (value: unknown) => (typeof value === 'string' ? value : null);

const KINDS: MediaKind[] = ['photo', 'pdf', 'voiceNote', 'markdown'];

const toKind = (value: unknown): MediaKind =>
  KINDS.find((kind) => kind === value) ?? 'photo';

const toAttachments = (value: unknown): MediaAttachment[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is MediaAttachment =>
          typeof entry === 'object' &&
          entry !== null &&
          ['who', 'place', 'task', 'fact', 'note'].includes(
            (entry as MediaAttachment).kind,
          ) &&
          typeof (entry as MediaAttachment).id === 'string',
      )
    : [];

/** A medium that won't open is kept, with no nonces, so a page can say so instead of dropping it. */
async function openMedia(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenMedia> {
  const data = entry.data() as Partial<Media>;
  const base = {
    id: entry.id,
    kind: toKind(data.kind),
    role: data.role ?? 'photo',
    status: data.status ?? 'kept',
    mimeType: data.mimeType ?? 'image/webp',
    hasThumb: data.hasThumb ?? false,
    durationMs: data.durationMs ?? null,
    pageCount: data.pageCount ?? null,
    attachedTo: toAttachments(data.attachedTo),
    decidedBy: data.decidedBy ?? null,
    createdAt: data.createdAt ?? 0,
    decidedAt: data.decidedAt ?? null,
    deleteAfter: data.deleteAfter ?? null,
    sourceCaptureId: data.sourceCaptureId ?? null,
    executionId: data.executionId ?? null,
  } as const;
  try {
    if (!data.sealed) throw new Error('This file has no sealed details.');
    const payload = await read<Partial<MediaSealed>>(data.sealed);
    const bytesNonce = toText(payload.bytesNonce);
    const keyId = toText(payload.keyId);
    if (!keyId || (!bytesNonce && base.kind !== 'markdown')) {
      throw new Error('This file has no nonce.');
    }
    return {
      ...base,
      bytesNonce,
      thumbNonce: toText(payload.thumbNonce),
      caption: toText(payload.caption),
      fileName: toText(payload.fileName),
      text: toText(payload.text),
      keyId,
      isUnreadable: false,
    };
  } catch {
    return {
      ...base,
      bytesNonce: null,
      thumbNonce: null,
      caption: null,
      fileName: null,
      text: null,
      keyId: '',
      isUnreadable: true,
    };
  }
}

/** The person's photos still in play (kept, received, uploading, or let go and waiting to be swept). A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startMediaListener(
  uid: string,
  read: SealedReader,
  onChange: (media: OpenMedia[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'media'),
      where('status', 'in', ['kept', 'received', 'uploading', 'discarded']),
      limit(MEDIA_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openMedia(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened);
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}

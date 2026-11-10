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
  MediaSealed,
  OpenMedia,
} from '@apps/helm/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your photos did not open.');

const toText = (value: unknown) => (typeof value === 'string' ? value : null);

const toAttachments = (value: unknown): MediaAttachment[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is MediaAttachment =>
          typeof entry === 'object' &&
          entry !== null &&
          ((entry as MediaAttachment).kind === 'who' ||
            (entry as MediaAttachment).kind === 'place') &&
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
    kind: 'photo',
    role: data.role ?? 'photo',
    status: data.status ?? 'kept',
    mimeType: data.mimeType ?? 'image/webp',
    hasThumb: data.hasThumb ?? false,
    attachedTo: toAttachments(data.attachedTo),
    decidedBy: data.decidedBy ?? null,
    createdAt: data.createdAt ?? 0,
    decidedAt: data.decidedAt ?? null,
    deleteAfter: data.deleteAfter ?? null,
  } as const;
  try {
    if (!data.sealed) throw new Error('This photo has no sealed details.');
    const payload = await read<Partial<MediaSealed>>(data.sealed);
    const bytesNonce = toText(payload.bytesNonce);
    const keyId = toText(payload.keyId);
    if (!bytesNonce || !keyId) throw new Error('This photo has no nonce.');
    return {
      ...base,
      bytesNonce,
      thumbNonce: toText(payload.thumbNonce),
      keyId,
      isUnreadable: false,
    };
  } catch {
    return {
      ...base,
      bytesNonce: '',
      thumbNonce: null,
      keyId: '',
      isUnreadable: true,
    };
  }
}

/** The person's photos still in play (kept, received or uploading). A slower open never overwrites a newer snapshot or lands after the listener stopped. */
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
      where('status', 'in', ['kept', 'received', 'uploading']),
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

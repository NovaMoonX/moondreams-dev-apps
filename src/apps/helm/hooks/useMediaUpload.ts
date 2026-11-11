import { useEffect, useRef, useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useImageUpload } from '@/hooks/useImageUpload';
import { generateUuid } from '@/utils/idUtils';
import { compressImageForUse } from '@/utils/imageCompression';
import { HELM_COPY } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  addPhoto,
  removeAttachment,
  type PhotoOwner,
  uploadAttachment,
} from '@apps/helm/store/actions/mediaActions';
import { fitAttachments } from '@apps/helm/utils/mediaCaps';

/** Adds a picked photo to a who or place: shrunk on this device (512 px for a who's main photo, 1280 px otherwise), a 512 px thumbnail made, both sealed and uploaded. Says what happened in a toast. */
export function useMediaUpload(owner: PhotoOwner, isMain: boolean) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const { pick, clear, error } = useImageUpload(
    null,
    isMain ? 'avatar' : 'photo',
  );

  const add = async (selected: File | null) => {
    if (!user || !selected) return;
    if (!navigator.onLine) {
      addToast({ title: HELM_COPY.photoNeedsConnection, type: 'info' });
      return;
    }
    setIsUploading(true);
    try {
      const file = await pick(selected);
      if (!file) return;
      const thumb =
        (await compressImageForUse(file, 'thumbnail').catch(() => null)) ??
        file;
      const encryption = await getHelmEncryption(user.uid);
      const result = await addPhoto(user.uid, encryption, owner, {
        file,
        thumb,
      });
      clear();
      addToast({
        title:
          result === 'added'
            ? HELM_COPY.photoAdded
            : result === 'full'
              ? HELM_COPY.photoFull
              : HELM_COPY.photoGone,
        type: result === 'added' ? 'success' : 'info',
      });
    } catch (failure) {
      console.error('Helm photo was not added', failure);
      clear();
      addToast({ title: HELM_COPY.photoFailed, type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  return { add, isUploading, error };
}

export interface TurnAttachment {
  key: string;
  /** The picked file as shown while it uploads and after. */
  previewUrl: string;
  source: File;
  status: 'uploading' | 'ready' | 'failed';
  mediaId: string | null;
}

/** The photos picked for the turn being written, in pick order: each is shrunk on this device to 1,600 px with a thumbnail, sealed and uploaded as it is picked, and listed for Send once it is `ready`. A sixth photo is refused before any shrink or upload. */
export function useTurnAttachments() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [items, setItems] = useState<TurnAttachment[]>([]);
  const latest = useRef<TurnAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const update = (change: (held: TurnAttachment[]) => TurnAttachment[]) => {
    latest.current = change(latest.current);
    setItems(latest.current);
  };
  const patch = (key: string, fields: Partial<TurnAttachment>) =>
    update((held) =>
      held.map((entry) =>
        entry.key === key ? { ...entry, ...fields } : entry,
      ),
    );

  useEffect(
    () => () => {
      latest.current.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
    },
    [],
  );

  const run = async (key: string, source: File) => {
    if (!user) return;
    patch(key, { status: 'uploading' });
    try {
      const file = await compressImageForUse(source, 'cover');
      if (!file) throw new Error('This browser could not open the photo.');
      const thumb =
        (await compressImageForUse(file, 'thumbnail').catch(() => null)) ??
        file;
      const encryption = await getHelmEncryption(user.uid);
      const mediaId = await uploadAttachment(user.uid, encryption, {
        file,
        thumb,
      });
      // Removed while it uploaded: nothing lists it, so it is let go now rather than left for the sweep.
      if (!latest.current.some((entry) => entry.key === key)) {
        void removeAttachment(user.uid, mediaId, true).catch((error: unknown) =>
          console.error('A photo was not removed', error),
        );
        return;
      }
      patch(key, { status: 'ready', mediaId });
    } catch (failure) {
      console.error('Helm photo was not uploaded', failure);
      patch(key, { status: 'failed' });
    }
  };

  const add = (picked: File[]) => {
    if (!user || picked.length === 0) return;
    if (!navigator.onLine) {
      addToast({ title: HELM_COPY.attachNeedsConnection, type: 'info' });
      return;
    }
    const { accepted, refused } = fitAttachments(latest.current.length, picked);
    const reasons = refused.map((entry) => entry.reason);
    const refusal = reasons.includes('tooMany')
      ? accepted.length > 0
        ? HELM_COPY.attachSomeFit(accepted.length)
        : HELM_COPY.attachTooMany
      : reasons.includes('notPhoto')
        ? HELM_COPY.attachNotPhoto
        : null;
    if (refusal) addToast({ title: refusal, type: 'info' });
    setNotice(refusal);
    const added = accepted.map((source): TurnAttachment => ({
      key: generateUuid(),
      previewUrl: URL.createObjectURL(source),
      source,
      status: 'uploading',
      mediaId: null,
    }));
    update((held) => [...held, ...added]);
    added.forEach((entry) => void run(entry.key, entry.source));
  };

  const retry = (key: string) => {
    const found = latest.current.find((entry) => entry.key === key);
    if (found) void run(key, found.source);
  };

  const remove = (key: string) => {
    const found = latest.current.find((entry) => entry.key === key);
    if (!found || !user) return;
    URL.revokeObjectURL(found.previewUrl);
    update((held) => held.filter((entry) => entry.key !== key));
    if (found.mediaId) {
      void removeAttachment(user.uid, found.mediaId, true).catch(
        (error: unknown) => console.error('A photo was not removed', error),
      );
    }
  };

  /** Forgets the chips once their photos are sent; the photos stay. */
  const clear = () => {
    latest.current.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
    setNotice(null);
    update(() => []);
  };

  /** Puts chips for photos already uploaded back, after the turn that carried them did not send. */
  const restore = (sent: TurnAttachment[]) =>
    update((held) => [
      ...held,
      ...sent.map((entry) => ({
        ...entry,
        previewUrl: URL.createObjectURL(entry.source),
      })),
    ]);

  return {
    items,
    add,
    retry,
    remove,
    clear,
    restore,
    notice,
    isUploading: items.some((entry) => entry.status === 'uploading'),
    hasFailed: items.some((entry) => entry.status === 'failed'),
    mediaIds: items.flatMap((entry) =>
      entry.mediaId !== null ? [entry.mediaId] : [],
    ),
  };
}

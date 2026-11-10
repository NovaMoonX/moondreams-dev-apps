import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useImageUpload } from '@/hooks/useImageUpload';
import { compressImageForUse } from '@/utils/imageCompression';
import { HELM_COPY } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  addPhoto,
  type PhotoOwner,
} from '@apps/helm/store/actions/mediaActions';

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

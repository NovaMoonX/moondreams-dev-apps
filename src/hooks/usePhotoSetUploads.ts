import { useCallback, useEffect, useRef, useState } from 'react';

import { getErrorMessage } from '@/utils/errorUtils';
import { compressImageForUse } from '@/utils/imageCompression';
import { generateUuid } from '@/utils';

/** A picked photo on its way to being saved with the record. */
export interface PhotoUpload {
  key: string;
  /** The shrunk photo, once it exists. */
  previewUrl: string | null;
  status: 'preparing' | 'saving' | 'saved' | 'failed';
  message: string | null;
  /** The saved photo's id, once it is saved; the upload stays until the record lists it. */
  photoId: string | null;
}

const UNREADABLE_PHOTO =
  "This photo's format can't be opened here. Try a JPG or PNG, or pick it from your phone.";

/**
 * Shrinks each picked photo on the device (the `listing` use) and hands it to `onAdd`, so the state outlives the
 * picker's screen: a photo still saving when the person moves on finishes in the background. Photos shrink side by
 * side but are handed over in pick order. `onAdd` returns the saved photo's id and throws a readable message when it
 * can't save; a saved upload keeps showing until its id is among `listedIds`, so the thumb never blinks.
 */
export function usePhotoSetUploads(
  onAdd: (file: File) => Promise<string>,
  listedIds: string[],
) {
  const [uploads, setUploads] = useState<PhotoUpload[]>([]);
  const addRef = useRef(onAdd);
  const shrunk = useRef(new Map<string, File>());
  const previews = useRef(new Map<string, string>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const isLive = useRef(true);

  useEffect(() => {
    addRef.current = onAdd;
  });

  useEffect(() => {
    isLive.current = true;
    const files = shrunk.current;
    const urls = previews.current;
    return () => {
      isLive.current = false;
      files.clear();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const patch = useCallback((key: string, changes: Partial<PhotoUpload>) => {
    setUploads((current) =>
      current.map((upload) =>
        upload.key === key ? { ...upload, ...changes } : upload,
      ),
    );
  }, []);

  const drop = useCallback((keys: string[]) => {
    keys.forEach((key) => {
      shrunk.current.delete(key);
      const url = previews.current.get(key);
      if (url) URL.revokeObjectURL(url);
      previews.current.delete(key);
    });
    setUploads((current) =>
      current.filter((upload) => !keys.includes(upload.key)),
    );
  }, []);

  const save = useCallback(
    async (key: string, file: File) => {
      patch(key, { status: 'saving', message: null });
      try {
        const photoId = await addRef.current(file);
        shrunk.current.delete(key);
        patch(key, { status: 'saved', photoId });
      } catch (error) {
        patch(key, {
          status: 'failed',
          message: getErrorMessage(error, "This photo didn't upload."),
        });
      }
    },
    [patch],
  );

  const shrink = useCallback(
    async (key: string, file: File) => {
      const result = await compressImageForUse(file, 'listing');
      if (result === null) {
        patch(key, { status: 'failed', message: UNREADABLE_PHOTO });
        return null;
      }
      shrunk.current.set(key, result);
      if (isLive.current) {
        const url = URL.createObjectURL(result);
        previews.current.set(key, url);
        patch(key, { previewUrl: url });
      }
      return result;
    },
    [patch],
  );

  const add = useCallback(
    (files: File[]) => {
      const entries = files.map((file) => ({ key: generateUuid(), file }));
      setUploads((current) => [
        ...current,
        ...entries.map(({ key }) => ({
          key,
          previewUrl: null,
          status: 'preparing' as const,
          message: null,
          photoId: null,
        })),
      ]);
      entries.forEach(({ key, file }) => {
        const shrinking = shrink(key, file);
        queue.current = queue.current.then(async () => {
          const result = await shrinking;
          if (result !== null) await save(key, result);
        });
      });
    },
    [shrink, save],
  );

  const retry = useCallback(
    (key: string) => {
      const file = shrunk.current.get(key);
      if (file) void save(key, file);
    },
    [save],
  );

  const dismiss = useCallback((key: string) => drop([key]), [drop]);

  /** Forgets the saved upload behind a photo the record is losing, so it never comes back once the record drops it. */
  const forget = useCallback(
    (photoId: string) =>
      drop(
        uploads
          .filter((upload) => upload.photoId === photoId)
          .map((upload) => upload.key),
      ),
    [uploads, drop],
  );

  const shown = uploads.filter(
    (upload) => upload.photoId === null || !listedIds.includes(upload.photoId),
  );

  return { uploads: shown, add, retry, dismiss, forget };
}

export type PhotoSetUploads = ReturnType<typeof usePhotoSetUploads>;

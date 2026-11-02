import { useCallback, useEffect, useRef, useState } from 'react';

import { getErrorMessage } from '@/utils/errorUtils';
import { compressImageForUse } from '@/utils/imageCompression';
import { generateUuid } from '@/utils';

/** A picked photo on its way to being saved with the record. */
export interface PhotoUpload {
  key: string;
  /** The shrunk photo, once it exists. */
  previewUrl: string | null;
  status: 'preparing' | 'saving' | 'failed';
  message: string | null;
}

const UNREADABLE_PHOTO =
  "This photo's format can't be opened here. Try a JPG or PNG, or pick it from your phone.";

/**
 * Shrinks each picked photo for a listing on the device and hands it to `onAdd`, one at a time per photo, so the
 * state outlives the picker's screen: a photo still saving when the person moves on finishes in the background.
 * `onAdd` throws a readable message when it can't save.
 */
export function usePhotoSetUploads(onAdd: (file: File) => Promise<void>) {
  const [uploads, setUploads] = useState<PhotoUpload[]>([]);
  const addRef = useRef(onAdd);
  const shrunk = useRef(new Map<string, File>());

  useEffect(() => {
    addRef.current = onAdd;
  });

  useEffect(() => {
    const files = shrunk.current;
    return () => files.clear();
  }, []);

  const patch = useCallback((key: string, changes: Partial<PhotoUpload>) => {
    setUploads((current) =>
      current.map((upload) =>
        upload.key === key ? { ...upload, ...changes } : upload,
      ),
    );
  }, []);

  const drop = useCallback((key: string) => {
    shrunk.current.delete(key);
    setUploads((current) => {
      const found = current.find((upload) => upload.key === key);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return current.filter((upload) => upload.key !== key);
    });
  }, []);

  const save = useCallback(
    async (key: string, file: File) => {
      patch(key, { status: 'saving', message: null });
      try {
        await addRef.current(file);
        drop(key);
      } catch (error) {
        patch(key, {
          status: 'failed',
          message: getErrorMessage(error, "This photo didn't upload."),
        });
      }
    },
    [patch, drop],
  );

  const prepare = useCallback(
    async (key: string, file: File) => {
      const result = await compressImageForUse(file, 'listing');
      if (result === null) {
        patch(key, { status: 'failed', message: UNREADABLE_PHOTO });
        return;
      }
      shrunk.current.set(key, result);
      patch(key, { previewUrl: URL.createObjectURL(result) });
      await save(key, result);
    },
    [patch, save],
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
        })),
      ]);
      entries.forEach(({ key, file }) => void prepare(key, file));
    },
    [prepare],
  );

  const retry = useCallback(
    (key: string) => {
      const file = shrunk.current.get(key);
      if (file) void save(key, file);
    },
    [save],
  );

  return { uploads, add, retry, dismiss: drop };
}

export type PhotoSetUploads = ReturnType<typeof usePhotoSetUploads>;

import { useCallback, useState } from 'react';

import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import { getErrorMessage, getStorageErrorMessage } from '@/utils/errorUtils';

export interface UseStoragePhotoResult {
  isWorking: boolean;
  error: string | null;
  /** Uploads `file` to the fixed `path`, replacing any existing photo, and returns a cache-busted download URL. Does not touch `isWorking`/`error`; wrap with `track`. */
  put: (file: File) => Promise<string>;
  /** Deletes the photo at `path`; a missing photo is not an error. Does not touch `isWorking`/`error`; wrap with `track`. */
  del: () => Promise<void>;
  /** Runs `task` while owning `isWorking`/`error`, so a multi-step operation stays busy until its last step. */
  track: <T>(task: () => Promise<T>) => Promise<T>;
  upload: (file: File) => Promise<string>;
  remove: () => Promise<void>;
}

/** Storage side of a single-photo slot at a fixed path. Pair with `useImageUpload` for picking and previewing. */
export function useStoragePhoto(path: string): UseStoragePhotoResult {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(task: () => Promise<T>) => {
    setIsWorking(true);
    setError(null);

    try {
      return await task();
    } catch (caught) {
      setError(
        getStorageErrorMessage(caught, getErrorMessage(caught, 'Please try again.')),
      );
      throw caught;
    } finally {
      setIsWorking(false);
    }
  }, []);

  const put = useCallback(
    async (file: File) => {
      const url = await uploadFile(path, file);
      return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
    },
    [path],
  );

  const del = useCallback(() => deleteFile(path), [path]);

  const upload = useCallback((file: File) => run(() => put(file)), [put, run]);
  const remove = useCallback(() => run(del), [del, run]);

  return { isWorking, error, put, del, track: run, upload, remove };
}

import { useCallback, useState } from 'react';

import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import { getErrorMessage, getStorageErrorMessage } from '@/utils/errorUtils';

export interface UseStoragePhotoResult {
  isWorking: boolean;
  error: string | null;
  /** Uploads `file` to the fixed `path`, replacing any existing photo, and returns a cache-busted download URL. */
  upload: (file: File) => Promise<string>;
  /** Deletes the photo at `path`; a missing photo is not an error. */
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

  const upload = useCallback(
    (file: File) =>
      run(async () => {
        const url = await uploadFile(path, file);
        return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
      }),
    [path, run],
  );

  const remove = useCallback(() => run(() => deleteFile(path)), [path, run]);

  return { isWorking, error, upload, remove };
}

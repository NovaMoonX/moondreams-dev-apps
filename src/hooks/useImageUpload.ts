import { useCallback, useEffect, useRef, useState } from 'react';

import { compressImageForUse, type ImageUse } from '@/utils/imageCompression';

const UNREADABLE_PHOTO =
  "This photo's format can't be opened here. Try a JPG or PNG, or pick it from your phone.";
const KEPT_EARLIER = ' Your earlier photo stays.';

export interface UseImageUploadResult {
  /** The shrunk photo, ready to upload; never the original pick. */
  file: File | null;
  previewUrl: string | null;
  error: string | null;
  /** True while a picked photo is being shrunk. */
  isPreparing: boolean;
  /** The file to upload, waiting for the latest photo still being shrunk; use it in a save instead of `file`. A failed pick leaves the earlier photo, and its error says so. */
  readyFile: () => Promise<File | null>;
  /** Shrinks the pick for its use and resolves with the file to upload, or `null` when it couldn't be used. */
  pick: (selected: File | null) => Promise<File | null>;
  clear: () => void;
}

/**
 * Client-side "pick an image + preview it" state, with no Storage calls of
 * its own. Any size of photo is accepted and shrunk on the device for `use`.
 */
export function useImageUpload(
  initialUrl: string | null,
  use: ImageUse,
): UseImageUploadResult {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const objectUrlRef = useRef<string | null>(null);
  const pickIdRef = useRef(0);
  const fileRef = useRef<File | null>(null);
  const pendingRef = useRef<Promise<File | null> | null>(null);
  const hasPreviewRef = useRef(initialUrl !== null);

  useEffect(() => {
    return () => {
      pickIdRef.current += 1;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const prepare = useCallback(
    async (selected: File, pickId: number) => {
      const prepared = await compressImageForUse(selected, use);
      if (pickId !== pickIdRef.current) {
        return null;
      }
      pendingRef.current = null;
      setIsPreparing(false);

      if (!prepared) {
        setError(
          hasPreviewRef.current ? UNREADABLE_PHOTO + KEPT_EARLIER : UNREADABLE_PHOTO,
        );
        return null;
      }

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }

      const nextUrl = URL.createObjectURL(prepared);
      objectUrlRef.current = nextUrl;
      fileRef.current = prepared;
      hasPreviewRef.current = true;

      setFile(prepared);
      setPreviewUrl(nextUrl);
      return prepared;
    },
    [use],
  );

  const pick = useCallback(
    async (selected: File | null) => {
      if (!selected) {
        return null;
      }

      if (selected.type !== '' && !selected.type.startsWith('image/')) {
        setError('Please choose an image file.');
        return null;
      }

      const pickId = pickIdRef.current + 1;
      pickIdRef.current = pickId;
      setIsPreparing(true);
      setError(null);

      const pending = prepare(selected, pickId);
      pendingRef.current = pending;
      return pending;
    },
    [prepare],
  );

  const readyFile = useCallback(async function waitForLatest(): Promise<
    File | null
  > {
    const pending = pendingRef.current;
    if (pending === null) return fileRef.current;
    await pending;
    return waitForLatest();
  }, []);

  const clear = useCallback(() => {
    pickIdRef.current += 1;
    pendingRef.current = null;
    fileRef.current = null;
    hasPreviewRef.current = false;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setIsPreparing(false);
    setError(null);
    setFile(null);
    setPreviewUrl(null);
  }, []);

  return { file, previewUrl, error, isPreparing, readyFile, pick, clear };
}

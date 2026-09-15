import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface UseImageUploadResult {
  file: File | null;
  previewUrl: string | null;
  error: string | null;
  pick: (selected: File | null) => void;
  clear: () => void;
}

/**
 * Client-side "pick an image + preview it" state, with no Storage calls of
 * its own — callers decide when (and whether) to actually upload `file`.
 */
export function useImageUpload(
  initialUrl: string | null = null,
): UseImageUploadResult {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const pick = useCallback((selected: File | null) => {
    if (!selected) {
      return;
    }

    if (!selected.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }

    if (selected.size > MAX_IMAGE_BYTES) {
      setError('Image must be under 5MB.');
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const nextUrl = URL.createObjectURL(selected);
    objectUrlRef.current = nextUrl;

    setError(null);
    setFile(selected);
    setPreviewUrl(nextUrl);
  }, []);

  const clear = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setError(null);
    setFile(null);
    setPreviewUrl(null);
  }, []);

  return { file, previewUrl, error, pick, clear };
}

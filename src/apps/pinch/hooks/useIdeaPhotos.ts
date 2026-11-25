import { useCallback, useEffect, useRef, useState } from 'react';

import { compressImageForUse } from '@/utils/imageCompression';
import { generateUuid } from '@/utils';
import { MAX_RECIPE_FILES } from '@apps/pinch/constants';

export interface IdeaPhoto {
  key: string;
  file: File;
  previewUrl: string;
}

const UNREADABLE_PHOTO =
  "This photo's format can't be opened here. Try a JPG or PNG, or pick it from your phone.";

/** The pictures picked for a photo idea, shrunk on the device, at most `MAX_RECIPE_FILES`; saves await `readyFiles`, so a Save tapped mid-shrink waits for the latest pick. */
export function useIdeaPhotos() {
  const [photos, setPhotos] = useState<IdeaPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(0);
  const photosRef = useRef<IdeaPhoto[]>([]);
  const countRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const isLiveRef = useRef(true);
  const urlsRef = useRef(new Set<string>());

  useEffect(() => {
    isLiveRef.current = true;
    const urls = urlsRef.current;
    return () => {
      isLiveRef.current = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const add = useCallback((picked: File[]) => {
    const room = MAX_RECIPE_FILES - countRef.current;
    if (room <= 0) {
      setError(
        `That's ${MAX_RECIPE_FILES} photos already, the most one idea keeps.`,
      );
      return;
    }
    const next = picked.slice(0, room);
    if (
      next.some((file) => file.type !== '' && !file.type.startsWith('image/'))
    ) {
      setError('Please choose image files.');
      return;
    }
    setError(
      picked.length > room
        ? `Up to ${MAX_RECIPE_FILES} photos, so only ${room === 1 ? 'the first one was' : `the first ${room} were`} added.`
        : null,
    );
    countRef.current += next.length;
    setPreparing((count) => count + next.length);

    queueRef.current = queueRef.current.then(async () => {
      const prepared = await Promise.all(
        next.map((file) => compressImageForUse(file, 'photo')),
      );
      const made = prepared.flatMap((file) =>
        file === null || !isLiveRef.current
          ? []
          : [
              {
                key: generateUuid(),
                file,
                previewUrl: URL.createObjectURL(file),
              },
            ],
      );
      made.forEach(({ previewUrl }) => urlsRef.current.add(previewUrl));
      countRef.current -= next.length - made.length;
      photosRef.current = [...photosRef.current, ...made];
      if (!isLiveRef.current) return;
      setPhotos(photosRef.current);
      setPreparing((count) => count - next.length);
      if (made.length < next.length) setError(UNREADABLE_PHOTO);
    });
  }, []);

  const clear = useCallback(() => {
    queueRef.current = queueRef.current.then(() => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current.clear();
      photosRef.current = [];
      countRef.current = 0;
      if (!isLiveRef.current) return;
      setPhotos([]);
      setError(null);
    });
  }, []);

  const readyFiles = useCallback(async () => {
    await queueRef.current;
    return photosRef.current.map((photo) => photo.file);
  }, []);

  return { photos, error, isPreparing: preparing > 0, add, clear, readyFiles };
}

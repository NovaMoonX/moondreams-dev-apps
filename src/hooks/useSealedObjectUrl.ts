import { useEffect, useRef, useState } from 'react';
import { getBytes, ref } from 'firebase/storage';

import { storage } from '@lib/firebase/config';

import { useAuth } from '@/hooks/useAuth';

const MAX_REMEMBERED_OBJECTS = 24;
const remembered = new Map<string, Promise<Blob>>();
const owner = { uid: null as string | null };

/** Drops one sealed object's opened bytes (and any variant whose id starts `{id}.`) from this device's memory. */
export function forgetSealedObject(id: string) {
  Array.from(remembered.keys())
    .filter((key) => {
      const rest = key.slice(key.indexOf(':') + 1);
      return rest === id || rest.startsWith(`${id}.`);
    })
    .forEach((key) => remembered.delete(key));
}

interface SealedObject {
  id: string;
  path: string;
  nonce: string;
  contentType: string;
  open: (bytes: Uint8Array, nonce: string) => Promise<Uint8Array>;
}

const openObject = (uid: string, object: SealedObject) => {
  if (owner.uid !== uid) {
    remembered.clear();
    owner.uid = uid;
  }
  const key = `${uid}:${object.id}`;
  const known = remembered.get(key);
  if (known) return known;
  if (remembered.size >= MAX_REMEMBERED_OBJECTS) remembered.clear();
  const opening = (async () => {
    const sealed = await getBytes(ref(storage, object.path));
    const bytes = await object.open(new Uint8Array(sealed), object.nonce);
    return new Blob([bytes as BlobPart], { type: object.contentType });
  })();
  remembered.set(key, opening);
  opening.catch(() => remembered.delete(key));
  return opening;
};

interface SealedObjectUrlState {
  id: string;
  url: string | null;
}

interface UseSealedObjectUrlOptions {
  /** Names the object in the session's memory; a different object never shares an id. */
  id: string;
  path: string;
  nonce: string;
  contentType: string;
  /** Opens the sealed bytes; may read its key from wherever the caller keeps it. */
  open: (bytes: Uint8Array, nonce: string) => Promise<Uint8Array>;
  /** While false nothing is fetched or opened. */
  isEnabled: boolean;
}

/** An object URL for a sealed Storage object once it is fetched and opened on this device, or `null` while it opens, when it cannot be opened and while `isEnabled` is false. Opened objects are remembered for the session (a few, for the signed-in person only) and the URL is revoked when it changes or the component unmounts. */
export function useSealedObjectUrl({
  id,
  path,
  nonce,
  contentType,
  open,
  isEnabled,
}: UseSealedObjectUrlOptions): { url: string | null; isFailed: boolean } {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<SealedObjectUrlState | null>(null);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
  });

  useEffect(() => {
    if (!uid) {
      remembered.clear();
      owner.uid = null;
    }
    if (!uid || !isEnabled) return;
    const run = { isCurrent: true, url: null as string | null };
    openObject(uid, {
      id,
      path,
      nonce,
      contentType,
      open: (bytes, bytesNonce) => openRef.current(bytes, bytesNonce),
    })
      .then((blob) => {
        if (!run.isCurrent) return;
        run.url = URL.createObjectURL(blob);
        setState({ id, url: run.url });
      })
      .catch((error) => {
        console.error('A sealed object did not open', error);
        if (run.isCurrent) setState({ id, url: null });
      });
    return () => {
      run.isCurrent = false;
      if (run.url) URL.revokeObjectURL(run.url);
    };
  }, [uid, isEnabled, id, path, nonce, contentType]);

  const isCurrent = isEnabled && state?.id === id;
  return {
    url: isCurrent ? (state?.url ?? null) : null,
    isFailed: isCurrent && state?.url === null,
  };
}

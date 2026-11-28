import { useSyncExternalStore } from 'react';

import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';

import { functions, storage } from '@/lib/firebase/config';

const BUILD_TIMEOUT_MS = 560_000;
/** How long a finished zip is offered again on reopening before the sheet asks for a fresh build. */
const KEEP_BUILT_MS = 10 * 60_000;

export interface Built {
  url: string;
  photoCount: number;
  sizeBytes: number;
}

const buildCallable = httpsCallable<
  { saleId: string },
  { path: string; photoCount: number; sizeBytes: number }
>(functions, 'buildSalePhotoArchive', { timeout: BUILD_TIMEOUT_MS });

/** A build keeps running when the sheet closes, and a finished one is kept a while, so reopening finds it by sale. */
const builds = new Map<string, { build: Promise<Built>; startedAt: number }>();
const building = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const findBuild = (saleId: string) => {
  const found = builds.get(saleId);
  return found !== undefined && Date.now() - found.startedAt < KEEP_BUILT_MS
    ? found.build
    : null;
};

export const startBuild = (saleId: string) => {
  const build = buildCallable({ saleId }).then(async ({ data }) => ({
    url: await getDownloadURL(ref(storage, data.path)),
    photoCount: data.photoCount,
    sizeBytes: data.sizeBytes,
  }));
  builds.set(saleId, { build, startedAt: Date.now() });
  building.add(saleId);
  notify();
  build
    .catch(() => builds.delete(saleId))
    .finally(() => {
      building.delete(saleId);
      notify();
    });
  return build;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Whether this sale's photo zip is being built right now, on this device. */
export function useIsBuildingPhotos(saleId: string): boolean {
  return useSyncExternalStore(subscribe, () => building.has(saleId));
}

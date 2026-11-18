import type { Firestore } from 'firebase-admin/firestore';

import { createDailyReserve } from '../../../videoSearch/dailyCap.js';
import {
  createVideoSearchDeps,
  type VideoSearchDeps,
} from '../../../videoSearch/searchVideos.js';

let deps: VideoSearchDeps | null = null;

/** One video search setup per process, so the key is read once and remembered. */
export const getVideoSearchDeps = (firestore: Firestore): VideoSearchDeps => {
  deps ??= createVideoSearchDeps(
    createDailyReserve(firestore, 'apps/helm/server/videoSearch/days'),
  );
  return deps;
};

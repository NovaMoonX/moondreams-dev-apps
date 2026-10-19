import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { createOptionalSecretReader } from '../../imageSearch/optionalSecret.js';
import {
  DEFAULT_PROVIDER_LIST,
  PROVIDER_FACTORIES,
  parseProviderList,
} from '../../imageSearch/providers.js';
import {
  MIN_QUERY_LENGTH,
  normalizeQuery,
  searchImages,
  type CacheEntry,
  type SearchDeps,
} from '../../imageSearch/searchImages.js';
import { ImageSearchError, type FetchLike } from '../../imageSearch/types.js';
import {
  getQuotaDay,
  readCap,
  stepBudget,
  stepPersonUsage,
  type PersonUsage,
} from '../../imageSearch/usage.js';

if (getApps().length === 0) {
  initializeApp();
}

const fetchLike: FetchLike = (url, init) => fetch(url, init);
const readSecret = createOptionalSecretReader({ fetch: fetchLike });
const providers = parseProviderList(
  process.env.IMAGE_SEARCH_PROVIDERS ?? DEFAULT_PROVIDER_LIST,
).map((name) => PROVIDER_FACTORIES[name](readSecret));

const CAP_ENV: Record<string, string> = {
  google: 'IMAGE_SEARCH_GOOGLE_DAILY_CAP',
  ddg: 'IMAGE_SEARCH_DDG_DAILY_CAP',
};

const cacheDoc = (id: string) =>
  getFirestore().doc(`apps/pinch/imageSearchCache/${id}`);
const usageDoc = (id: string) =>
  getFirestore().doc(`apps/pinch/imageSearchUsage/${id}`);

const createDeps = (uid: string): SearchDeps => ({
  providers,
  fetch: fetchLike,
  now: Date.now,
  cache: {
    get: async (id) => {
      const snapshot = await cacheDoc(id).get();
      const cachedAt = snapshot.get('cachedAt') as unknown;
      const results = snapshot.get('results') as unknown;
      return snapshot.exists &&
        typeof cachedAt === 'number' &&
        Array.isArray(results)
        ? ({ results, cachedAt } as CacheEntry)
        : null;
    },
    set: async (id, entry) => {
      await cacheDoc(id).set(entry);
    },
  },
  reserve: async (providerId, quota) => {
    const ref = usageDoc(
      `${providerId}_${getQuotaDay(Date.now(), quota.timeZone)}`,
    );
    const cap = readCap(process.env[CAP_ENV[providerId] ?? ''], quota.dailyCap);
    return getFirestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const step = stepBudget(
        (snapshot.get('count') as number | undefined) ?? 0,
        cap,
      );
      if (step.allowed) transaction.set(ref, { count: step.next });
      return step.allowed;
    });
  },
  takeTurn: async () => {
    const ref = usageDoc(`person_${uid}`);
    const now = Date.now();
    return getFirestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const step = stepPersonUsage(
        snapshot.exists ? (snapshot.data() as PersonUsage) : null,
        now,
        getQuotaDay(now, 'UTC'),
      );
      if (step.allowed) transaction.set(ref, step.next);
      return step.allowed;
    });
  },
  log: (message, detail) => console.warn(message, detail),
});

export const searchRecipeImages = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 30,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to look for photos.');
    }

    const query = normalizeQuery(request.data?.query);
    if (query.length < MIN_QUERY_LENGTH) {
      throw new HttpsError(
        'invalid-argument',
        'Search for a title of at least 2 characters.',
      );
    }

    try {
      const results = await searchImages(query, createDeps(uid));
      return { results };
    } catch (error) {
      if (error instanceof ImageSearchError && error.code === 'rate_limited') {
        throw new HttpsError(
          'resource-exhausted',
          'Photo search is resting for a moment. Try again soon.',
        );
      }
      console.error('image search could not answer', {
        reason: error instanceof ImageSearchError ? error.code : 'unexpected',
      });
      throw new HttpsError(
        'unavailable',
        'We couldn’t look up photos just now.',
      );
    }
  },
);

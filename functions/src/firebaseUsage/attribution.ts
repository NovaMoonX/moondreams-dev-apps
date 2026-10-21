import { getFirestore, type CollectionReference } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const APP_IDS = ['a-list', 'nine-lives', 'pinch', 'waypoint', 'worth-the-wait'];

// Storage folders that don't sit under `apps/<id>/`.
const STORAGE_PREFIXES: Record<string, string[]> = {
  'a-list': [],
  'nine-lives': ['nine-lives/'],
  pinch: ['apps/pinch/'],
  waypoint: ['waypoint/'],
  'worth-the-wait': [],
};
const SHARED_STORAGE_PREFIXES = ['users/'];

const MAX_DEPTH = 3;
const MAX_PARENTS_PER_COLLECTION = 100;
const MAX_COUNT_CALLS = 600;
const MAX_STORAGE_PAGES = 20;
const CACHE_MS = 60 * 60 * 1000;

export interface AppFootprint {
  appId: string;
  documents: number;
  storageBytes: number;
}

export interface Footprints {
  apps: AppFootprint[];
  sharedStorageBytes: number;
  /** True when a size cap stopped a count early, so the figures are a floor. */
  isPartial: boolean;
  measuredAt: number;
}

let cached: Footprints | null = null;

async function sumStorage(prefix: string) {
  const bucket = getStorage().bucket();
  const walk = async (query: object | undefined, pages: number, total: number): Promise<{ bytes: number; isPartial: boolean }> => {
    const [files, next] = await bucket.getFiles({ ...(query ?? { prefix }), maxResults: 1000, autoPaginate: false });
    const bytes = total + files.reduce((sum, file) => sum + Number(file.metadata.size ?? 0), 0);
    if (!next) return { bytes, isPartial: false };
    if (pages + 1 >= MAX_STORAGE_PAGES) return { bytes, isPartial: true };
    return walk(next, pages + 1, bytes);
  };
  const result = await walk(undefined, 0, 0);
  return result;
}

async function sumStoragePrefixes(prefixes: string[]) {
  const parts = await Promise.all(prefixes.map(sumStorage));
  const result = {
    bytes: parts.reduce((sum, part) => sum + part.bytes, 0),
    isPartial: parts.some((part) => part.isPartial),
  };
  return result;
}

/** Counts a collection and the subcollections under its documents, within a fixed call budget. */
async function countTree(collection: CollectionReference, depth: number, budget: { calls: number; isPartial: boolean }): Promise<number> {
  if (budget.calls >= MAX_COUNT_CALLS) {
    budget.isPartial = true;
    return 0;
  }
  budget.calls += 1;
  const own = (await collection.count().get()).data().count;
  if (depth >= MAX_DEPTH) return own;

  const parents = await collection.limit(MAX_PARENTS_PER_COLLECTION + 1).select().get();
  if (parents.size > MAX_PARENTS_PER_COLLECTION) budget.isPartial = true;
  const nested = await Promise.all(
    parents.docs.slice(0, MAX_PARENTS_PER_COLLECTION).map(async (parent) => {
      const subcollections = await parent.ref.listCollections();
      const counts = await Promise.all(subcollections.map((sub) => countTree(sub, depth + 1, budget)));
      return counts.reduce((sum, count) => sum + count, 0);
    }),
  );
  return own + nested.reduce((sum, count) => sum + count, 0);
}

async function measureApp(appId: string, budget: { calls: number; isPartial: boolean }) {
  const collections = await getFirestore().doc(`apps/${appId}`).listCollections();
  const counts = await Promise.all(collections.map((collection) => countTree(collection, 1, budget)));
  const documents = counts.reduce((sum, count) => sum + count, 0);
  return documents;
}

/** Per-app stored data. Cached for an hour, since listing files and counting documents is itself billed. */
export async function getFootprints(now: number): Promise<Footprints> {
  if (cached && now - cached.measuredAt < CACHE_MS) return cached;

  const budget = { calls: 0, isPartial: false };
  const apps = await Promise.all(
    APP_IDS.map(async (appId) => {
      const [documents, storage] = await Promise.all([
        measureApp(appId, budget),
        sumStoragePrefixes(STORAGE_PREFIXES[appId] ?? []),
      ]);
      if (storage.isPartial) budget.isPartial = true;
      return { appId, documents, storageBytes: storage.bytes };
    }),
  );
  const shared = await sumStoragePrefixes(SHARED_STORAGE_PREFIXES);
  if (shared.isPartial) budget.isPartial = true;

  const result = { apps, sharedStorageBytes: shared.bytes, isPartial: budget.isPartial, measuredAt: now };
  cached = result;
  return result;
}

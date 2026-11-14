import { APP_REGISTRY_ID_MAP, getRegistryAppForPath } from './app.registry';

export type AppSort = 'recent' | 'name' | 'newest';

export const APP_SORT_KEY = 'home:app-sort';
export const DEFAULT_APP_SORT: AppSort = 'recent';
export const APP_SORT_OPTIONS = [
  { value: 'recent', label: 'Recently opened', emoji: '🕘' },
  { value: 'name', label: 'A to Z', emoji: '🔤' },
  { value: 'newest', label: 'Newest apps first', emoji: '✨' },
] as const satisfies readonly {
  value: AppSort;
  label: string;
  emoji: string;
}[];

const OPENED_PREFIX = 'app-opened:';

export const parseAppSort = (stored: unknown): AppSort | null =>
  APP_SORT_OPTIONS.some((option) => option.value === stored)
    ? (stored as AppSort)
    : null;

/** When each app was last opened in this browser, per account; empty when signed out or storage is unavailable. */
export function readAppOpenTimes(uid: string | null): Record<string, number> {
  if (uid === null) return {};
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(`${OPENED_PREFIX}${uid}`) ?? '{}',
    );
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number',
      ),
    );
  } catch {
    return {};
  }
}

export function stampAppOpened(uid: string, pathname: string) {
  const app = getRegistryAppForPath(pathname);
  if (!app) return;
  try {
    localStorage.setItem(
      `${OPENED_PREFIX}${uid}`,
      JSON.stringify({ ...readAppOpenTimes(uid), [app.id]: Date.now() }),
    );
  } catch {
    // Without storage the list keeps its other orders.
  }
}

const getAddedAt = (id: string) =>
  Date.parse(APP_REGISTRY_ID_MAP[id]?.createdAt ?? '') || 0;

function getCompare(sort: AppSort, openedAt: Record<string, number>) {
  const byNewest = (left: { id: string }, right: { id: string }) =>
    getAddedAt(right.id) - getAddedAt(left.id);
  if (sort === 'name') {
    return (left: { name: string }, right: { name: string }) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  }
  if (sort === 'newest') return byNewest;
  return (left: { id: string }, right: { id: string }) =>
    (openedAt[right.id] ?? 0) - (openedAt[left.id] ?? 0) ||
    byNewest(left, right);
}

/** Starred apps stay first; each group follows the chosen sort, with never-opened apps after the opened ones, newest first. */
export function sortApps<T extends { id: string; name: string }>(
  apps: T[],
  starredIds: string[],
  sort: AppSort,
  openedAt: Record<string, number>,
) {
  const compare = getCompare(sort, openedAt);
  const starred = apps
    .filter((app) => starredIds.includes(app.id))
    .sort(compare);
  const rest = apps.filter((app) => !starredIds.includes(app.id)).sort(compare);
  return [...starred, ...rest];
}

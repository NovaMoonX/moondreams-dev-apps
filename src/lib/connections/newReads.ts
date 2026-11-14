import type {
  CategoryManifest,
  ConnectorManifest,
  GrantCategory,
} from '@/lib/connections/contract';
import { isStillNew } from '@/utils/newnessUtils';

type NewRead = CategoryManifest['reads'][number];

/** The version of a category the person has seen: a category missing from the grant was never shown, an unrecorded one reads as 1. */
const seenVersionOf = (category: GrantCategory | undefined) =>
  category === undefined ? 0 : (category.seenScopeVersion ?? 1);

/** Each category's reads that shipped recently and that the person hasn't seen, keyed by category; empty when nothing is new. */
export function readUnseenNews(
  manifest: ConnectorManifest | null,
  categories: Record<string, GrantCategory>,
  now: number,
): Record<string, NewRead[]> {
  return Object.fromEntries(
    (manifest?.categories ?? []).flatMap((category) => {
      const seen = seenVersionOf(categories[category.id]);
      const reads = category.reads.filter(
        (read) => read.sinceVersion > seen && isStillNew(read.addedOn, now),
      );
      return reads.length > 0 ? [[category.id, reads]] : [];
    }),
  );
}

/** The `seenScopes` that mark every category with something new as seen. */
export const toSeenScopes = (
  manifest: ConnectorManifest | null,
  news: Record<string, NewRead[]>,
) =>
  Object.fromEntries(
    (manifest?.categories ?? [])
      .filter((category) => category.id in news)
      .map((category) => [category.id, category.scopeVersion]),
  );

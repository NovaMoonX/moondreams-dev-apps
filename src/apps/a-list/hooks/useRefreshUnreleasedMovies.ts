import { useEffect } from 'react';
import { useStore } from 'react-redux';

import { queryClient } from '@/lib/query/queryClient';
import { useAppDispatch, type RootState } from '@/store';
import {
  fromDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { REFRESH_BATCH_SIZE } from '@apps/a-list/constants';
import { movieDetailsQueryOptions } from '@apps/a-list/queries/movieQueries';
import { refreshWatchlistMovie } from '@apps/a-list/store/actions/watchlistActions';
import { selectWatchlistRows } from '@apps/a-list/store/selectors';
import type { MovieSnapshot } from '@apps/a-list/types';

const DAY_MS = 86_400_000;
const SNAPSHOT_FIELDS: (keyof MovieSnapshot)[] = [
  'title',
  'releaseDate',
  'posterUrl',
  'runtimeMinutes',
  'contentRating',
];
const refreshedThisSession = new Set<string>();

/** A window of the sorted keys that moves along each day and wraps, so no movie is starved. */
function pickDailyRotation(
  movieKeys: string[],
  now: number,
  size: number,
): string[] {
  const sorted = [...movieKeys].sort();
  if (sorted.length <= size) return sorted;

  const offset = (Math.floor(now / DAY_MS) * size) % sorted.length;
  const result = Array.from(
    { length: size },
    (_, index) => sorted[(offset + index) % sorted.length],
  );
  return result;
}

function isSnapshotChanged(stored: MovieSnapshot, fresh: MovieSnapshot) {
  const result = SNAPSHOT_FIELDS.some(
    (field) => (stored[field] ?? null) !== (fresh[field] ?? null),
  );
  return result;
}

/** Re-checks unreleased watchlist movies once a session, since studios move release dates. */
export function useRefreshUnreleasedMovies(
  uid: string | null,
  isReady: boolean,
) {
  const store = useStore<RootState>();
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!uid || !isReady || refreshedThisSession.has(uid)) {
      return;
    }
    refreshedThisSession.add(uid);

    const now = Date.now();
    const todayDay = fromDateInputValue(toLocalDateInputValue(now)) ?? 0;
    const rows = selectWatchlistRows(store.getState(), now);
    const eligible = rows.filter(
      ({ item, isSeen }) =>
        !isSeen &&
        item.movieKey.startsWith('imdb-') &&
        (item.movie.releaseDate === null || item.movie.releaseDate >= todayDay),
    );
    const picked = pickDailyRotation(
      eligible.map(({ item }) => item.movieKey),
      now,
      REFRESH_BATCH_SIZE,
    );

    const refresh = async () => {
      // One at a time, so a spent lookup budget costs one failed call per movie, not a burst.
      await picked.reduce(async (previous, movieKey) => {
        await previous;
        try {
          const fresh = await queryClient.fetchQuery(
            movieDetailsQueryOptions(movieKey),
          );
          const stored = eligible.find(({ item }) => item.movieKey === movieKey)
            ?.item.movie;
          if (stored && isSnapshotChanged(stored, fresh)) {
            await dispatch(
              refreshWatchlistMovie({ uid, movieKey, movie: fresh }),
            ).unwrap();
          }
        } catch {
          // A failed check just leaves the stored snapshot for a later session.
        }
      }, Promise.resolve());
    };

    void refresh();
  }, [uid, isReady, store, dispatch]);
}

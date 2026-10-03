import { createAsyncThunk } from '@reduxjs/toolkit';
import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type {
  AmcFormat,
  MovieSnapshot,
  WatchlistItem,
  WatchPriority,
} from '@apps/a-list/types';
import { getErrorMessage } from '@/utils/errorUtils';

interface AddWatchlistItemInput {
  uid: string;
  movieKey: string;
  movie: MovieSnapshot;
  priority: WatchPriority;
  preferredFormat: AmcFormat | null;
}

/** Resolves `created: false` when the movie was already on the list; its priority is left alone. */
export const addWatchlistItem = createAsyncThunk<
  { created: boolean },
  AddWatchlistItemInput,
  { rejectValue: string }
>(
  'aList/watchlist/add',
  async (
    { uid, movieKey, movie, priority, preferredFormat },
    { rejectWithValue },
  ) => {
    const itemRef = doc(
      db,
      'apps',
      'a-list',
      'memberships',
      uid,
      'watchlist',
      movieKey,
    );

    try {
      const created = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(itemRef);
        if (snapshot.exists()) {
          return false;
        }

        const now = Date.now();
        const item: WatchlistItem = {
          movieKey,
          movie: {
            title: movie.title,
            releaseDate: movie.releaseDate ?? null,
            posterUrl: movie.posterUrl ?? null,
            runtimeMinutes: movie.runtimeMinutes ?? null,
            contentRating: movie.contentRating ?? null,
          },
          priority,
          preferredFormat: preferredFormat ?? null,
          createdAt: now,
          lastEditedAt: now,
        };
        transaction.set(itemRef, item);
        return true;
      });

      return { created };
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to add this movie to your watchlist.'),
      );
    }
  },
);

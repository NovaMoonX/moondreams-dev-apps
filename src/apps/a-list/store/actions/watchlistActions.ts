import { createAsyncThunk } from '@reduxjs/toolkit';
import { deleteDoc, doc, runTransaction, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type {
  AmcFormat,
  MovieSnapshot,
  WatchlistItem,
  WatchPriority,
} from '@apps/a-list/types';
import { getErrorMessage } from '@/utils/errorUtils';

function getItemRef(uid: string, movieKey: string) {
  const itemRef = doc(
    db,
    'apps',
    'a-list',
    'memberships',
    uid,
    'watchlist',
    movieKey,
  );
  return itemRef;
}

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
    const itemRef = getItemRef(uid, movieKey);

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

interface UpdateWatchlistItemInput {
  uid: string;
  movieKey: string;
  priority: WatchPriority;
  preferredFormat: AmcFormat | null;
}

export const updateWatchlistItem = createAsyncThunk<
  void,
  UpdateWatchlistItemInput,
  { rejectValue: string }
>(
  'aList/watchlist/update',
  async ({ uid, movieKey, priority, preferredFormat }, { rejectWithValue }) => {
    try {
      await updateDoc(getItemRef(uid, movieKey), {
        priority,
        preferredFormat,
        lastEditedAt: Date.now(),
      });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save this movie.'),
      );
    }
  },
);

/** Takes the movie off the list only; its viewings stay on the calendar. */
export const removeWatchlistItem = createAsyncThunk<
  void,
  { uid: string; movieKey: string },
  { rejectValue: string }
>('aList/watchlist/remove', async ({ uid, movieKey }, { rejectWithValue }) => {
  try {
    await deleteDoc(getItemRef(uid, movieKey));
  } catch (error) {
    return rejectWithValue(
      getErrorMessage(error, 'Unable to remove this movie.'),
    );
  }
});

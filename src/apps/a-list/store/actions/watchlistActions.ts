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
import { MAX_ARCHIVE_REASON_LENGTH } from '@apps/a-list/constants';

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

/** Resolves `created: false` when the movie was already on the list; its priority is left alone. An archived movie comes back instead. */
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
          if (snapshot.get('archivedAt') == null) {
            return false;
          }
          // Adding a movie that was archived brings it back as it was.
          transaction.update(itemRef, {
            archivedAt: null,
            archiveReason: null,
            lastEditedAt: Date.now(),
          });
          return true;
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
          archivedAt: null,
          archiveReason: null,
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

/** Writes a fresher provider snapshot onto the watchlist item; viewings keep their own copy. */
export const refreshWatchlistMovie = createAsyncThunk<
  void,
  { uid: string; movieKey: string; movie: MovieSnapshot },
  { rejectValue: string }
>(
  'aList/watchlist/refreshMovie',
  async ({ uid, movieKey, movie }, { rejectWithValue }) => {
    try {
      await updateDoc(getItemRef(uid, movieKey), {
        movie: {
          title: movie.title,
          releaseDate: movie.releaseDate ?? null,
          posterUrl: movie.posterUrl ?? null,
          runtimeMinutes: movie.runtimeMinutes ?? null,
          contentRating: movie.contentRating ?? null,
        },
        lastEditedAt: Date.now(),
      });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to refresh this movie.'),
      );
    }
  },
);

/** Moves a movie off the active list with the reason it left; its viewings stay on the calendar. */
export const archiveWatchlistItem = createAsyncThunk<
  void,
  { uid: string; movieKey: string; reason: string },
  { rejectValue: string }
>(
  'aList/watchlist/archive',
  async ({ uid, movieKey, reason }, { rejectWithValue }) => {
    const now = Date.now();
    try {
      await updateDoc(getItemRef(uid, movieKey), {
        archivedAt: now,
        archiveReason: reason.trim().slice(0, MAX_ARCHIVE_REASON_LENGTH),
        lastEditedAt: now,
      });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to archive this movie.'),
      );
    }
  },
);

export const restoreWatchlistItem = createAsyncThunk<
  void,
  { uid: string; movieKey: string },
  { rejectValue: string }
>('aList/watchlist/restore', async ({ uid, movieKey }, { rejectWithValue }) => {
  try {
    await updateDoc(getItemRef(uid, movieKey), {
      archivedAt: null,
      archiveReason: null,
      lastEditedAt: Date.now(),
    });
  } catch (error) {
    return rejectWithValue(
      getErrorMessage(error, 'Unable to restore this movie.'),
    );
  }
});

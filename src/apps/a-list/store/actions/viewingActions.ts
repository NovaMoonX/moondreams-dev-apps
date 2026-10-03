import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, doc, runTransaction } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getErrorMessage } from '@/utils/errorUtils';
import { DEFAULT_WATCH_PRIORITY } from '@apps/a-list/constants';
import type { MovieSnapshot, Viewing, WatchlistItem } from '@apps/a-list/types';
import {
  computeEndsAt,
  getInitialStatus,
} from '@apps/a-list/utils/viewingState';

interface AddViewingInput {
  uid: string;
  movieKey: string;
  movie: MovieSnapshot;
  showtimeAt: number;
}

function toSnapshot(movie: MovieSnapshot): MovieSnapshot {
  return {
    title: movie.title,
    releaseDate: movie.releaseDate ?? null,
    posterUrl: movie.posterUrl ?? null,
    runtimeMinutes: movie.runtimeMinutes ?? null,
    contentRating: movie.contentRating ?? null,
  };
}

/** Saves the viewing and, in the same transaction, puts the movie on the watchlist if it isn't there yet. */
export const addViewing = createAsyncThunk<
  Viewing,
  AddViewingInput,
  { rejectValue: string }
>(
  'aList/viewings/add',
  async ({ uid, movieKey, movie, showtimeAt }, { rejectWithValue }) => {
    const membershipPath = ['apps', 'a-list', 'memberships', uid] as const;
    const itemRef = doc(db, ...membershipPath, 'watchlist', movieKey);
    const viewingRef = doc(collection(db, ...membershipPath, 'viewings'));
    const snapshot = toSnapshot(movie);

    try {
      const viewing = await runTransaction(db, async (transaction) => {
        const itemSnapshot = await transaction.get(itemRef);
        const now = Date.now();

        if (!itemSnapshot.exists()) {
          const item: WatchlistItem = {
            movieKey,
            movie: snapshot,
            priority: DEFAULT_WATCH_PRIORITY,
            preferredFormat: null,
            createdAt: now,
            lastEditedAt: now,
          };
          transaction.set(itemRef, item);
        }

        const endsAt = computeEndsAt(showtimeAt, snapshot.runtimeMinutes);
        const nextViewing: Viewing = {
          id: viewingRef.id,
          movieKey,
          movie: snapshot,
          showtimeAt,
          endsAt,
          status: getInitialStatus(endsAt, now),
          createdAt: now,
          lastEditedAt: now,
        };
        transaction.set(viewingRef, nextViewing);
        return nextViewing;
      });

      return viewing;
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to add this movie to your calendar.'),
      );
    }
  },
);

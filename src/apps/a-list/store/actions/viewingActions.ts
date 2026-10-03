import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  collection,
  deleteDoc,
  doc,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getErrorMessage } from '@/utils/errorUtils';
import { DEFAULT_WATCH_PRIORITY } from '@apps/a-list/constants';
import type {
  MovieSnapshot,
  Ticket,
  Viewing,
  WatchlistItem,
} from '@apps/a-list/types';
import {
  computeEndsAt,
  getInitialStatus,
} from '@apps/a-list/utils/viewingState';

interface AddViewingInput {
  uid: string;
  movieKey: string;
  movie: MovieSnapshot;
  showtimeAt: number;
  ticket: Ticket | null;
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
  async ({ uid, movieKey, movie, showtimeAt, ticket }, { rejectWithValue }) => {
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
          ticket: ticket ?? null,
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

interface UpdateViewingShowtimeInput {
  uid: string;
  id: string;
  showtimeAt: number;
  runtimeMinutes: number | null;
  /** True for a document written before tickets existed: the edit adds the key. */
  isMissingTicket: boolean;
}

/** Moves a showing: the showtime and its derived end are always written together. */
export const updateViewingShowtime = createAsyncThunk<
  void,
  UpdateViewingShowtimeInput,
  { rejectValue: string }
>(
  'aList/viewings/updateShowtime',
  async (
    { uid, id, showtimeAt, runtimeMinutes, isMissingTicket },
    { rejectWithValue },
  ) => {
    try {
      await updateDoc(
        doc(db, 'apps', 'a-list', 'memberships', uid, 'viewings', id),
        {
          showtimeAt,
          endsAt: computeEndsAt(showtimeAt, runtimeMinutes),
          lastEditedAt: Date.now(),
          ...(isMissingTicket ? { ticket: null } : {}),
        },
      );
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save this showing.'),
      );
    }
  },
);

interface RemoveViewingInput {
  uid: string;
  id: string;
}

/** Removes only the viewing; the movie stays on the watchlist. */
export const removeViewing = createAsyncThunk<
  void,
  RemoveViewingInput,
  { rejectValue: string }
>('aList/viewings/remove', async ({ uid, id }, { rejectWithValue }) => {
  try {
    await deleteDoc(
      doc(db, 'apps', 'a-list', 'memberships', uid, 'viewings', id),
    );
  } catch (error) {
    return rejectWithValue(
      getErrorMessage(error, 'Unable to remove this showing.'),
    );
  }
});

interface RecordTicketInput {
  uid: string;
  id: string;
  /** null clears the ticket. */
  ticket: Ticket | null;
}

/** The ticket form owns the whole ticket object, so it's written in one field-scoped update. */
export const recordTicket = createAsyncThunk<
  void,
  RecordTicketInput,
  { rejectValue: string }
>(
  'aList/viewings/recordTicket',
  async ({ uid, id, ticket }, { rejectWithValue }) => {
    try {
      await updateDoc(
        doc(db, 'apps', 'a-list', 'memberships', uid, 'viewings', id),
        {
          ticket,
          lastEditedAt: Date.now(),
        },
      );
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save this ticket.'),
      );
    }
  },
);

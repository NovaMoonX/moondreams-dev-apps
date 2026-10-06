import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, runTransaction } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getErrorMessage } from '@/utils/errorUtils';
import { DEFAULT_WATCH_PRIORITY } from '@apps/a-list/constants';
import type {
  MovieSnapshot,
  Ticket,
  TheatreSnapshot,
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
  theatre: TheatreSnapshot | null;
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
  async (
    { uid, movieKey, movie, showtimeAt, ticket, theatre },
    { rejectWithValue },
  ) => {
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
          theatre: theatre ?? null,
          rating: null,
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

/** Keys added after the first viewings were written, with the empty value a legacy document gets. */
const LATER_KEYS = { ticket: null, rating: null, theatre: null } as const;

/**
 * A field-scoped edit in a transaction: any later-added key the freshly read document still lacks
 * is backfilled with its empty value in the same write, and nothing the edit doesn't own is touched.
 */
async function editViewing(uid: string, id: string, fields: Partial<Viewing>) {
  const viewingRef = doc(
    db,
    'apps',
    'a-list',
    'memberships',
    uid,
    'viewings',
    id,
  );

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(viewingRef);
    if (!snapshot.exists()) {
      throw new Error('This showing was removed.');
    }

    const stored = snapshot.data();
    const backfill = Object.fromEntries(
      Object.entries(LATER_KEYS).filter(([key]) => !(key in stored)),
    );
    transaction.update(viewingRef, {
      ...backfill,
      ...fields,
      lastEditedAt: Date.now(),
    });
  });
}

interface UpdateViewingInput {
  uid: string;
  id: string;
  showtimeAt: number;
  runtimeMinutes: number | null;
  /** Only for a seen viewing; a planned one has no rating. */
  rating?: number | null;
  /** Omit to leave the theater alone; null clears it. */
  theatre?: TheatreSnapshot | null;
}

/** Moves a showing (the showtime and its derived end are written together) and edits its theater and, once seen, its stars. */
export const updateViewing = createAsyncThunk<
  void,
  UpdateViewingInput,
  { rejectValue: string }
>(
  'aList/viewings/update',
  async (
    { uid, id, showtimeAt, runtimeMinutes, rating, theatre },
    { rejectWithValue },
  ) => {
    try {
      await editViewing(uid, id, {
        showtimeAt,
        endsAt: computeEndsAt(showtimeAt, runtimeMinutes),
        ...(rating === undefined ? {} : { rating }),
        ...(theatre === undefined ? {} : { theatre }),
      });
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

/** The ticket form owns the whole ticket object, so it's written as one field. */
export const recordTicket = createAsyncThunk<
  void,
  RecordTicketInput,
  { rejectValue: string }
>(
  'aList/viewings/recordTicket',
  async ({ uid, id, ticket }, { rejectWithValue }) => {
    try {
      await editViewing(uid, id, { ticket });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save this ticket.'),
      );
    }
  },
);

interface MarkViewingSeenInput {
  uid: string;
  id: string;
  rating: number | null;
}

export const markViewingSeen = createAsyncThunk<
  void,
  MarkViewingSeenInput,
  { rejectValue: string }
>(
  'aList/viewings/markSeen',
  async ({ uid, id, rating }, { rejectWithValue }) => {
    try {
      await editViewing(uid, id, { status: 'SEEN', rating });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to mark this movie seen.'),
      );
    }
  },
);

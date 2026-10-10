import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  collection,
  doc,
  runTransaction,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getErrorMessage } from '@/utils/errorUtils';
import { DEFAULT_WATCH_PRIORITY } from '@apps/a-list/constants';
import type {
  MovieSnapshot,
  PurchasePlan,
  Ticket,
  TheatreSnapshot,
  Viewing,
  WatchlistItem,
} from '@apps/a-list/types';
import {
  cancelTrailerReminder,
  isTrailerReminderAhead,
  newTrailerReminderId,
  scheduleTrailerReminder,
} from '@apps/a-list/utils/reminders';
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
  purchase: PurchasePlan | null;
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
    { uid, movieKey, movie, showtimeAt, ticket, theatre, purchase },
    { rejectWithValue },
  ) => {
    const membershipPath = ['apps', 'a-list', 'memberships', uid] as const;
    const itemRef = doc(db, ...membershipPath, 'watchlist', movieKey);
    const viewingRef = doc(collection(db, ...membershipPath, 'viewings'));
    const snapshot = toSnapshot(movie);
    const trailerReminderId = newTrailerReminderId(showtimeAt);

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
          purchase: purchase ?? null,
          rating: null,
          trailerReminderId,
          createdAt: now,
          lastEditedAt: now,
        };
        transaction.set(viewingRef, nextViewing);
        return nextViewing;
      });

      if (trailerReminderId) {
        void scheduleTrailerReminder({
          uid,
          reminderId: trailerReminderId,
          viewingId: viewing.id,
          movieTitle: movie.title,
          showtimeAt,
        });
      }

      return viewing;
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to add this movie to your calendar.'),
      );
    }
  },
);

/** Keys added after the first viewings were written, with the empty value a legacy document gets. */
const LATER_KEYS = {
  ticket: null,
  rating: null,
  theatre: null,
  trailerReminderId: null,
  purchase: null,
} as const;

/**
 * A field-scoped edit in a transaction: any later-added key the freshly read document still lacks
 * is backfilled with its empty value in the same write, and nothing the edit doesn't own is touched.
 * `fields` may be a function of the freshly read document.
 */
async function editViewing(
  uid: string,
  id: string,
  fields: Partial<Viewing> | ((stored: DocumentData) => Partial<Viewing>),
) {
  const viewingRef = doc(
    db,
    'apps',
    'a-list',
    'memberships',
    uid,
    'viewings',
    id,
  );

  const previous = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(viewingRef);
    if (!snapshot.exists()) {
      throw new Error('This showing was removed.');
    }

    const stored = snapshot.data();
    // Recording a ticket answers the "did you buy?" question for good.
    const edit = typeof fields === 'function' ? fields(stored) : fields;
    const resolvesPurchase = edit.ticket != null && stored.purchase != null;
    const backfill = Object.fromEntries(
      Object.entries(LATER_KEYS).filter(([key]) => !(key in stored)),
    );
    transaction.update(viewingRef, {
      ...backfill,
      ...edit,
      ...(resolvesPurchase ? { 'purchase.startedAt': null } : {}),
      lastEditedAt: Date.now(),
    });
    return stored;
  });

  return previous;
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
  /** Omit to leave the purchase plan alone; null clears it. */
  purchase?: PurchasePlan | null;
}

/** Moves a showing (the showtime and its derived end are written together) and edits its theater and, once seen, its stars. */
export const updateViewing = createAsyncThunk<
  void,
  UpdateViewingInput,
  { rejectValue: string }
>(
  'aList/viewings/update',
  async (
    { uid, id, showtimeAt, runtimeMinutes, rating, theatre, purchase },
    { rejectWithValue },
  ) => {
    const newReminderId = newTrailerReminderId(showtimeAt);

    try {
      const previous = await editViewing(uid, id, (stored) => ({
        showtimeAt,
        endsAt: computeEndsAt(showtimeAt, runtimeMinutes),
        // Only a moved showing gets a new push; any other edit leaves the pending one alone.
        ...(stored.showtimeAt === showtimeAt
          ? {}
          : { trailerReminderId: newReminderId }),
        ...(rating === undefined ? {} : { rating }),
        ...(theatre === undefined ? {} : { theatre }),
        ...(purchase === undefined ? {} : { purchase }),
      }));

      if (previous.showtimeAt !== showtimeAt) {
        if (isTrailerReminderAhead(previous.showtimeAt)) {
          void cancelTrailerReminder(previous.trailerReminderId);
        }
        if (newReminderId) {
          void scheduleTrailerReminder({
            uid,
            reminderId: newReminderId,
            viewingId: id,
            movieTitle: previous.movie.title,
            showtimeAt,
          });
        }
      }
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
  const viewingRef = doc(
    db,
    'apps',
    'a-list',
    'memberships',
    uid,
    'viewings',
    id,
  );

  try {
    const stored = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(viewingRef);
      transaction.delete(viewingRef);
      return snapshot.data();
    });

    if (stored && isTrailerReminderAhead(stored.showtimeAt)) {
      void cancelTrailerReminder(stored.trailerReminderId);
    }
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

interface SetPurchaseStartedInput {
  uid: string;
  id: string;
  /** The instant the member left for AMC; null stops asking about it. */
  startedAt: number | null;
}

/** Writes only the `startedAt` key of the plan, so a plan changed on another device isn't overwritten. */
export const setPurchaseStarted = createAsyncThunk<
  void,
  SetPurchaseStartedInput,
  { rejectValue: string }
>(
  'aList/viewings/setPurchaseStarted',
  async ({ uid, id, startedAt }, { rejectWithValue }) => {
    try {
      await updateDoc(
        doc(db, 'apps', 'a-list', 'memberships', uid, 'viewings', id),
        { 'purchase.startedAt': startedAt, lastEditedAt: Date.now() },
      );
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save your purchase.'),
      );
    }
  },
);

import { createAsyncThunk } from '@reduxjs/toolkit';
import { doc, runTransaction, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getErrorMessage } from '@/utils/errorUtils';
import type { AListTheatre, TheatreSearchResult } from '@apps/a-list/types';

/** The fields a saved theater keeps; `distanceMiles` belongs to one search only. */
export function toTheatre(
  result: TheatreSearchResult,
  now: number,
): AListTheatre {
  return {
    theatreId: result.theatreId,
    name: result.name,
    addressLine: result.addressLine ?? null,
    city: result.city ?? null,
    state: result.state ?? null,
    postalCode: result.postalCode ?? null,
    latitude: result.latitude ?? null,
    longitude: result.longitude ?? null,
    createdAt: now,
    lastEditedAt: now,
  };
}

const getMembershipRef = (uid: string) =>
  doc(db, 'apps', 'a-list', 'memberships', uid);

const getTheatreRef = (uid: string, theatreId: string) =>
  doc(db, 'apps', 'a-list', 'memberships', uid, 'theatres', theatreId);

interface AddTheatreInput {
  uid: string;
  theatre: TheatreSearchResult;
}

/** Saves the theater and, in the same transaction, makes it the favorite if there isn't one yet. */
export const addTheatre = createAsyncThunk<
  void,
  AddTheatreInput,
  { rejectValue: string }
>('aList/theatres/add', async ({ uid, theatre }, { rejectWithValue }) => {
  const membershipRef = getMembershipRef(uid);
  const theatreRef = getTheatreRef(uid, theatre.theatreId);

  try {
    await runTransaction(db, async (transaction) => {
      const [membershipSnapshot, theatreSnapshot] = await Promise.all([
        transaction.get(membershipRef),
        transaction.get(theatreRef),
      ]);
      if (theatreSnapshot.exists()) {
        return;
      }

      transaction.set(theatreRef, toTheatre(theatre, Date.now()));
      if (membershipSnapshot.get('favoriteTheatreId') == null) {
        transaction.update(membershipRef, {
          favoriteTheatreId: theatre.theatreId,
          lastEditedAt: Date.now(),
        });
      }
    });
  } catch (error) {
    return rejectWithValue(
      getErrorMessage(error, 'Unable to save this theater.'),
    );
  }
});

interface RemoveTheatreInput {
  uid: string;
  theatreId: string;
}

/** Removes the theater and, if it was the favorite, clears that too. Showings keep the name they were saved with. */
export const removeTheatre = createAsyncThunk<
  void,
  RemoveTheatreInput,
  { rejectValue: string }
>('aList/theatres/remove', async ({ uid, theatreId }, { rejectWithValue }) => {
  const membershipRef = getMembershipRef(uid);

  try {
    await runTransaction(db, async (transaction) => {
      const membershipSnapshot = await transaction.get(membershipRef);
      transaction.delete(getTheatreRef(uid, theatreId));
      if (membershipSnapshot.get('favoriteTheatreId') === theatreId) {
        transaction.update(membershipRef, {
          favoriteTheatreId: null,
          lastEditedAt: Date.now(),
        });
      }
    });
  } catch (error) {
    return rejectWithValue(
      getErrorMessage(error, 'Unable to remove this theater.'),
    );
  }
});

interface SetFavoriteTheatreInput {
  uid: string;
  /** null clears the favorite. */
  theatreId: string | null;
}

export const setFavoriteTheatre = createAsyncThunk<
  void,
  SetFavoriteTheatreInput,
  { rejectValue: string }
>(
  'aList/theatres/setFavorite',
  async ({ uid, theatreId }, { rejectWithValue }) => {
    try {
      await updateDoc(getMembershipRef(uid), {
        favoriteTheatreId: theatreId,
        lastEditedAt: Date.now(),
      });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to change your favorite theater.'),
      );
    }
  },
);

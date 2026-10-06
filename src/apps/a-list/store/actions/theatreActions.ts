import { createAsyncThunk } from '@reduxjs/toolkit';
import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { getErrorMessage } from '@/utils/errorUtils';
import type { AListTheatre, TheatreDraft } from '@apps/a-list/types';

export function toTheatre(draft: TheatreDraft, now: number): AListTheatre {
  return {
    theatreId: draft.theatreId,
    name: draft.name,
    addressLine: draft.addressLine ?? null,
    city: draft.city ?? null,
    state: draft.state ?? null,
    postalCode: draft.postalCode ?? null,
    latitude: draft.latitude ?? null,
    longitude: draft.longitude ?? null,
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
  theatre: TheatreDraft;
  /** True when no theater is saved yet: only then does the new one become the favorite. */
  isFirst: boolean;
}

/** Saves the theater and, when it is the member's first, makes it the favorite in the same transaction. */
export const addTheatre = createAsyncThunk<
  void,
  AddTheatreInput,
  { rejectValue: string }
>(
  'aList/theatres/add',
  async ({ uid, theatre, isFirst }, { rejectWithValue }) => {
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
        if (isFirst && membershipSnapshot.get('favoriteTheatreId') == null) {
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
  },
);

interface RemoveTheatreInput {
  uid: string;
  theatreId: string;
  /** Another saved theater to take over if this one is the favorite; null when it was the last. */
  nextFavoriteId: string | null;
}

/** Removes the theater and, if it was the favorite, hands the star to `nextFavoriteId` (or clears it when none is left). */
export const removeTheatre = createAsyncThunk<
  void,
  RemoveTheatreInput,
  { rejectValue: string }
>(
  'aList/theatres/remove',
  async ({ uid, theatreId, nextFavoriteId }, { rejectWithValue }) => {
    const membershipRef = getMembershipRef(uid);

    try {
      await runTransaction(db, async (transaction) => {
        const membershipSnapshot = await transaction.get(membershipRef);
        const nextSnapshot = nextFavoriteId
          ? await transaction.get(getTheatreRef(uid, nextFavoriteId))
          : null;
        transaction.delete(getTheatreRef(uid, theatreId));
        if (membershipSnapshot.get('favoriteTheatreId') === theatreId) {
          transaction.update(membershipRef, {
            favoriteTheatreId: nextSnapshot?.exists() ? nextFavoriteId : null,
            lastEditedAt: Date.now(),
          });
        }
      });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to remove this theater.'),
      );
    }
  },
);

interface SetFavoriteTheatreInput {
  uid: string;
  /** null clears the favorite. */
  theatreId: string | null;
}

/** Points the favorite at a theater that still exists, so a stale device can't leave it dangling. */
export const setFavoriteTheatre = createAsyncThunk<
  void,
  SetFavoriteTheatreInput,
  { rejectValue: string }
>(
  'aList/theatres/setFavorite',
  async ({ uid, theatreId }, { rejectWithValue }) => {
    try {
      await runTransaction(db, async (transaction) => {
        if (theatreId !== null) {
          const theatreSnapshot = await transaction.get(
            getTheatreRef(uid, theatreId),
          );
          if (!theatreSnapshot.exists()) {
            throw new Error('That theater was removed.');
          }
        }

        transaction.update(getMembershipRef(uid), {
          favoriteTheatreId: theatreId,
          lastEditedAt: Date.now(),
        });
      });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to change your favorite theater.'),
      );
    }
  },
);

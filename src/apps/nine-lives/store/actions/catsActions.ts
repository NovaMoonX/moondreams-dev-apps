import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { Cat } from '@apps/nine-lives/types';

import { removeCat, revertCat, upsertCat } from '../slices/catsSlice';
import { nextOccurrenceOnOrAfter } from '../../utils/catAnniversaries';
import { cancelEntityReminders, scheduleEntityReminders } from '../../utils/reminders';

const getCatDocRef = (householdId: string, catId: string) =>
  doc(db, 'apps', 'nine-lives', 'households', householdId, 'cats', catId);

async function scheduleCatReminders(
  state: RootState,
  householdId: string,
  uid: string,
  cat: Pick<Cat, 'id' | 'name' | 'dateOfBirth' | 'adoptedAt'>,
): Promise<string[]> {
  const now = Date.now();
  const relatedEntityPath = `apps/nine-lives/households/${householdId}/cats/${cat.id}`;

  return scheduleEntityReminders(state, householdId, uid, [
    {
      title: 'Birthday today!',
      body: `It's ${cat.name}'s birthday today. 🎂`,
      scheduledFor: nextOccurrenceOnOrAfter(cat.dateOfBirth, now),
      relatedEntityPath,
      recurrence: 'yearly',
    },
    ...(cat.adoptedAt
      ? [
          {
            title: 'Adoption anniversary today!',
            body: `Today marks ${cat.name}'s adoption anniversary. 🏡`,
            scheduledFor: nextOccurrenceOnOrAfter(cat.adoptedAt, now),
            relatedEntityPath,
            recurrence: 'yearly' as const,
          },
        ]
      : []),
  ]);
}

export const createCat = createAsyncThunk<
  Cat,
  {
    householdId: string;
    uid: string;
    cat: Partial<Cat> & Pick<Cat, 'name' | 'dateOfBirth' | 'breed' | 'isDateOfBirthEstimated'>;
  },
  { rejectValue: string }
>(
  'nineLives/cats/create',
  async ({ householdId, uid, cat }, { dispatch, getState, rejectWithValue }) => {
    const trimmedName = cat.name.trim();

    if (!trimmedName) {
      return rejectWithValue('Cat name is required.');
    }

    const now = Date.now();
    const catId =
      cat.id ??
      doc(collection(db, 'apps', 'nine-lives', 'households', householdId, 'cats')).id;

    const nextCat: Cat = {
      photoURL: cat.photoURL ?? null,
      originalName: cat.originalName ?? null,
      sex: cat.sex ?? 'unknown',
      coatColors: cat.coatColors ?? null,
      lifestyle: cat.lifestyle ?? null,
      microchipNumber: cat.microchipNumber ?? null,
      microchipServiceURL: cat.microchipServiceURL ?? null,
      rabiesTagNumber: cat.rabiesTagNumber ?? null,
      isSpayedNeutered: cat.isSpayedNeutered ?? false,
      spayedNeuteredAt: cat.spayedNeuteredAt ?? null,
      shelterOrigin: cat.shelterOrigin ?? null,
      adoptedAt: cat.adoptedAt ?? null,
      adoptionProfileURL: cat.adoptionProfileURL ?? null,
      otherLinks: cat.otherLinks ?? null,
      customKeyDates: cat.customKeyDates ?? null,
      diet: cat.diet ?? null,
      currentClinicId: cat.currentClinicId ?? null,
      insurance: cat.insurance ?? null,
      personalityTraits: cat.personalityTraits ?? null,
      notes: cat.notes ?? null,
      breed: cat.breed,
      dateOfBirth: cat.dateOfBirth,
      isDateOfBirthEstimated: cat.isDateOfBirthEstimated,
      reminderIds: [],
      id: catId,
      householdId,
      name: trimmedName,
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    nextCat.reminderIds = await scheduleCatReminders(
      getState() as RootState,
      householdId,
      uid,
      nextCat,
    );

    await setDoc(getCatDocRef(householdId, catId), nextCat);
    dispatch(upsertCat(nextCat));

    return nextCat;
  },
);

export const updateCat = createAsyncThunk<
  Cat,
  {
    householdId: string;
    catId: string;
    reminderUid?: string;
    changes: Partial<Cat>;
  },
  { rejectValue: string }
>(
  'nineLives/cats/update',
  async ({ householdId, catId, reminderUid, changes }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.cats.items.find((cat) => cat.id === catId);

    if (!current) {
      return rejectWithValue('Cat not found.');
    }

    const optimisticCat: Cat = {
      ...current,
      ...changes,
      id: catId,
      householdId,
      lastEditedAt: Date.now(),
    };

    const datesChanged =
      optimisticCat.dateOfBirth !== current.dateOfBirth ||
      optimisticCat.adoptedAt !== current.adoptedAt;

    if (datesChanged) {
      await cancelEntityReminders(current.reminderIds);
      optimisticCat.reminderIds = reminderUid
        ? await scheduleCatReminders(state, householdId, reminderUid, optimisticCat)
        : [];
    }

    dispatch(upsertCat(optimisticCat));

    try {
      await updateDoc(getCatDocRef(householdId, catId), {
        ...changes,
        ...(datesChanged ? { reminderIds: optimisticCat.reminderIds } : {}),
      });
      return optimisticCat;
    } catch (error) {
      dispatch(revertCat({ id: catId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update cat.',
      );
    }
  },
);

export const deleteCat = createAsyncThunk<
  { id: string },
  { householdId: string; catId: string },
  { rejectValue: string }
>(
  'nineLives/cats/delete',
  async ({ householdId, catId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.cats.items.find((cat) => cat.id === catId);

    if (!current) {
      return rejectWithValue('Cat not found.');
    }

    dispatch(removeCat({ id: catId }));

    try {
      await deleteDoc(getCatDocRef(householdId, catId));
      await cancelEntityReminders(current.reminderIds);
      return { id: catId };
    } catch (error) {
      dispatch(revertCat({ id: catId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete cat.',
      );
    }
  },
);

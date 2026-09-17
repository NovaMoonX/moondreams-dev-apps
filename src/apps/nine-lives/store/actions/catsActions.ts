import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { Cat } from '@apps/nine-lives/types';

import { removeCat, revertCat, upsertCat } from '../slices/catsSlice';

const getCatDocRef = (householdId: string, catId: string) =>
  doc(db, 'apps', 'nine-lives', 'households', householdId, 'cats', catId);

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
  async ({ householdId, uid, cat }, { dispatch, rejectWithValue }) => {
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
      id: catId,
      householdId,
      name: trimmedName,
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    await setDoc(getCatDocRef(householdId, catId), nextCat);
    dispatch(upsertCat(nextCat));

    return nextCat;
  },
);

export const updateCat = createAsyncThunk<
  Cat,
  { householdId: string; catId: string; changes: Partial<Cat> },
  { rejectValue: string }
>(
  'nineLives/cats/update',
  async ({ householdId, catId, changes }, { dispatch, getState, rejectWithValue }) => {
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

    dispatch(upsertCat(optimisticCat));

    try {
      await updateDoc(getCatDocRef(householdId, catId), changes);
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
      return { id: catId };
    } catch (error) {
      dispatch(revertCat({ id: catId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete cat.',
      );
    }
  },
);

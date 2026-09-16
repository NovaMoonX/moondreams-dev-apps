import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { Symptom } from '@apps/nine-lives/types';

import {
  removeSymptom,
  revertSymptom,
  upsertSymptom,
} from '../slices/symptomsSlice';

function normalizeSymptomInput(value: Partial<Symptom>): Partial<Symptom> {
  const next = { ...value };

  if (next.description === undefined) {
    next.description = '';
  }

  if (next.quickTags === undefined) {
    next.quickTags = [];
  }

  if (next.linkedVisitIds === undefined) {
    next.linkedVisitIds = [];
  }

  if (next.severity === undefined) {
    next.severity = null;
  }

  if (next.linkedConditionId === undefined) {
    next.linkedConditionId = null;
  }

  if (next.resolvedAt === undefined) {
    next.resolvedAt = null;
  }

  return next;
}

const getSymptomDocRef = (householdId: string, symptomId: string) =>
  doc(db, 'apps', 'nine-lives', 'households', householdId, 'symptoms', symptomId);

export const createSymptom = createAsyncThunk<
  Symptom,
  {
    householdId: string;
    catId: string;
    uid: string;
    symptom: Partial<Symptom> & Pick<Symptom, 'firstNoticedAt'>;
  },
  { rejectValue: string }
>(
  'nineLives/symptoms/create',
  async ({ householdId, catId, uid, symptom }, { dispatch }) => {
    const description = (symptom.description ?? '').trim();
    const quickTags = symptom.quickTags ?? [];
    const linkedVisitIds = symptom.linkedVisitIds ?? [];
    const now = Date.now();
    const symptomId =
      symptom.id ??
      doc(collection(db, 'apps', 'nine-lives', 'households', householdId, 'symptoms')).id;

    const nextSymptom: Symptom = {
      id: symptomId,
      catId,
      description,
      quickTags,
      firstNoticedAt: symptom.firstNoticedAt,
      severity: symptom.severity ?? null,
      linkedVisitIds,
      linkedConditionId: symptom.linkedConditionId ?? null,
      resolvedAt: symptom.resolvedAt ?? null,
      createdBy: uid,
      createdAt: now,
      lastEditedAt: now,
    };

    await setDoc(getSymptomDocRef(householdId, symptomId), nextSymptom);
    dispatch(upsertSymptom(nextSymptom));

    return nextSymptom;
  },
);

export const updateSymptom = createAsyncThunk<
  Symptom,
  {
    householdId: string;
    symptomId: string;
    changes: Partial<Symptom>;
  },
  { rejectValue: string }
>(
  'nineLives/symptoms/update',
  async ({ householdId, symptomId, changes }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.symptoms.items.find((item) => item.id === symptomId);

    if (!current) {
      return rejectWithValue('Symptom not found.');
    }

    const sanitizedChanges = normalizeSymptomInput(changes);
    const nextSymptom: Symptom = {
      ...current,
      ...sanitizedChanges,
      id: symptomId,
      description: sanitizedChanges.description?.trim() ?? current.description,
      quickTags: sanitizedChanges.quickTags ?? current.quickTags,
      linkedVisitIds: sanitizedChanges.linkedVisitIds ?? current.linkedVisitIds,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertSymptom(nextSymptom));

    try {
      await updateDoc(getSymptomDocRef(householdId, symptomId), {
        ...sanitizedChanges,
        lastEditedAt: nextSymptom.lastEditedAt,
      });
      return nextSymptom;
    } catch (error) {
      dispatch(revertSymptom({ id: symptomId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update symptom.',
      );
    }
  },
);

export const deleteSymptom = createAsyncThunk<
  { id: string },
  { householdId: string; symptomId: string },
  { rejectValue: string }
>(
  'nineLives/symptoms/delete',
  async ({ householdId, symptomId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.symptoms.items.find((item) => item.id === symptomId);

    if (!current) {
      return rejectWithValue('Symptom not found.');
    }

    dispatch(removeSymptom({ id: symptomId }));

    try {
      await deleteDoc(getSymptomDocRef(householdId, symptomId));
      return { id: symptomId };
    } catch (error) {
      dispatch(revertSymptom({ id: symptomId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete symptom.',
      );
    }
  },
);

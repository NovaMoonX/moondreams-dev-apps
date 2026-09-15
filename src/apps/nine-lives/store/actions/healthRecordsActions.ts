import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import type { RootState } from '@/store';
import type { HealthRecord, HealthRecordType } from '@apps/nine-lives/types';

import {
  removeHealthRecord,
  revertHealthRecord,
  upsertHealthRecord,
} from '../slices/healthRecordsSlice';

const MAX_HEALTH_RECORD_BYTES = 10 * 1024 * 1024;

export const getHealthRecordStoragePath = (householdId: string, recordId: string) =>
  `nine-lives/households/${householdId}/health-records/${recordId}`;

const getHealthRecordsCollectionRef = (householdId: string) =>
  collection(db, 'apps', 'nine-lives', 'households', householdId, 'healthRecords');

const getHealthRecordDocRef = (householdId: string, recordId: string) =>
  doc(getHealthRecordsCollectionRef(householdId), recordId);

export function getHealthRecordFileType(file: File): HealthRecord['fileType'] | null {
  if (file.type === 'application/pdf') {
    return 'pdf';
  }

  if (file.type.startsWith('image/')) {
    return 'image';
  }

  return null;
}

function validateHealthRecordFile(file: File) {
  if (!getHealthRecordFileType(file)) {
    return 'Please choose a PDF or image file.';
  }

  if (file.size > MAX_HEALTH_RECORD_BYTES) {
    return 'Health record files must be under 10MB.';
  }

  return null;
}

function normalizeCatIds(catIds: string[]): string[] {
  return Array.from(new Set(catIds));
}

function normalizeHealthRecordChanges(
  changes: Partial<HealthRecord>,
): Partial<HealthRecord> {
  const normalized: Partial<HealthRecord> = {
    ...changes,
    customRecordTypeId: changes.customRecordTypeId ?? null,
    recordDate: changes.recordDate ?? null,
    linkedVisitId: changes.linkedVisitId ?? null,
    notes: changes.notes ?? null,
  };

  if (changes.catIds) {
    normalized.catIds = normalizeCatIds(changes.catIds);
  }

  return normalized;
}

export const createHealthRecord = createAsyncThunk<
  HealthRecord,
  {
    householdId: string;
    catIds: string[];
    uid: string;
    file: File;
    recordType: HealthRecordType;
    customRecordTypeId?: string | null;
    recordDate?: number | null;
    linkedVisitId?: string | null;
    notes?: string | null;
  },
  { rejectValue: string }
>(
  'nineLives/healthRecords/create',
  async (
    {
      householdId,
      catIds,
      uid,
      file,
      recordType,
      customRecordTypeId,
      recordDate,
      linkedVisitId,
      notes,
    },
    { dispatch, rejectWithValue },
  ) => {
    const fileError = validateHealthRecordFile(file);

    if (fileError) {
      return rejectWithValue(fileError);
    }

    const normalizedCatIds = normalizeCatIds(catIds);

    if (normalizedCatIds.length === 0) {
      return rejectWithValue('Select at least one cat.');
    }

    if (recordType === 'custom' && !customRecordTypeId) {
      return rejectWithValue('Select a custom record type.');
    }

    const recordId = doc(getHealthRecordsCollectionRef(householdId)).id;
    const storagePath = getHealthRecordStoragePath(householdId, recordId);
    const now = Date.now();

    try {
      const fileURL = await uploadFile(storagePath, file);
      const nextRecord: HealthRecord = {
        id: recordId,
        householdId,
        catIds: normalizedCatIds,
        fileURL,
        fileType: getHealthRecordFileType(file) as HealthRecord['fileType'],
        fileName: file.name,
        recordType,
        customRecordTypeId: recordType === 'custom' ? customRecordTypeId ?? null : null,
        recordDate: recordDate ?? null,
        linkedVisitId: linkedVisitId ?? null,
        notes: notes?.trim() || null,
        uploadedBy: uid,
        createdAt: now,
        lastEditedAt: now,
      };

      await setDoc(getHealthRecordDocRef(householdId, recordId), nextRecord);
      dispatch(upsertHealthRecord(nextRecord));

      return nextRecord;
    } catch (error) {
      try {
        await deleteFile(storagePath);
      } catch {
        // Keep the original upload error; the object can be cleaned up separately.
      }
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to upload health record.',
      );
    }
  },
);

export const updateHealthRecord = createAsyncThunk<
  HealthRecord,
  {
    householdId: string;
    recordId: string;
    changes: Partial<HealthRecord>;
  },
  { rejectValue: string }
>(
  'nineLives/healthRecords/update',
  async ({ householdId, recordId, changes }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.healthRecords.items.find(
      (record) => record.id === recordId,
    );

    if (!current) {
      return rejectWithValue('Health record not found.');
    }

    const normalized = normalizeHealthRecordChanges(changes);
    const recordType = normalized.recordType ?? current.recordType;
    const customRecordTypeId =
      recordType === 'custom'
        ? normalized.customRecordTypeId ?? current.customRecordTypeId
        : null;
    const catIds =
      normalized.catIds && normalized.catIds.length > 0 ? normalized.catIds : current.catIds;

    if (recordType === 'custom' && !customRecordTypeId) {
      return rejectWithValue('Select a custom record type.');
    }

    const nextRecord: HealthRecord = {
      ...current,
      ...normalized,
      id: recordId,
      householdId,
      catIds,
      recordType,
      customRecordTypeId,
      lastEditedAt: Date.now(),
    };

    dispatch(upsertHealthRecord(nextRecord));

    try {
      await updateDoc(getHealthRecordDocRef(householdId, recordId), {
        ...normalized,
        catIds,
        recordType,
        customRecordTypeId,
        lastEditedAt: nextRecord.lastEditedAt,
      });
      return nextRecord;
    } catch (error) {
      dispatch(revertHealthRecord({ id: recordId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update health record.',
      );
    }
  },
);

export const deleteHealthRecord = createAsyncThunk<
  { id: string },
  { householdId: string; recordId: string },
  { rejectValue: string }
>(
  'nineLives/healthRecords/delete',
  async ({ householdId, recordId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.healthRecords.items.find(
      (record) => record.id === recordId,
    );

    if (!current) {
      return rejectWithValue('Health record not found.');
    }

    dispatch(removeHealthRecord({ id: recordId }));

    try {
      await Promise.all([
        deleteDoc(getHealthRecordDocRef(householdId, recordId)),
        deleteFile(getHealthRecordStoragePath(householdId, recordId)),
      ]);
      return { id: recordId };
    } catch (error) {
      dispatch(revertHealthRecord({ id: recordId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete health record.',
      );
    }
  },
);

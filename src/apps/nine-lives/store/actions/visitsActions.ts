import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type {
  CatCondition,
  Symptom,
  Vaccination,
  VaccinationDose,
  Visit,
  WeightEntry,
} from '@apps/nine-lives/types';

import { removeVisit, revertVisit, upsertVisit } from '../slices/visitsSlice';
import { scheduleVaccinationReminders } from './vaccinationsActions';
import { upsertCatCondition } from '../slices/catConditionsSlice';
import { upsertSymptom } from '../slices/symptomsSlice';
import { upsertVaccination } from '../slices/vaccinationsSlice';
import { upsertWeightEntry } from '../slices/weightEntriesSlice';
import { cancelEntityReminders, ONE_DAY_MS, scheduleEntityReminders } from '../../utils/reminders';

const getVisitsCollectionRef = (householdId: string) =>
  collection(db, 'apps', 'nine-lives', 'households', householdId, 'visits');

const getVisitDocRef = (householdId: string, visitId: string) =>
  doc(getVisitsCollectionRef(householdId), visitId);

const getCatConditionDocRef = (
  householdId: string,
  catId: string,
  conditionId: string,
) =>
  doc(
    db,
    'apps',
    'nine-lives',
    'households',
    householdId,
    'cats',
    catId,
    'conditions',
    conditionId,
  );

const getSymptomDocRef = (
  householdId: string,
  catId: string,
  symptomId: string,
) =>
  doc(
    db,
    'apps',
    'nine-lives',
    'households',
    householdId,
    'cats',
    catId,
    'symptoms',
    symptomId,
  );

const getVaccinationDocRef = (householdId: string, vaccinationId: string) =>
  doc(db, 'apps', 'nine-lives', 'households', householdId, 'vaccinations', vaccinationId);

const getWeightEntryDocRef = (
  householdId: string,
  catId: string,
  weightEntryId: string,
) =>
  doc(
    db,
    'apps',
    'nine-lives',
    'households',
    householdId,
    'cats',
    catId,
    'weightEntries',
    weightEntryId,
  );

async function scheduleVisitReminders(
  state: RootState,
  householdId: string,
  uid: string,
  visit: Pick<Visit, 'id' | 'title' | 'scheduledAt'>,
): Promise<string[]> {
  return scheduleEntityReminders(state, householdId, uid, [
    {
      title: 'Upcoming vet visit',
      body: visit.title ? `${visit.title} is coming up.` : 'A vet visit is coming up.',
      scheduledFor: visit.scheduledAt - ONE_DAY_MS,
      relatedEntityPath: `apps/nine-lives/households/${householdId}/visits/${visit.id}`,
    },
  ]);
}

export interface VisitOutcome {
  summary?: string | null;
  vaccinations?: Array<
    Partial<VaccinationDose> &
      Pick<VaccinationDose, 'administeredAt'> &
      Pick<Vaccination, 'catId' | 'name'>
  >;
  conditions?: Array<
    Partial<CatCondition> &
      Pick<
        CatCondition,
        'catId' | 'name' | 'category' | 'status' | 'occurredAt'
      >
  >;
  weightEntries?: Array<
    Partial<WeightEntry> &
      Pick<WeightEntry, 'catId' | 'weight' | 'unit' | 'measuredAt'>
  >;
  symptoms?: Array<
    Partial<Symptom> & Pick<Symptom, 'catId' | 'firstNoticedAt'>
  >;
}

function normalizeVisitChanges(changes: Partial<Visit>): Partial<Visit> {
  return {
    ...changes,
    ...(changes.catIds ? { catIds: [...new Set(changes.catIds)] } : {}),
  };
}

function normalizeVisitCreateInput(changes: Partial<Visit>): Partial<Visit> {
  return {
    ...normalizeVisitChanges(changes),
    clinicId: changes.clinicId ?? null,
    doctorId: changes.doctorId ?? null,
    customReasonLabel: changes.customReasonLabel ?? null,
    followUpOfVisitId: changes.followUpOfVisitId ?? null,
    followUpNote: changes.followUpNote ?? null,
    title: changes.title ?? null,
    completedAt: changes.completedAt ?? null,
    summary: changes.summary ?? null,
    linkedSymptomIds: changes.linkedSymptomIds ?? [],
    linkedConditionIds: changes.linkedConditionIds ?? [],
    linkedHealthRecordIds: changes.linkedHealthRecordIds ?? [],
    linkedVaccinationIds: changes.linkedVaccinationIds ?? [],
    linkedWeightEntryIds: changes.linkedWeightEntryIds ?? [],
  };
}

function validateVisit(
  visit: Pick<
    Visit,
    'catIds' | 'reason' | 'followUpOfVisitId' | 'customReasonLabel'
  >,
) {
  if (visit.catIds.length === 0) {
    return 'Select at least one cat.';
  }

  if (visit.reason === 'follow_up' && !visit.followUpOfVisitId) {
    return 'Select the original visit for this follow-up.';
  }

  if (visit.reason === 'custom' && !visit.customReasonLabel?.trim()) {
    return 'Enter a reason for this visit.';
  }

  return null;
}

export const createVisit = createAsyncThunk<
  Visit,
  {
    householdId: string;
    uid: string;
    visit: Partial<Visit> & Pick<Visit, 'catIds' | 'reason' | 'scheduledAt'>;
  },
  { rejectValue: string }
>(
  'nineLives/visits/create',
  async (
    { householdId, uid, visit },
    { dispatch, getState, rejectWithValue },
  ) => {
    const normalized = normalizeVisitCreateInput(visit);
    const validationError = validateVisit({
      catIds: normalized.catIds ?? [],
      reason: normalized.reason ?? 'checkup',
      followUpOfVisitId: normalized.followUpOfVisitId ?? null,
      customReasonLabel: normalized.customReasonLabel ?? null,
    });

    if (validationError) {
      return rejectWithValue(validationError);
    }
    if (
      normalized.followUpOfVisitId &&
      !(getState() as RootState).nineLives.visits.items.some(
        (existingVisit) => existingVisit.id === normalized.followUpOfVisitId,
      )
    ) {
      return rejectWithValue('Original visit not found.');
    }

    const visitId = visit.id ?? doc(getVisitsCollectionRef(householdId)).id;
    const now = Date.now();
    const nextVisit: Visit = {
      id: visitId,
      householdId,
      catIds: normalized.catIds ?? [],
      clinicId: normalized.clinicId ?? null,
      doctorId: normalized.doctorId ?? null,
      status: normalized.status ?? 'upcoming',
      reason: normalized.reason ?? 'checkup',
      customReasonLabel: normalized.customReasonLabel ?? null,
      followUpOfVisitId: normalized.followUpOfVisitId ?? null,
      followUpNote: normalized.followUpNote ?? null,
      title: normalized.title ?? null,
      scheduledAt: visit.scheduledAt,
      completedAt: normalized.completedAt ?? null,
      summary: normalized.summary ?? null,
      linkedSymptomIds: normalized.linkedSymptomIds ?? [],
      linkedConditionIds: normalized.linkedConditionIds ?? [],
      linkedHealthRecordIds: normalized.linkedHealthRecordIds ?? [],
      linkedVaccinationIds: normalized.linkedVaccinationIds ?? [],
      linkedWeightEntryIds: normalized.linkedWeightEntryIds ?? [],
      reminderIds: [],
      createdBy: uid,
      createdAt: visit.createdAt ?? now,
      lastEditedAt: now,
    };

    nextVisit.reminderIds = await scheduleVisitReminders(
      getState() as RootState,
      householdId,
      uid,
      nextVisit,
    );

    await setDoc(getVisitDocRef(householdId, visitId), nextVisit);
    dispatch(upsertVisit(nextVisit));

    return nextVisit;
  },
);

export const updateVisit = createAsyncThunk<
  Visit,
  {
    householdId: string;
    visitId: string;
    reminderUid?: string;
    changes: Partial<Visit>;
  },
  { rejectValue: string }
>(
  'nineLives/visits/update',
  async (
    { householdId, visitId, reminderUid, changes },
    { dispatch, getState, rejectWithValue },
  ) => {
    const state = getState() as RootState;
    const current = state.nineLives.visits.items.find(
      (visit) => visit.id === visitId,
    );

    if (!current) {
      return rejectWithValue('Visit not found.');
    }

    const normalized = normalizeVisitChanges(changes);
    const nextVisit: Visit = {
      ...current,
      ...normalized,
      id: visitId,
      householdId,
      lastEditedAt: Date.now(),
    };
    const validationError = validateVisit(nextVisit);

    if (validationError) {
      return rejectWithValue(validationError);
    }
    if (nextVisit.followUpOfVisitId === visitId) {
      return rejectWithValue('A visit cannot follow itself.');
    }
    if (
      nextVisit.followUpOfVisitId &&
      !state.nineLives.visits.items.some(
        (existingVisit) => existingVisit.id === nextVisit.followUpOfVisitId,
      )
    ) {
      return rejectWithValue('Original visit not found.');
    }

    const isRescheduled = nextVisit.scheduledAt !== current.scheduledAt;
    const isNowCancelled = nextVisit.status === 'cancelled' && current.status !== 'cancelled';

    if (isRescheduled || isNowCancelled) {
      await cancelEntityReminders(current.reminderIds);
      nextVisit.reminderIds = [];
    }

    if (isRescheduled && !isNowCancelled && reminderUid) {
      nextVisit.reminderIds = await scheduleVisitReminders(state, householdId, reminderUid, nextVisit);
    }

    dispatch(upsertVisit(nextVisit));

    try {
      await updateDoc(getVisitDocRef(householdId, visitId), {
        ...normalized,
        reminderIds: nextVisit.reminderIds,
        lastEditedAt: nextVisit.lastEditedAt,
      });
      return nextVisit;
    } catch (error) {
      dispatch(revertVisit({ id: visitId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update visit.',
      );
    }
  },
);

export const completeVisit = createAsyncThunk<
  Visit,
  {
    householdId: string;
    uid: string;
    visitId: string;
    outcome?: VisitOutcome;
  },
  { rejectValue: string }
>(
  'nineLives/visits/complete',
  async (
    { householdId, uid, visitId, outcome = {} },
    { dispatch, getState, rejectWithValue },
  ) => {
    const state = getState() as RootState;
    const current = state.nineLives.visits.items.find(
      (visit) => visit.id === visitId,
    );

    if (!current) {
      return rejectWithValue('Visit not found.');
    }

    const now = Date.now();
    const linkedVaccinationIds = [...current.linkedVaccinationIds];
    const linkedWeightEntryIds = [...current.linkedWeightEntryIds];
    const linkedConditionIds = [...current.linkedConditionIds];
    const linkedSymptomIds = [...current.linkedSymptomIds];
    const createdVaccinations: Vaccination[] = [];
    const createdWeightEntries: WeightEntry[] = [];
    const changedConditions: CatCondition[] = [];
    const changedSymptoms: Symptom[] = [];
    const batch = writeBatch(db);

    for (const input of outcome.vaccinations ?? []) {
      const vaccinationsCollectionRef = collection(
        db,
        'apps',
        'nine-lives',
        'households',
        householdId,
        'vaccinations',
      );
      const id = input.id ?? doc(vaccinationsCollectionRef).id;
      const dose: VaccinationDose = {
        id: doc(vaccinationsCollectionRef).id,
        administeredAt: input.administeredAt,
        expiresAt: input.expiresAt ?? null,
        clinicId: input.clinicId ?? current.clinicId,
        doctorId: input.doctorId ?? current.doctorId,
        lotNumber: input.lotNumber ?? null,
        linkedVisitId: visitId,
        createdBy: uid,
        createdAt: input.createdAt ?? now,
      };
      const vaccination: Vaccination = {
        id,
        householdId,
        catId: input.catId,
        name: input.name.trim(),
        history: [dose],
        firstAdministeredAt: dose.administeredAt,
        lastAdministeredAt: dose.administeredAt,
        expiresAt: dose.expiresAt,
        reminderIds: [],
        createdBy: uid,
        createdAt: input.createdAt ?? now,
        lastEditedAt: now,
      };
      vaccination.reminderIds = await scheduleVaccinationReminders(
        state,
        householdId,
        uid,
        vaccination,
      );
      batch.set(getVaccinationDocRef(householdId, id), vaccination);
      linkedVaccinationIds.push(id);
      createdVaccinations.push(vaccination);
    }

    for (const input of outcome.weightEntries ?? []) {
      const id =
        input.id ??
        doc(
          collection(
            db,
            'apps',
            'nine-lives',
            'households',
            householdId,
            'cats',
            input.catId,
            'weightEntries',
          ),
        ).id;
      const weightEntry: WeightEntry = {
        id,
        catId: input.catId,
        weight: input.weight,
        unit: input.unit,
        measuredAt: input.measuredAt,
        linkedVisitId: visitId,
        createdBy: uid,
        createdAt: input.createdAt ?? now,
      };
      batch.set(
        getWeightEntryDocRef(householdId, input.catId, id),
        weightEntry,
      );
      linkedWeightEntryIds.push(id);
      createdWeightEntries.push(weightEntry);
    }

    for (const input of outcome.conditions ?? []) {
      const existing = input.id
        ? state.nineLives.catConditions.items.find(
            (condition) =>
              condition.id === input.id && condition.catId === input.catId,
          )
        : undefined;
      const id =
        input.id ??
        doc(
          collection(
            db,
            'apps',
            'nine-lives',
            'households',
            householdId,
            'cats',
            input.catId,
            'conditions',
          ),
        ).id;
      const linkedVisitIds = [
        ...new Set([
          ...(existing?.linkedVisitIds ?? input.linkedVisitIds ?? []),
          visitId,
        ]),
      ];
      const condition: CatCondition = {
        id,
        catId: input.catId,
        source: input.source ?? existing?.source ?? 'custom',
        libraryConditionId:
          input.libraryConditionId ?? existing?.libraryConditionId ?? null,
        name: input.name.trim(),
        category: input.category,
        status: input.status,
        occurredAt: input.occurredAt,
        resolvedAt: input.resolvedAt ?? existing?.resolvedAt ?? null,
        description: input.description ?? existing?.description ?? null,
        linkedVisitIds,
        createdBy: input.createdBy ?? existing?.createdBy ?? uid,
        createdAt: input.createdAt ?? existing?.createdAt ?? now,
        lastEditedAt: now,
      };
      batch.set(getCatConditionDocRef(householdId, input.catId, id), condition);
      linkedConditionIds.push(id);
      changedConditions.push(condition);
    }

    for (const input of outcome.symptoms ?? []) {
      const existing = input.id
        ? state.nineLives.symptoms.items.find(
            (symptom) =>
              symptom.id === input.id && symptom.catId === input.catId,
          )
        : undefined;
      const id =
        input.id ??
        doc(
          collection(
            db,
            'apps',
            'nine-lives',
            'households',
            householdId,
            'cats',
            input.catId,
            'symptoms',
          ),
        ).id;
      const linkedVisitIds = [
        ...new Set([
          ...(existing?.linkedVisitIds ?? input.linkedVisitIds ?? []),
          visitId,
        ]),
      ];
      const symptom: Symptom = {
        id,
        catId: input.catId,
        description: input.description?.trim() ?? existing?.description ?? '',
        quickTags: input.quickTags ?? existing?.quickTags ?? [],
        firstNoticedAt: input.firstNoticedAt,
        severity: input.severity ?? existing?.severity ?? null,
        linkedVisitIds,
        linkedConditionId:
          input.linkedConditionId ?? existing?.linkedConditionId ?? null,
        resolvedAt: input.resolvedAt ?? existing?.resolvedAt ?? null,
        createdBy: input.createdBy ?? existing?.createdBy ?? uid,
        createdAt: input.createdAt ?? existing?.createdAt ?? now,
        lastEditedAt: now,
      };
      batch.set(getSymptomDocRef(householdId, input.catId, id), symptom);
      linkedSymptomIds.push(id);
      changedSymptoms.push(symptom);
    }

    const nextVisit: Visit = {
      ...current,
      status: 'completed',
      completedAt: now,
      summary:
        outcome.summary === undefined ? current.summary : outcome.summary,
      linkedVaccinationIds: [...new Set(linkedVaccinationIds)],
      linkedWeightEntryIds: [...new Set(linkedWeightEntryIds)],
      linkedConditionIds: [...new Set(linkedConditionIds)],
      linkedSymptomIds: [...new Set(linkedSymptomIds)],
      reminderIds: [],
      lastEditedAt: now,
    };
    batch.update(getVisitDocRef(householdId, visitId), {
      status: nextVisit.status,
      completedAt: nextVisit.completedAt,
      summary: nextVisit.summary,
      linkedVaccinationIds: nextVisit.linkedVaccinationIds,
      linkedWeightEntryIds: nextVisit.linkedWeightEntryIds,
      linkedConditionIds: nextVisit.linkedConditionIds,
      linkedSymptomIds: nextVisit.linkedSymptomIds,
      reminderIds: nextVisit.reminderIds,
      lastEditedAt: nextVisit.lastEditedAt,
    });

    try {
      await batch.commit();
      await cancelEntityReminders(current.reminderIds);
      dispatch(upsertVisit(nextVisit));
      createdVaccinations.forEach((vaccination) =>
        dispatch(upsertVaccination(vaccination)),
      );
      createdWeightEntries.forEach((entry) =>
        dispatch(upsertWeightEntry(entry)),
      );
      changedConditions.forEach((condition) =>
        dispatch(upsertCatCondition(condition)),
      );
      changedSymptoms.forEach((symptom) => dispatch(upsertSymptom(symptom)));
      return nextVisit;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to complete visit.',
      );
    }
  },
);

export const cancelVisit = createAsyncThunk<
  Visit,
  { householdId: string; visitId: string },
  { rejectValue: string }
>('nineLives/visits/cancel', async ({ householdId, visitId }, { dispatch }) =>
  dispatch(
    updateVisit({
      householdId,
      visitId,
      changes: { status: 'cancelled', completedAt: null },
    }),
  ).unwrap(),
);

export const reopenVisit = createAsyncThunk<
  Visit,
  { householdId: string; visitId: string },
  { rejectValue: string }
>('nineLives/visits/reopen', async ({ householdId, visitId }, { dispatch }) =>
  dispatch(
    updateVisit({
      householdId,
      visitId,
      changes: { status: 'upcoming' },
    }),
  ).unwrap(),
);

export const deleteVisit = createAsyncThunk<
  { id: string },
  { householdId: string; visitId: string },
  { rejectValue: string }
>(
  'nineLives/visits/delete',
  async ({ householdId, visitId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.visits.items.find(
      (visit) => visit.id === visitId,
    );

    if (!current) {
      return rejectWithValue('Visit not found.');
    }

    const followUps = state.nineLives.visits.items.filter(
      (visit) => visit.followUpOfVisitId === visitId,
    );
    const batch = writeBatch(db);
    batch.delete(getVisitDocRef(householdId, visitId));
    const updatedFollowUps: Visit[] = [];

    for (const followUp of followUps) {
      const nextFollowUp: Visit = {
        ...followUp,
        reason: 'custom',
        customReasonLabel: 'Follow-up visit',
        followUpOfVisitId: null,
        followUpNote: null,
        lastEditedAt: Date.now(),
      };
      batch.update(getVisitDocRef(householdId, followUp.id), {
        reason: nextFollowUp.reason,
        customReasonLabel: nextFollowUp.customReasonLabel,
        followUpOfVisitId: null,
        followUpNote: null,
        lastEditedAt: nextFollowUp.lastEditedAt,
      });
      updatedFollowUps.push(nextFollowUp);
    }

    dispatch(removeVisit({ id: visitId }));

    try {
      await batch.commit();
      await cancelEntityReminders(current.reminderIds);
      updatedFollowUps.forEach((visit) => dispatch(upsertVisit(visit)));
      return { id: visitId };
    } catch (error) {
      dispatch(revertVisit({ id: visitId }));
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to delete visit.',
      );
    }
  },
);

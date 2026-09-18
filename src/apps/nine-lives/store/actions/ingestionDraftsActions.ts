import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  collection,
  deleteDoc,
  doc,
  setDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import type { RootState } from '@/store';

import type {
  Cat,
  CatCondition,
  Expense,
  ExpenseLineItem,
  HealthRecord,
  IngestionDraft,
  IngestionExpenseProposal,
  IngestionPreventiveProposal,
  IngestionSymptomProposal,
  IngestionVaccinationProposal,
  IngestionWeightProposal,
  Preventive,
  PreventiveDose,
  Symptom,
  Vaccination,
  VaccinationDose,
  VetClinic,
  Visit,
  WeightEntry,
} from '../../types';
import { extractProposalFromFile } from '../../lib/extractProposalFromFile';
import {
  removeIngestionDraft,
  upsertIngestionDraft,
} from '../slices/ingestionDraftsSlice';
import { upsertCat } from '../slices/catsSlice';
import { upsertCatCondition } from '../slices/catConditionsSlice';
import { upsertExpense } from '../slices/expensesSlice';
import { upsertHealthRecord } from '../slices/healthRecordsSlice';
import { upsertPreventive } from '../slices/preventivesSlice';
import { upsertSymptom } from '../slices/symptomsSlice';
import { upsertVaccination } from '../slices/vaccinationsSlice';
import { upsertVetClinic } from '../slices/vetClinicsSlice';
import { upsertVisit } from '../slices/visitsSlice';
import { upsertWeightEntry } from '../slices/weightEntriesSlice';

const getDraftCollectionRef = (householdId: string) =>
  collection(db, 'apps', 'nine-lives', 'households', householdId, 'ingestionDrafts');

const getDraftDocRef = (householdId: string, draftId: string) =>
  doc(getDraftCollectionRef(householdId), draftId);

const getCollectionRef = (householdId: string, name: string) =>
  collection(db, 'apps', 'nine-lives', 'households', householdId, name);

const getDocRef = (householdId: string, name: string, id: string) =>
  doc(getCollectionRef(householdId, name), id);

const getCatDetailDocRef = (
  householdId: string,
  catId: string,
  collectionName: 'conditions' | 'symptoms',
  id: string,
) => doc(getCollectionRef(householdId, collectionName), id);

export interface IngestionDraftUpdate {
  proposedCat?: IngestionDraft['proposedCat'];
  proposedClinic?: IngestionDraft['proposedClinic'];
  proposedVisit?: IngestionDraft['proposedVisit'];
  proposedVaccinations?: IngestionDraft['proposedVaccinations'];
  proposedPreventives?: IngestionDraft['proposedPreventives'];
  proposedWeightEntry?: IngestionDraft['proposedWeightEntry'];
  proposedSymptoms?: IngestionDraft['proposedSymptoms'];
  proposedConditions?: IngestionDraft['proposedConditions'];
  proposedExpense?: IngestionDraft['proposedExpense'];
  suggestKeepAsRecord?: boolean;
}

export interface IngestionDraftSelections {
  includeCat?: boolean;
  catId?: string | null;
  includeClinic?: boolean;
  clinicId?: string | null;
  includeVisit?: boolean;
  includeVaccinations?: boolean[];
  includePreventives?: boolean[];
  includeWeightEntry?: boolean;
  includeSymptoms?: boolean[];
  includeConditions?: boolean[];
  includeExpense?: boolean;
  saveAsRecord?: boolean;
}

export interface ConfirmIngestionDraftInput {
  householdId: string;
  draftId: string;
  uid: string;
  selections?: IngestionDraftSelections;
  file?: File | null;
}

function draftDefaults(draft: IngestionDraft): IngestionDraft {
  return {
    ...draft,
    proposedCat: draft.proposedCat ?? null,
    proposedClinic: draft.proposedClinic ?? null,
    proposedVisit: draft.proposedVisit ?? null,
    proposedVaccinations: draft.proposedVaccinations ?? [],
    proposedPreventives: draft.proposedPreventives ?? [],
    proposedWeightEntry: draft.proposedWeightEntry ?? null,
    proposedSymptoms: draft.proposedSymptoms ?? [],
    proposedConditions: draft.proposedConditions ?? [],
    proposedExpense: draft.proposedExpense ?? null,
    suggestKeepAsRecord: draft.suggestKeepAsRecord ?? true,
    confidence: draft.confidence ?? null,
  };
}

export const createDraftFromExtraction = createAsyncThunk<
  IngestionDraft,
  { householdId: string; uid: string; file: File },
  { rejectValue: string }
>(
  'nineLives/ingestionDrafts/createFromExtraction',
  async ({ householdId, uid, file }, { dispatch, rejectWithValue }) => {
    try {
      const proposal = await extractProposalFromFile(file);
      const draftId = doc(getDraftCollectionRef(householdId)).id;
      const draft: IngestionDraft = {
        id: draftId,
        householdId,
        sourceType: file.type === 'application/pdf' ? 'pdf' : 'photo',
        sourceFileName: file.name,
        ...proposal,
        createdBy: uid,
        createdAt: Date.now(),
      };

      await setDoc(getDraftDocRef(householdId, draftId), draft);
      dispatch(upsertIngestionDraft(draft));
      return draft;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to read this document.',
      );
    }
  },
);

export const updateIngestionDraft = createAsyncThunk<
  IngestionDraft,
  { householdId: string; draftId: string; changes: IngestionDraftUpdate },
  { rejectValue: string }
>(
  'nineLives/ingestionDrafts/update',
  async ({ householdId, draftId, changes }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.ingestionDrafts.items.find((draft) => draft.id === draftId);

    if (!current) {
      return rejectWithValue('Ingestion draft not found.');
    }

    const nextDraft = draftDefaults({ ...current, ...changes });
    dispatch(upsertIngestionDraft(nextDraft));

    try {
      await setDoc(getDraftDocRef(householdId, draftId), changes, { merge: true });
      return nextDraft;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to update this proposal.',
      );
    }
  },
);

function createCat(
  householdId: string,
  uid: string,
  proposal: NonNullable<IngestionDraft['proposedCat']>,
  now: number,
): Cat {
  const id = doc(getCollectionRef(householdId, 'cats')).id;
  return {
    id,
    householdId,
    name: proposal.name.trim(),
    originalName: null,
    photoURL: null,
    dateOfBirth: proposal.dateOfBirth ?? 0,
    isDateOfBirthEstimated: proposal.isDateOfBirthEstimated ?? true,
    sex: proposal.sex ?? 'unknown',
    breed: proposal.breed?.trim() || 'Unknown',
    coatColors: null,
    lifestyle: null,
    microchipNumber: null,
    microchipServiceURL: null,
    rabiesTagNumber: null,
    isSpayedNeutered: false,
    spayedNeuteredAt: null,
    shelterOrigin: null,
    adoptedAt: null,
    adoptionProfileURL: null,
    otherLinks: null,
    customKeyDates: null,
    diet: null,
    currentClinicId: null,
    insurance: null,
    personalityTraits: null,
    notes: null,
    createdBy: uid,
    createdAt: now,
    lastEditedAt: now,
  };
}

function createClinic(
  householdId: string,
  proposal: NonNullable<IngestionDraft['proposedClinic']>,
  now: number,
): VetClinic {
  const id = doc(getCollectionRef(householdId, 'vetClinics')).id;
  return {
    id,
    householdId,
    name: proposal.name.trim(),
    phone: proposal.phone?.trim() || null,
    email: proposal.email?.trim() || null,
    website: proposal.website?.trim() || null,
    address: proposal.address?.trim() || null,
    isEmergency24Hour: null,
    notes: null,
    createdAt: now,
    lastEditedAt: now,
  };
}

function findCatId(
  name: string | null | undefined,
  cats: Cat[],
  fallbackCatId: string | null,
): string | null {
  if (name) {
    const match = cats.find((cat) => cat.name.toLowerCase() === name.toLowerCase());
    if (match) {
      return match.id;
    }
  }

  return fallbackCatId;
}

function catIdsForNames(
  names: string[],
  cats: Cat[],
  fallbackCatId: string | null,
): string[] {
  const ids = names
    .map((name) => findCatId(name, cats, null))
    .filter((id): id is string => Boolean(id));
  return [...new Set(ids.length > 0 ? ids : fallbackCatId ? [fallbackCatId] : [])];
}

function createVaccination(
  householdId: string,
  uid: string,
  proposal: IngestionVaccinationProposal,
  catId: string,
  visitId: string | null,
  now: number,
): Vaccination {
  const id = doc(getCollectionRef(householdId, 'vaccinations')).id;
  const dose: VaccinationDose = {
    id: doc(getCollectionRef(householdId, 'vaccinations')).id,
    administeredAt: proposal.administeredAt,
    expiresAt: proposal.expiresAt ?? null,
    clinicId: null,
    doctorId: null,
    lotNumber: proposal.lotNumber ?? null,
    linkedVisitId: visitId,
    createdBy: uid,
    createdAt: now,
  };
  return {
    id,
    householdId,
    catId,
    name: proposal.name.trim(),
    history: [dose],
    firstAdministeredAt: dose.administeredAt,
    lastAdministeredAt: dose.administeredAt,
    expiresAt: dose.expiresAt,
    createdBy: uid,
    createdAt: now,
    lastEditedAt: now,
  };
}

function createPreventive(
  householdId: string,
  uid: string,
  proposal: IngestionPreventiveProposal,
  catIds: string[],
  visitId: string | null,
  now: number,
): Preventive {
  const id = doc(getCollectionRef(householdId, 'preventives')).id;
  const dose: PreventiveDose = {
    id: doc(getCollectionRef(householdId, 'preventives')).id,
    administeredAt: proposal.administeredAt,
    expiresAt: proposal.expiresAt ?? null,
    dosage: proposal.dosage ?? null,
    clinicId: null,
    doctorId: null,
    linkedVisitId: visitId,
    createdBy: uid,
    createdAt: now,
  };
  return {
    id,
    householdId,
    catIds,
    name: proposal.name.trim(),
    customProductId: null,
    type: proposal.type,
    customTypeId: null,
    history: [dose],
    firstAdministeredAt: dose.administeredAt,
    lastAdministeredAt: dose.administeredAt,
    expiresAt: dose.expiresAt,
    createdBy: uid,
    createdAt: now,
    lastEditedAt: now,
  };
}

function createWeightEntry(
  householdId: string,
  uid: string,
  proposal: IngestionWeightProposal,
  catId: string,
  visitId: string | null,
  now: number,
): WeightEntry {
  const id = doc(getCollectionRef(householdId, 'weightEntries')).id;
  return {
    id,
    catId,
    weight: proposal.weight,
    unit: proposal.unit,
    measuredAt: proposal.measuredAt,
    linkedVisitId: visitId,
    createdBy: uid,
    createdAt: now,
  };
}

function createSymptom(
  householdId: string,
  uid: string,
  proposal: IngestionSymptomProposal,
  catId: string,
  visitId: string | null,
  now: number,
): Symptom {
  const id = doc(getCollectionRef(householdId, 'symptoms')).id;
  return {
    id,
    catId,
    description: proposal.description.trim(),
    quickTags: proposal.quickTags ?? [],
    firstNoticedAt: proposal.firstNoticedAt,
    severity: proposal.severity ?? null,
    linkedVisitIds: visitId ? [visitId] : [],
    linkedConditionId: null,
    resolvedAt: null,
    createdBy: uid,
    createdAt: now,
    lastEditedAt: now,
  };
}

function createCondition(
  householdId: string,
  uid: string,
  proposal: IngestionDraft['proposedConditions'][number],
  catId: string,
  visitId: string | null,
  now: number,
): CatCondition {
  const id = doc(getCollectionRef(householdId, 'conditions')).id;
  return {
    id,
    catId,
    source: 'custom',
    libraryConditionId: null,
    name: proposal.name.trim(),
    category: proposal.category,
    status: proposal.status,
    occurredAt: proposal.occurredAt,
    resolvedAt: null,
    description: proposal.description ?? null,
    linkedVisitIds: visitId ? [visitId] : [],
    createdBy: uid,
    createdAt: now,
    lastEditedAt: now,
  };
}

function createExpense(
  householdId: string,
  uid: string,
  proposal: IngestionExpenseProposal,
  catIds: string[],
  visitId: string | null,
  now: number,
): Expense {
  const id = doc(getCollectionRef(householdId, 'expenses')).id;
  const item: ExpenseLineItem = {
    id: doc(getCollectionRef(householdId, 'expenses')).id,
    category: proposal.category,
    label: proposal.label ?? null,
    amount: proposal.amount,
  };
  return {
    id,
    householdId,
    catIds,
    items: [item],
    amount: proposal.amount,
    label: proposal.label ?? null,
    isRecurring: false,
    recurrenceInterval: null,
    recurrenceEndedAt: null,
    incurredAt: proposal.incurredAt,
    visitId,
    notes: proposal.notes ?? null,
    createdBy: uid,
    createdAt: now,
    lastEditedAt: now,
  };
}

export const confirmIngestionDraft = createAsyncThunk<
  void,
  ConfirmIngestionDraftInput,
  { rejectValue: string }
>(
  'nineLives/ingestionDrafts/confirm',
  async (
    { householdId, draftId, uid, selections = {}, file = null },
    { dispatch, getState, rejectWithValue },
  ) => {
    const state = getState() as RootState;
    const draft = state.nineLives.ingestionDrafts.items.find((item) => item.id === draftId);

    if (!draft) {
      return rejectWithValue('Ingestion draft not found.');
    }

    const normalizedDraft = draftDefaults(draft);
    const cats = state.nineLives.cats.items.filter((cat) => cat.householdId === householdId);
    const clinics = state.nineLives.vetClinics.items.filter(
      (clinic) => clinic.householdId === householdId,
    );
    const now = Date.now();
    const batch = writeBatch(db);
    const createdCats: Cat[] = [];
    const createdClinics: VetClinic[] = [];
    const selectedCatId = selections.catId ?? null;
    const selectedClinicId = selections.clinicId ?? null;
    const shouldCreateCat =
      selections.includeCat !== false && Boolean(normalizedDraft.proposedCat) && !selectedCatId;
    const cat = shouldCreateCat
      ? createCat(householdId, uid, normalizedDraft.proposedCat as NonNullable<IngestionDraft['proposedCat']>, now)
      : null;
    const catIds = cat ? [...cats.map((item) => item.id), cat.id] : cats.map((item) => item.id);
    const availableCats = cat ? [...cats, cat] : cats;
    const fallbackCatId = selectedCatId ?? cat?.id ?? availableCats[0]?.id ?? null;
    const shouldCreateClinic =
      selections.includeClinic !== false && Boolean(normalizedDraft.proposedClinic) && !selectedClinicId;
    const clinic = shouldCreateClinic
      ? createClinic(
          householdId,
          normalizedDraft.proposedClinic as NonNullable<IngestionDraft['proposedClinic']>,
          now,
        )
      : null;
    const availableClinics = clinic ? [...clinics, clinic] : clinics;
    const clinicId = selectedClinicId ?? clinic?.id ?? null;

    if (cat) {
      batch.set(getDocRef(householdId, 'cats', cat.id), cat);
      createdCats.push(cat);
    }
    if (clinic) {
      batch.set(getDocRef(householdId, 'vetClinics', clinic.id), clinic);
      createdClinics.push(clinic);
    }

    const shouldCreateVisit =
      selections.includeVisit !== false && Boolean(normalizedDraft.proposedVisit) && Boolean(fallbackCatId);
    const visit = shouldCreateVisit
      ? {
          id: doc(getCollectionRef(householdId, 'visits')).id,
          householdId,
          catIds: [
            findCatId(normalizedDraft.proposedVisit?.catName, availableCats, fallbackCatId),
          ].filter((id): id is string => Boolean(id)),
          clinicId: clinicId ?? availableClinics[0]?.id ?? null,
          doctorId: null,
          status: 'completed' as const,
          reason: normalizedDraft.proposedVisit?.reason ?? 'checkup',
          customReasonLabel: normalizedDraft.proposedVisit?.customReasonLabel ?? null,
          followUpOfVisitId: null,
          followUpNote: null,
          title: null,
          scheduledAt: normalizedDraft.proposedVisit?.scheduledAt ?? now,
          completedAt: now,
          summary: normalizedDraft.proposedVisit?.notes ?? null,
          linkedSymptomIds: [] as string[],
          linkedConditionIds: [] as string[],
          linkedHealthRecordIds: [] as string[],
          linkedVaccinationIds: [] as string[],
          linkedWeightEntryIds: [] as string[],
          createdBy: uid,
          createdAt: now,
          lastEditedAt: now,
        }
      : null;

    if (visit) {
      batch.set(getDocRef(householdId, 'visits', visit.id), visit);
    }

    const visitId = visit?.id ?? null;
    const vaccinations: Vaccination[] = [];
    normalizedDraft.proposedVaccinations.forEach((proposal, index) => {
      if (selections.includeVaccinations?.[index] === false) {
        return;
      }
      const targetCatId = findCatId(proposal.catName, availableCats, fallbackCatId);
      if (!targetCatId) {
        return;
      }
      const vaccination = createVaccination(householdId, uid, proposal, targetCatId, visitId, now);
      batch.set(getDocRef(householdId, 'vaccinations', vaccination.id), vaccination);
      vaccinations.push(vaccination);
    });

    const preventives: Preventive[] = [];
    normalizedDraft.proposedPreventives.forEach((proposal, index) => {
      if (selections.includePreventives?.[index] === false) {
        return;
      }
      const targetCatIds = catIdsForNames(proposal.catNames, availableCats, fallbackCatId);
      if (targetCatIds.length === 0) {
        return;
      }
      const preventive = createPreventive(
        householdId,
        uid,
        proposal,
        targetCatIds,
        visitId,
        now,
      );
      batch.set(getDocRef(householdId, 'preventives', preventive.id), preventive);
      preventives.push(preventive);
    });

    const weightEntries: WeightEntry[] = [];
    if (normalizedDraft.proposedWeightEntry && selections.includeWeightEntry !== false) {
      const targetCatId = findCatId(
        normalizedDraft.proposedWeightEntry.catName,
        availableCats,
        fallbackCatId,
      );
      if (targetCatId) {
        const entry = createWeightEntry(
          householdId,
          uid,
          normalizedDraft.proposedWeightEntry,
          targetCatId,
          visitId,
          now,
        );
        batch.set(getDocRef(householdId, 'weightEntries', entry.id), entry);
        weightEntries.push(entry);
      }
    }

    const symptoms: Symptom[] = [];
    normalizedDraft.proposedSymptoms.forEach((proposal, index) => {
      if (selections.includeSymptoms?.[index] === false) {
        return;
      }
      const targetCatId = findCatId(proposal.catName, availableCats, fallbackCatId);
      if (!targetCatId) {
        return;
      }
      const symptom = createSymptom(householdId, uid, proposal, targetCatId, visitId, now);
      batch.set(getCatDetailDocRef(householdId, targetCatId, 'symptoms', symptom.id), symptom);
      symptoms.push(symptom);
    });

    const conditions: CatCondition[] = [];
    normalizedDraft.proposedConditions.forEach((proposal, index) => {
      if (selections.includeConditions?.[index] === false) {
        return;
      }
      const targetCatId = findCatId(proposal.catName, availableCats, fallbackCatId);
      if (!targetCatId) {
        return;
      }
      const condition = createCondition(householdId, uid, proposal, targetCatId, visitId, now);
      batch.set(getCatDetailDocRef(householdId, targetCatId, 'conditions', condition.id), condition);
      conditions.push(condition);
    });

    const expense =
      normalizedDraft.proposedExpense &&
      selections.includeExpense !== false &&
      fallbackCatId
        ? createExpense(
            householdId,
            uid,
            normalizedDraft.proposedExpense,
            catIdsForNames(normalizedDraft.proposedExpense.catNames, availableCats, fallbackCatId),
            visitId,
            now,
          )
        : null;
    if (expense) {
      batch.set(getDocRef(householdId, 'expenses', expense.id), expense);
    }

    if (visit) {
      const linkedVisit = {
        ...visit,
        linkedVaccinationIds: vaccinations.map((item) => item.id),
        linkedWeightEntryIds: weightEntries.map((item) => item.id),
        linkedSymptomIds: symptoms.map((item) => item.id),
        linkedConditionIds: conditions.map((item) => item.id),
        linkedHealthRecordIds: [],
      };
      batch.set(getDocRef(householdId, 'visits', visit.id), linkedVisit);
    }

    try {
      await batch.commit();

      createdCats.forEach((item) => dispatch(upsertCat(item)));
      createdClinics.forEach((item) => dispatch(upsertVetClinic(item)));
      if (visit) {
        dispatch(upsertVisit({
          ...visit,
          linkedVaccinationIds: vaccinations.map((item) => item.id),
          linkedWeightEntryIds: weightEntries.map((item) => item.id),
          linkedSymptomIds: symptoms.map((item) => item.id),
          linkedConditionIds: conditions.map((item) => item.id),
          linkedHealthRecordIds: [],
        }));
      }
      vaccinations.forEach((item) => dispatch(upsertVaccination(item)));
      preventives.forEach((item) => dispatch(upsertPreventive(item)));
      weightEntries.forEach((item) => dispatch(upsertWeightEntry(item)));
      symptoms.forEach((item) => dispatch(upsertSymptom(item)));
      conditions.forEach((item) => dispatch(upsertCatCondition(item)));
      if (expense) {
        dispatch(upsertExpense(expense));
      }

      const shouldSaveRecord =
        (selections.saveAsRecord ?? normalizedDraft.suggestKeepAsRecord) && Boolean(file) && fallbackCatId;
      if (shouldSaveRecord && file) {
        const recordId = doc(getCollectionRef(householdId, 'healthRecords')).id;
        const storagePath = `nine-lives/households/${householdId}/health-records/${recordId}`;
        try {
          const fileURL = await uploadFile(storagePath, file);
          const record: HealthRecord = {
            id: recordId,
            householdId,
            catIds: [fallbackCatId],
            fileURL,
            fileType: file.type === 'application/pdf' ? 'pdf' : 'image',
            fileName: file.name,
            label: null,
            recordType: 'vet_paperwork',
            customRecordTypeId: null,
            recordDate: normalizedDraft.proposedVisit?.scheduledAt ?? null,
            linkedVisitId: visitId,
            notes: null,
            uploadedBy: uid,
            createdAt: now,
            lastEditedAt: now,
          };
          await setDoc(getDocRef(householdId, 'healthRecords', record.id), record);
          dispatch(upsertHealthRecord(record));
          if (visit) {
            const visitWithRecord = {
              ...visit,
              linkedVaccinationIds: vaccinations.map((item) => item.id),
              linkedWeightEntryIds: weightEntries.map((item) => item.id),
              linkedSymptomIds: symptoms.map((item) => item.id),
              linkedConditionIds: conditions.map((item) => item.id),
              linkedHealthRecordIds: [record.id],
            };
            await setDoc(getDocRef(householdId, 'visits', visit.id), visitWithRecord);
            dispatch(upsertVisit(visitWithRecord));
          }
        } catch (error) {
          if (file) {
            try {
              await deleteFile(storagePath);
            } catch {
              // Preserve the original upload error.
            }
          }
          return rejectWithValue(
            error instanceof Error ? error.message : 'Unable to save the health record.',
          );
        }
      }

      await deleteDoc(getDraftDocRef(householdId, draftId));
      dispatch(removeIngestionDraft({ id: draftId }));
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to confirm this document.',
      );
    }
  },
);

export const discardIngestionDraft = createAsyncThunk<
  string,
  { householdId: string; draftId: string },
  { rejectValue: string }
>(
  'nineLives/ingestionDrafts/discard',
  async ({ householdId, draftId }, { dispatch, rejectWithValue }) => {
    try {
      await deleteDoc(getDraftDocRef(householdId, draftId));
      dispatch(removeIngestionDraft({ id: draftId }));
      return draftId;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Unable to discard this document.',
      );
    }
  },
);

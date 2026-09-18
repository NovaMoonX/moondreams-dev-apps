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

import { getHealthRecordStoragePath } from './healthRecordsActions';

import type {
  Cat,
  CatCondition,
  Expense,
  ExpenseLineItem,
  HealthRecord,
  IngestionDraft,
  Preventive,
  PreventiveDose,
  Symptom,
  Vaccination,
  VaccinationDose,
  VetClinic,
  Visit,
  WeightEntry,
} from '../../types';
import type {
  IngestionExpenseProposal,
  IngestionPreventiveProposal,
  IngestionSymptomProposal,
  IngestionVaccinationProposal,
  IngestionWeightProposal,
} from '../../lib/extractProposalFromFile.types';
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
  collectionName: 'conditions' | 'symptoms',
  id: string,
) => doc(getCollectionRef(householdId, collectionName), id);

export interface IngestionDraftUpdate {
  proposedCats?: IngestionDraft['proposedCats'];
  proposedClinics?: IngestionDraft['proposedClinics'];
  proposedVisits?: IngestionDraft['proposedVisits'];
  proposedVaccinations?: IngestionDraft['proposedVaccinations'];
  proposedPreventives?: IngestionDraft['proposedPreventives'];
  proposedWeightEntries?: IngestionDraft['proposedWeightEntries'];
  proposedSymptoms?: IngestionDraft['proposedSymptoms'];
  proposedConditions?: IngestionDraft['proposedConditions'];
  proposedExpenses?: IngestionDraft['proposedExpenses'];
  proposedRecordType?: IngestionDraft['proposedRecordType'];
  suggestKeepAsRecord?: boolean;
}

export interface IngestionDraftSelections {
  /** Parallel to `proposedCats`; defaults to included when omitted. */
  includeCats?: boolean[];
  /** Parallel to `proposedCats`; a set entry picks an existing cat instead of creating a new one. */
  catIds?: (string | null)[];
  includeClinics?: boolean[];
  clinicIds?: (string | null)[];
  includeVisits?: boolean[];
  includeVaccinations?: boolean[];
  includePreventives?: boolean[];
  includeWeightEntries?: boolean[];
  includeSymptoms?: boolean[];
  includeConditions?: boolean[];
  includeExpenses?: boolean[];
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
    proposedCats: draft.proposedCats ?? [],
    proposedClinics: draft.proposedClinics ?? [],
    proposedVisits: draft.proposedVisits ?? [],
    proposedVaccinations: draft.proposedVaccinations ?? [],
    proposedPreventives: draft.proposedPreventives ?? [],
    proposedWeightEntries: draft.proposedWeightEntries ?? [],
    proposedSymptoms: draft.proposedSymptoms ?? [],
    proposedConditions: draft.proposedConditions ?? [],
    proposedExpenses: draft.proposedExpenses ?? [],
    proposedRecordType: draft.proposedRecordType ?? null,
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
  proposal: IngestionDraft['proposedCats'][number],
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
    reminderIds: [],
    createdBy: uid,
    createdAt: now,
    lastEditedAt: now,
  };
}

function createClinic(
  householdId: string,
  proposal: IngestionDraft['proposedClinics'][number],
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

/**
 * Resolves a proposal's `catName` against the household's cats (including
 * ones this confirm is about to create). Only falls back to a single
 * candidate cat when there's exactly one in play — with multiple cats
 * proposed or on file, an unnamed reference is left unresolved rather than
 * guessing which cat it belongs to.
 */
function findCatId(name: string | null | undefined, cats: Cat[]): string | null {
  if (name) {
    const match = cats.find((cat) => cat.name.toLowerCase() === name.toLowerCase());
    if (match) {
      return match.id;
    }
  }

  return cats.length === 1 ? cats[0].id : null;
}

function catIdsForNames(names: string[], cats: Cat[]): string[] {
  const ids = names
    .map((name) => findCatId(name, cats))
    .filter((id): id is string => Boolean(id));
  return [...new Set(ids.length > 0 ? ids : cats.length === 1 ? [cats[0].id] : [])];
}

function findClinicId(name: string | null | undefined, clinics: VetClinic[]): string | null {
  if (name) {
    const match = clinics.find((clinic) => clinic.name.toLowerCase() === name.toLowerCase());
    if (match) {
      return match.id;
    }
  }

  return clinics.length === 1 ? clinics[0].id : null;
}

/** The visit whose `scheduledAt` is closest to `date`, for linking an item that doesn't name one explicitly. */
function findNearestVisit<T extends { id: string; scheduledAt: number }>(
  date: number,
  visits: T[],
): T | null {
  if (visits.length === 0) {
    return null;
  }

  return visits.reduce((closest, visit) =>
    Math.abs(visit.scheduledAt - date) < Math.abs(closest.scheduledAt - date) ? visit : closest,
  );
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
    reminderIds: [],
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
    reminderIds: [],
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
  const items: ExpenseLineItem[] = proposal.items.map((item) => ({
    id: doc(getCollectionRef(householdId, 'expenses')).id,
    category: item.category,
    label: item.label ?? null,
    amount: item.amount,
  }));
  const amount = items.reduce((sum, item) => sum + item.amount, 0);
  return {
    id,
    householdId,
    catIds,
    items,
    amount,
    label: items.length === 1 ? items[0].label : null,
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
    const existingCats = state.nineLives.cats.items.filter(
      (cat) => cat.householdId === householdId,
    );
    const existingClinics = state.nineLives.vetClinics.items.filter(
      (clinic) => clinic.householdId === householdId,
    );
    const now = Date.now();
    const batch = writeBatch(db);
    const createdCats: Cat[] = [];
    const createdClinics: VetClinic[] = [];

    normalizedDraft.proposedCats.forEach((proposal, index) => {
      if (selections.includeCats?.[index] === false) {
        return;
      }
      const selectedCatId = selections.catIds?.[index];
      if (selectedCatId) {
        return;
      }
      const cat = createCat(householdId, uid, proposal, now);
      batch.set(getDocRef(householdId, 'cats', cat.id), cat);
      createdCats.push(cat);
    });

    normalizedDraft.proposedClinics.forEach((proposal, index) => {
      if (selections.includeClinics?.[index] === false) {
        return;
      }
      const selectedClinicId = selections.clinicIds?.[index];
      if (selectedClinicId) {
        return;
      }
      const clinic = createClinic(householdId, proposal, now);
      batch.set(getDocRef(householdId, 'vetClinics', clinic.id), clinic);
      createdClinics.push(clinic);
    });

    const selectedCats = (selections.catIds ?? [])
      .filter((id): id is string => Boolean(id))
      .map((id) => existingCats.find((cat) => cat.id === id))
      .filter((cat): cat is Cat => Boolean(cat));
    const selectedClinics = (selections.clinicIds ?? [])
      .filter((id): id is string => Boolean(id))
      .map((id) => existingClinics.find((clinic) => clinic.id === id))
      .filter((clinic): clinic is VetClinic => Boolean(clinic));
    const availableCats = [...createdCats, ...selectedCats];
    const availableClinics = [...createdClinics, ...selectedClinics];

    const visits: Visit[] = [];
    normalizedDraft.proposedVisits.forEach((proposal, index) => {
      if (selections.includeVisits?.[index] === false) {
        return;
      }
      const catIds = catIdsForNames(proposal.catNames, availableCats);
      if (catIds.length === 0) {
        return;
      }
      const visit: Visit = {
        id: doc(getCollectionRef(householdId, 'visits')).id,
        householdId,
        catIds,
        clinicId: findClinicId(proposal.clinicName, availableClinics),
        doctorId: null,
        status: 'completed',
        reason: proposal.reason,
        customReasonLabel: proposal.customReasonLabel ?? null,
        followUpOfVisitId: null,
        followUpNote: null,
        title: null,
        scheduledAt: proposal.scheduledAt,
        completedAt: now,
        summary: proposal.notes ?? null,
        linkedSymptomIds: [],
        linkedConditionIds: [],
        linkedHealthRecordIds: [],
        linkedVaccinationIds: [],
        linkedWeightEntryIds: [],
        reminderIds: [],
        createdBy: uid,
        createdAt: now,
        lastEditedAt: now,
      };
      batch.set(getDocRef(householdId, 'visits', visit.id), visit);
      visits.push(visit);
    });

    interface VisitLinks {
      vaccinationIds: string[];
      weightEntryIds: string[];
      symptomIds: string[];
      conditionIds: string[];
    }
    const emptyLinks = (): VisitLinks => ({
      vaccinationIds: [],
      weightEntryIds: [],
      symptomIds: [],
      conditionIds: [],
    });
    const visitLinks = new Map<string, VisitLinks>();
    const linkToVisit = (visitId: string | null, key: keyof VisitLinks, id: string) => {
      if (!visitId) {
        return;
      }
      const links = visitLinks.get(visitId) ?? emptyLinks();
      links[key].push(id);
      visitLinks.set(visitId, links);
    };

    const vaccinations: Vaccination[] = [];
    normalizedDraft.proposedVaccinations.forEach((proposal, index) => {
      if (selections.includeVaccinations?.[index] === false) {
        return;
      }
      const targetCatId = findCatId(proposal.catName, availableCats);
      if (!targetCatId) {
        return;
      }
      const visitId = findNearestVisit(proposal.administeredAt, visits)?.id ?? null;
      const vaccination = createVaccination(householdId, uid, proposal, targetCatId, visitId, now);
      batch.set(getDocRef(householdId, 'vaccinations', vaccination.id), vaccination);
      vaccinations.push(vaccination);
      linkToVisit(visitId, 'vaccinationIds', vaccination.id);
    });

    const preventives: Preventive[] = [];
    normalizedDraft.proposedPreventives.forEach((proposal, index) => {
      if (selections.includePreventives?.[index] === false) {
        return;
      }
      const targetCatIds = catIdsForNames(proposal.catNames, availableCats);
      if (targetCatIds.length === 0) {
        return;
      }
      const visitId = findNearestVisit(proposal.administeredAt, visits)?.id ?? null;
      const preventive = createPreventive(householdId, uid, proposal, targetCatIds, visitId, now);
      batch.set(getDocRef(householdId, 'preventives', preventive.id), preventive);
      preventives.push(preventive);
    });

    const weightEntries: WeightEntry[] = [];
    normalizedDraft.proposedWeightEntries.forEach((proposal, index) => {
      if (selections.includeWeightEntries?.[index] === false) {
        return;
      }
      const targetCatId = findCatId(proposal.catName, availableCats);
      if (!targetCatId) {
        return;
      }
      const visitId = findNearestVisit(proposal.measuredAt, visits)?.id ?? null;
      const entry = createWeightEntry(householdId, uid, proposal, targetCatId, visitId, now);
      batch.set(getDocRef(householdId, 'weightEntries', entry.id), entry);
      weightEntries.push(entry);
      linkToVisit(visitId, 'weightEntryIds', entry.id);
    });

    const symptoms: Symptom[] = [];
    normalizedDraft.proposedSymptoms.forEach((proposal, index) => {
      if (selections.includeSymptoms?.[index] === false) {
        return;
      }
      const targetCatId = findCatId(proposal.catName, availableCats);
      if (!targetCatId) {
        return;
      }
      const visitId = findNearestVisit(proposal.firstNoticedAt, visits)?.id ?? null;
      const symptom = createSymptom(householdId, uid, proposal, targetCatId, visitId, now);
      batch.set(getCatDetailDocRef(householdId, 'symptoms', symptom.id), symptom);
      symptoms.push(symptom);
      linkToVisit(visitId, 'symptomIds', symptom.id);
    });

    const conditions: CatCondition[] = [];
    normalizedDraft.proposedConditions.forEach((proposal, index) => {
      if (selections.includeConditions?.[index] === false) {
        return;
      }
      const targetCatId = findCatId(proposal.catName, availableCats);
      if (!targetCatId) {
        return;
      }
      const visitId = findNearestVisit(proposal.occurredAt, visits)?.id ?? null;
      const condition = createCondition(householdId, uid, proposal, targetCatId, visitId, now);
      batch.set(getCatDetailDocRef(householdId, 'conditions', condition.id), condition);
      conditions.push(condition);
      linkToVisit(visitId, 'conditionIds', condition.id);
    });

    const expenses: Expense[] = [];
    normalizedDraft.proposedExpenses.forEach((proposal, index) => {
      if (selections.includeExpenses?.[index] === false) {
        return;
      }
      const targetCatIds = catIdsForNames(proposal.catNames, availableCats);
      if (targetCatIds.length === 0) {
        return;
      }
      const visitId = findNearestVisit(proposal.incurredAt, visits)?.id ?? null;
      const expense = createExpense(householdId, uid, proposal, targetCatIds, visitId, now);
      batch.set(getDocRef(householdId, 'expenses', expense.id), expense);
      expenses.push(expense);
    });

    const linkedVisits = visits.map((visit) => {
      const links = visitLinks.get(visit.id) ?? emptyLinks();
      const linkedVisit: Visit = {
        ...visit,
        linkedVaccinationIds: links.vaccinationIds,
        linkedWeightEntryIds: links.weightEntryIds,
        linkedSymptomIds: links.symptomIds,
        linkedConditionIds: links.conditionIds,
      };
      batch.set(getDocRef(householdId, 'visits', visit.id), linkedVisit);
      return linkedVisit;
    });

    try {
      await batch.commit();

      createdCats.forEach((item) => dispatch(upsertCat(item)));
      createdClinics.forEach((item) => dispatch(upsertVetClinic(item)));
      linkedVisits.forEach((item) => dispatch(upsertVisit(item)));
      vaccinations.forEach((item) => dispatch(upsertVaccination(item)));
      preventives.forEach((item) => dispatch(upsertPreventive(item)));
      weightEntries.forEach((item) => dispatch(upsertWeightEntry(item)));
      symptoms.forEach((item) => dispatch(upsertSymptom(item)));
      conditions.forEach((item) => dispatch(upsertCatCondition(item)));
      expenses.forEach((item) => dispatch(upsertExpense(item)));

      const recordCatId = availableCats[0]?.id ?? null;
      const shouldSaveRecord =
        (selections.saveAsRecord ?? normalizedDraft.suggestKeepAsRecord) && Boolean(file) && recordCatId;
      if (shouldSaveRecord && file && recordCatId) {
        const recordId = doc(getCollectionRef(householdId, 'healthRecords')).id;
        const storagePath = getHealthRecordStoragePath(householdId, recordId);
        const primaryVisit = linkedVisits[0] ?? null;
        try {
          const fileURL = await uploadFile(storagePath, file);
          const record: HealthRecord = {
            id: recordId,
            householdId,
            catIds: [recordCatId],
            fileURL,
            fileType: file.type === 'application/pdf' ? 'pdf' : 'image',
            fileName: file.name,
            label: null,
            recordType: normalizedDraft.proposedRecordType ?? 'vet_paperwork',
            customRecordTypeId: null,
            recordDate: primaryVisit?.scheduledAt ?? null,
            linkedVisitId: primaryVisit?.id ?? null,
            notes: null,
            uploadedBy: uid,
            createdAt: now,
            lastEditedAt: now,
          };
          await setDoc(getDocRef(householdId, 'healthRecords', record.id), record);
          dispatch(upsertHealthRecord(record));
          if (primaryVisit) {
            const visitWithRecord = { ...primaryVisit, linkedHealthRecordIds: [record.id] };
            await setDoc(getDocRef(householdId, 'visits', primaryVisit.id), visitWithRecord);
            dispatch(upsertVisit(visitWithRecord));
          }
        } catch (error) {
          try {
            await deleteFile(storagePath);
          } catch {
            // Preserve the original upload error.
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

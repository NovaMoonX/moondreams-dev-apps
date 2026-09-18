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
  HealthRecordType,
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
import { detectDuplicateSymptom } from '../../utils/detectDuplicateSymptom';
import { detectDuplicateWeightEntry } from '../../utils/detectDuplicateWeightEntry';
import { matchExistingCat } from '../../utils/matchExistingCat';
import { matchExistingClinic } from '../../utils/matchExistingClinic';
import { matchExistingCondition } from '../../utils/matchExistingCondition';
import { matchExistingVaccination, matchExistingPreventive } from '../../utils/matchExistingVaccinationOrPreventive';
import { matchExistingVisit } from '../../utils/matchExistingVisit';
import { normalizeCustomLabelCasing } from '../../utils/normalizeCustomLabelCasing';
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
import { createCustomHealthRecordType } from './customHealthRecordTypesActions';

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
  visitIds?: (string | null)[];
  includeVaccinations?: boolean[];
  vaccinationIds?: (string | null)[];
  includePreventives?: boolean[];
  preventiveIds?: (string | null)[];
  includeWeightEntries?: boolean[];
  includeSymptoms?: boolean[];
  includeConditions?: boolean[];
  conditionIds?: (string | null)[];
  conditionLibraryIds?: (string | null)[];
  includeExpenses?: boolean[];
  saveAsRecord?: boolean;
}

export interface ConfirmIngestionDraftInput {
  householdId: string;
  draftId: string;
  uid: string;
  selections?: IngestionDraftSelections;
  file?: File | null;
  recordTypeChoice?: {
    value: HealthRecordType | '__new__';
    customRecordTypeId: string | null;
    customLabel: string;
  };
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
    matchedCatIds: draft.matchedCatIds ?? draft.proposedCats.map(() => null),
    matchedClinicIds: draft.matchedClinicIds ?? draft.proposedClinics.map(() => null),
    matchedVisitIds: draft.matchedVisitIds ?? draft.proposedVisits.map(() => null),
    matchedVaccinationIds:
      draft.matchedVaccinationIds ?? draft.proposedVaccinations.map(() => null),
    matchedPreventiveIds: draft.matchedPreventiveIds ?? draft.proposedPreventives.map(() => null),
    likelyDuplicateWeightEntries:
      draft.likelyDuplicateWeightEntries ?? draft.proposedWeightEntries.map(() => false),
    likelyDuplicateSymptoms: draft.likelyDuplicateSymptoms ?? draft.proposedSymptoms.map(() => false),
    matchedLibraryConditionIds:
      draft.matchedLibraryConditionIds ?? draft.proposedConditions.map(() => null),
    matchedCatConditionIds:
      draft.matchedCatConditionIds ?? draft.proposedConditions.map(() => null),
  };
}

function selectionAt<T>(values: T[] | undefined, index: number, fallback: T): T {
  return values && index < values.length ? values[index] : fallback;
}

export const createDraftFromExtraction = createAsyncThunk<
  IngestionDraft,
  { householdId: string; uid: string; file: File },
  { rejectValue: string }
>(
  'nineLives/ingestionDrafts/createFromExtraction',
  async ({ householdId, uid, file }, { dispatch, getState, rejectWithValue }) => {
    try {
      const proposal = await extractProposalFromFile(file);
      const state = getState() as RootState;
      const cats = state.nineLives.cats.items.filter((cat) => cat.householdId === householdId);
      const clinics = state.nineLives.vetClinics.items.filter(
        (clinic) => clinic.householdId === householdId,
      );
      const visits = state.nineLives.visits.items.filter((visit) => visit.householdId === householdId);
      const vaccinations = state.nineLives.vaccinations.items.filter(
        (vaccination) => vaccination.householdId === householdId,
      );
      const preventives = state.nineLives.preventives.items.filter(
        (preventive) => preventive.householdId === householdId,
      );
      const weightEntries = state.nineLives.weightEntries.items.filter((entry) =>
        cats.some((cat) => cat.id === entry.catId),
      );
      const symptoms = state.nineLives.symptoms.items.filter((symptom) =>
        cats.some((cat) => cat.id === symptom.catId),
      );
      const catConditions = state.nineLives.catConditions.items.filter((condition) =>
        cats.some((cat) => cat.id === condition.catId),
      );
      const matchedCatIds = proposal.proposedCats.map((item) => matchExistingCat(item.name, cats));
      const matchedClinicIds = proposal.proposedClinics.map((item) =>
        matchExistingClinic(item.name, clinics),
      );
      const matchedVisitIds = proposal.proposedVisits.map((item) =>
        matchExistingVisit(item, visits, clinics),
      );
      const catIdForName = (name: string | null): string | null =>
        matchExistingCat(name, cats);
      const catIdsForNames = (names: string[]): string[] =>
        names
          .map((name) => catIdForName(name))
          .filter((id): id is string => Boolean(id));
      const matchedVaccinationIds = proposal.proposedVaccinations.map((item) =>
        matchExistingVaccination(item, catIdForName(item.catName), vaccinations),
      );
      const matchedPreventiveIds = proposal.proposedPreventives.map((item) =>
        matchExistingPreventive(item, catIdsForNames(item.catNames), preventives),
      );
      const likelyDuplicateWeightEntries = proposal.proposedWeightEntries.map((item) =>
        detectDuplicateWeightEntry(item, catIdForName(item.catName), weightEntries),
      );
      const likelyDuplicateSymptoms = proposal.proposedSymptoms.map((item) =>
        detectDuplicateSymptom(item, catIdForName(item.catName), symptoms),
      );
      const conditionMatches = proposal.proposedConditions.map((item) =>
        matchExistingCondition(item, catIdForName(item.catName), state.nineLives.conditionLibrary.items, catConditions),
      );
      const matchedLibraryConditionIds = conditionMatches.map(
        (match) => match.matchedLibraryConditionId,
      );
      const matchedCatConditionIds = conditionMatches.map((match) => match.matchedCatConditionId);
      const proposedSymptoms = proposal.proposedSymptoms.map((item, index) =>
        likelyDuplicateSymptoms[index]
          ? item
          : { ...item, description: normalizeCustomLabelCasing(item.description) },
      );
      const proposedConditions = proposal.proposedConditions.map((item, index) =>
        matchedLibraryConditionIds[index] || matchedCatConditionIds[index]
          ? item
          : { ...item, name: normalizeCustomLabelCasing(item.name) },
      );
      const draftId = doc(getDraftCollectionRef(householdId)).id;
      const draft: IngestionDraft = {
        id: draftId,
        householdId,
        sourceType: file.type === 'application/pdf' ? 'pdf' : 'photo',
        sourceFileName: file.name,
        ...proposal,
        proposedSymptoms,
        proposedConditions,
        matchedCatIds,
        matchedClinicIds,
        matchedVisitIds,
        matchedVaccinationIds,
        matchedPreventiveIds,
        likelyDuplicateWeightEntries,
        likelyDuplicateSymptoms,
        matchedLibraryConditionIds,
        matchedCatConditionIds,
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

    return matchExistingCat(name, cats);
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

    return matchExistingClinic(name, clinics);
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
  libraryConditionId: string | null,
): CatCondition {
  const id = doc(getCollectionRef(householdId, 'conditions')).id;
  return {
    id,
    catId,
    source: libraryConditionId ? 'library' : 'custom',
    libraryConditionId,
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
    { householdId, draftId, uid, selections = {}, file = null, recordTypeChoice },
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
    const selectedCatIds = normalizedDraft.proposedCats.map((_, index) =>
      selectionAt(selections.catIds, index, normalizedDraft.matchedCatIds[index] ?? null),
    );
    const selectedClinicIds = normalizedDraft.proposedClinics.map((_, index) =>
      selectionAt(selections.clinicIds, index, normalizedDraft.matchedClinicIds[index] ?? null),
    );

    normalizedDraft.proposedCats.forEach((proposal, index) => {
      if (selections.includeCats?.[index] === false) {
        return;
      }
      const selectedCatId = selectedCatIds[index];
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
      const selectedClinicId = selectedClinicIds[index];
      if (selectedClinicId) {
        return;
      }
      const clinic = createClinic(householdId, proposal, now);
      batch.set(getDocRef(householdId, 'vetClinics', clinic.id), clinic);
      createdClinics.push(clinic);
    });

    const selectedCats = selectedCatIds
      .filter((id): id is string => Boolean(id))
      .map((id) => existingCats.find((cat) => cat.id === id))
      .filter((cat): cat is Cat => Boolean(cat));
    const selectedClinics = selectedClinicIds
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
      const selectedVisitId = selectionAt(
        selections.visitIds,
        index,
        normalizedDraft.matchedVisitIds[index] ?? null,
      );
      const existingVisit = selectedVisitId
        ? state.nineLives.visits.items.find((visit) => visit.id === selectedVisitId)
        : undefined;
      const visit: Visit = existingVisit
        ? {
            ...existingVisit,
            catIds: [...new Set([...existingVisit.catIds, ...catIds])],
            status: 'completed',
            completedAt: existingVisit.completedAt ?? now,
            summary: proposal.notes ?? existingVisit.summary,
            lastEditedAt: now,
          }
        : {
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
    const visitLinks = new Map<string, VisitLinks>(
      visits.map((visit) => [
        visit.id,
        {
          vaccinationIds: [...visit.linkedVaccinationIds],
          weightEntryIds: [...visit.linkedWeightEntryIds],
          symptomIds: [...visit.linkedSymptomIds],
          conditionIds: [...visit.linkedConditionIds],
        },
      ]),
    );
    const linkToVisit = (visitId: string | null, key: keyof VisitLinks, id: string) => {
      if (!visitId) {
        return;
      }
      const links = visitLinks.get(visitId) ?? emptyLinks();
      if (!links[key].includes(id)) {
        links[key].push(id);
      }
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
      const visitId =
        findNearestVisit(proposal.administeredAt, visits)?.id ??
        selections.visitIds?.[index] ??
        null;
      const selectedVaccinationId = selectionAt(
        selections.vaccinationIds,
        index,
        normalizedDraft.matchedVaccinationIds[index] ?? null,
      );
      const existingVaccination = selectedVaccinationId
        ? state.nineLives.vaccinations.items.find((item) => item.id === selectedVaccinationId)
        : undefined;
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
      const vaccination = existingVaccination
        ? {
            ...existingVaccination,
            history: [dose, ...existingVaccination.history],
            lastAdministeredAt: dose.administeredAt,
            expiresAt: dose.expiresAt,
            lastEditedAt: now,
          }
        : createVaccination(householdId, uid, proposal, targetCatId, visitId, now);
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
      const visitId =
        findNearestVisit(proposal.administeredAt, visits)?.id ??
        selections.visitIds?.[index] ??
        null;
      const selectedPreventiveId = selectionAt(
        selections.preventiveIds,
        index,
        normalizedDraft.matchedPreventiveIds[index] ?? null,
      );
      const existingPreventive = selectedPreventiveId
        ? state.nineLives.preventives.items.find((item) => item.id === selectedPreventiveId)
        : undefined;
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
      const preventive = existingPreventive
        ? {
            ...existingPreventive,
            catIds: [...new Set([...existingPreventive.catIds, ...targetCatIds])],
            history: [dose, ...existingPreventive.history],
            lastAdministeredAt: dose.administeredAt,
            expiresAt: dose.expiresAt,
            lastEditedAt: now,
          }
        : createPreventive(householdId, uid, proposal, targetCatIds, visitId, now);
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
      const visitId =
        findNearestVisit(proposal.occurredAt, visits)?.id ??
        selections.visitIds?.[index] ??
        null;
      const selectedConditionId = selectionAt(
        selections.conditionIds,
        index,
        normalizedDraft.matchedCatConditionIds[index] ?? null,
      );
      const selectedLibraryConditionId = selectionAt(
        selections.conditionLibraryIds,
        index,
        normalizedDraft.matchedLibraryConditionIds[index] ?? null,
      );
      const existingCondition = selectedConditionId
        ? state.nineLives.catConditions.items.find((item) => item.id === selectedConditionId)
        : undefined;
      const condition = existingCondition
        ? {
            ...existingCondition,
            linkedVisitIds: visitId
              ? [...new Set([...existingCondition.linkedVisitIds, visitId])]
              : existingCondition.linkedVisitIds,
            lastEditedAt: now,
          }
        : createCondition(
            householdId,
            uid,
            proposal,
            targetCatId,
            visitId,
            now,
            selectedLibraryConditionId,
          );
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

      const recordCatIds = availableCats.map((cat) => cat.id);
      const shouldSaveRecord =
        (selections.saveAsRecord ?? normalizedDraft.suggestKeepAsRecord) &&
        Boolean(file) &&
        recordCatIds.length > 0;
      if (shouldSaveRecord && file && recordCatIds.length > 0) {
        const recordId = doc(getCollectionRef(householdId, 'healthRecords')).id;
        const storagePath = getHealthRecordStoragePath(householdId, recordId);
        const primaryVisit = linkedVisits[0] ?? null;
        const selectedRecordType =
          recordTypeChoice ??
          ({
            value: normalizedDraft.proposedRecordType ?? 'vet_paperwork',
            customRecordTypeId: null,
            customLabel: '',
          } satisfies {
            value: HealthRecordType | '__new__';
            customRecordTypeId: string | null;
            customLabel: string;
          });

        let recordType: HealthRecordType =
          selectedRecordType.value === 'custom' || selectedRecordType.value === '__new__'
            ? 'custom'
            : selectedRecordType.value;
        let customRecordTypeId =
          selectedRecordType.value === 'custom' ? selectedRecordType.customRecordTypeId ?? null : null;

        if (selectedRecordType.value === '__new__') {
          const customType = await dispatch(
            createCustomHealthRecordType({
              householdId,
              uid,
              label: selectedRecordType.customLabel,
            }),
          ).unwrap();
          recordType = 'custom';
          customRecordTypeId = customType.id;
        }

        if (recordType === 'custom' && !customRecordTypeId) {
          return rejectWithValue('Select or enter a custom record type.');
        }

        try {
          const fileURL = await uploadFile(storagePath, file);
          const record: HealthRecord = {
            id: recordId,
            householdId,
            catIds: recordCatIds,
            fileURL,
            fileType: file.type === 'application/pdf' ? 'pdf' : 'image',
            fileName: file.name,
            label: null,
            recordType,
            customRecordTypeId,
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

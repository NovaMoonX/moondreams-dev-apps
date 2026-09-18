import type {
  IngestionCatProposal,
  IngestionClinicProposal,
  IngestionConditionProposal,
  IngestionExpenseProposal,
  IngestionPreventiveProposal,
  IngestionSymptomProposal,
  IngestionVaccinationProposal,
  IngestionVisitProposal,
  IngestionWeightProposal,
} from './lib/extractProposalFromFile.types';

export interface Household {
  id: string;
  name: string;
  members: string[];
  inviteCode: string | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface PendingHouseholdRequest {
  uid: string;
  householdId: string;
  inviteCode: string;
  requestedAt: number;
}

export type CatLifestyle = 'indoor' | 'outdoor' | 'indoor_outdoor';

export interface CatKeyDate {
  id: string;
  label: string;
  date: number;
}

export interface CatLink {
  id: string;
  label: string;
  url: string;
}

export type CatSex = 'male' | 'female' | 'unknown';

export type CatFoodType = 'dry' | 'wet' | 'mixed';

export interface CatDiet {
  foodType: CatFoodType | null;
  brand: string | null;
  feedingsPerDay: number | null;
  usesAutomaticFeeder: boolean | null;
  treats: string | null;
  notes: string | null;
}

export interface CatInsurance {
  provider: string;
  policyNumber: string;
  monthlyPremium: number | null;
  coverageStartDate: number | null;
  coverageNotes: string | null;
}

export interface CatShelterOrigin {
  name: string;
  address: string | null;
}

export interface Cat {
  id: string;
  householdId: string;
  name: string;
  originalName: string | null;
  photoURL: string | null;
  dateOfBirth: number;
  isDateOfBirthEstimated: boolean;
  sex: CatSex;
  breed: string;
  coatColors: string[] | null;
  lifestyle: CatLifestyle | null;
  microchipNumber: string | null;
  microchipServiceURL: string | null;
  rabiesTagNumber: string | null;
  isSpayedNeutered: boolean;
  spayedNeuteredAt: number | null;
  shelterOrigin: CatShelterOrigin | null;
  adoptedAt: number | null;
  adoptionProfileURL: string | null;
  otherLinks: CatLink[] | null;
  customKeyDates: CatKeyDate[] | null;
  diet: CatDiet | null;
  currentClinicId: string | null;
  insurance: CatInsurance | null;
  personalityTraits: string[] | null;
  notes: string | null;
  /** Pending yearly-recurring reminders (birthday, adoption anniversary) — rescheduled when `dateOfBirth`/`adoptedAt` change. */
  reminderIds: string[];
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface VetClinic {
  id: string;
  householdId: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  isEmergency24Hour: boolean | null;
  notes: string | null;
  createdAt: number;
  lastEditedAt: number;
}

export interface Doctor {
  id: string;
  householdId: string;
  clinicId: string;
  name: string;
  notes: string | null;
  createdAt: number;
}

export type HealthRecordType =
  | 'lab_result'
  | 'vet_paperwork'
  | 'insurance'
  | 'shelter_adoption'
  | 'prescription'
  | 'microchip_registration'
  | 'miscellaneous'
  | 'custom';

export interface HealthRecord {
  id: string;
  householdId: string;
  catIds: string[];
  fileURL: string;
  fileType: 'pdf' | 'image';
  fileName: string;
  label: string | null;
  recordType: HealthRecordType;
  customRecordTypeId: string | null;
  recordDate: number | null;
  linkedVisitId: string | null;
  notes: string | null;
  uploadedBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface CustomHealthRecordType {
  id: string;
  householdId: string;
  label: string;
  createdBy: string;
  createdAt: number;
}

export type VisitStatus = 'upcoming' | 'completed' | 'cancelled';
export type VisitReason =
  | 'checkup'
  | 'illness'
  | 'accident'
  | 'vaccination'
  | 'follow_up'
  | 'custom';

export interface Visit {
  id: string;
  householdId: string;
  catIds: string[];
  clinicId: string | null;
  doctorId: string | null;
  status: VisitStatus;
  reason: VisitReason;
  customReasonLabel: string | null;
  followUpOfVisitId: string | null;
  followUpNote: string | null;
  title: string | null;
  scheduledAt: number;
  completedAt: number | null;
  summary: string | null;
  linkedSymptomIds: string[];
  linkedConditionIds: string[];
  linkedHealthRecordIds: string[];
  linkedVaccinationIds: string[];
  linkedWeightEntryIds: string[];
  /** Pending push reminders scheduled a day before `scheduledAt`, if any — cancelled and rescheduled when `scheduledAt` changes. */
  reminderIds: string[];
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface VaccinationDose {
  id: string;
  administeredAt: number;
  expiresAt: number | null;
  clinicId: string | null;
  doctorId: string | null;
  lotNumber: string | null;
  linkedVisitId: string | null;
  createdBy: string;
  createdAt: number;
}

export interface Vaccination {
  id: string;
  householdId: string;
  catId: string;
  name: string;
  /** Full dose history, newest first. Always at least one entry. */
  history: VaccinationDose[];
  /** Set once, from history's first entry, and never changed afterward. */
  firstAdministeredAt: number;
  /** Denormalized from history[0] (the most recent dose), kept in sync on every write. */
  lastAdministeredAt: number;
  /** Denormalized from history[0]. The "next due" date shown throughout the UI. */
  expiresAt: number | null;
  /** Pending push reminders scheduled ahead of `expiresAt` (a week before, and the day of), if any — cancelled and rescheduled when `expiresAt` changes. */
  reminderIds: string[];
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export type PreventiveType =
  | 'flea-tick'
  | 'heartworm'
  | 'mite'
  | 'dewormer'
  | 'medication'
  | 'other'
  | 'custom';

export interface PreventiveDose {
  id: string;
  administeredAt: number;
  expiresAt: number | null;
  dosage: string | null;
  clinicId: string | null;
  doctorId: string | null;
  linkedVisitId: string | null;
  createdBy: string;
  createdAt: number;
}

export interface Preventive {
  id: string;
  householdId: string;
  catIds: string[];
  name: string;
  customProductId: string | null;
  type: PreventiveType;
  customTypeId: string | null;
  /** Full dose history, newest first. Always at least one entry. */
  history: PreventiveDose[];
  /** Set once, from history's first entry, and never changed afterward. */
  firstAdministeredAt: number;
  /** Denormalized from history[0] (the most recent dose), kept in sync on every write. */
  lastAdministeredAt: number;
  /** Denormalized from history[0]. The "next due" date shown throughout the UI. */
  expiresAt: number | null;
  /** Pending push reminders scheduled ahead of `expiresAt` (a week before, and the day of), if any — cancelled and rescheduled when `expiresAt` changes. */
  reminderIds: string[];
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface CustomPreventiveProduct {
  id: string;
  householdId: string;
  label: string;
  createdBy: string;
  createdAt: number;
}

export interface CustomPreventiveType {
  id: string;
  householdId: string;
  label: string;
  createdBy: string;
  createdAt: number;
}

export interface WeightEntry {
  id: string;
  catId: string;
  weight: number;
  unit: 'lb' | 'kg';
  measuredAt: number;
  linkedVisitId: string | null;
  createdBy: string;
  createdAt: number;
}

export type LitterType =
  | 'clumping_clay'
  | 'non_clumping_clay'
  | 'pine_wood_pellet'
  | 'paper'
  | 'crystal_silica'
  | 'corn'
  | 'wheat'
  | 'walnut'
  | 'custom';

export interface LitterBox {
  id: string;
  householdId: string;
  name: string;
  location: string | null;
  /** When false, the box is retired (e.g. after switching litter) and hidden from new weigh-ins, but its history is kept. */
  isActive: boolean;
  /** Pending push reminder scheduled a couple days before the box's litter is due for a full change, if any — cancelled and rescheduled whenever a new full change is logged. */
  reminderIds: string[];
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface CustomLitterType {
  id: string;
  householdId: string;
  label: string;
  createdBy: string;
  createdAt: number;
}

/** A specific litter product (brand + type + bag size + price), used to derive per-entry usage cost. */
export interface Litter {
  id: string;
  householdId: string;
  brand: string;
  litterType: LitterType;
  customLitterTypeId: string | null;
  weight: number;
  weightUnit: 'lb' | 'kg';
  cost: number | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface LitterEntry {
  id: string;
  householdId: string;
  litterBoxId: string;
  litterId: string;
  /** The box's weight after sifting — before any litter is added during this check. */
  weightBefore: number;
  weightUnit: 'lb' | 'kg';
  /**
   * The box's weight after adding litter during this check, if any was added.
   * Null means this was just a reading, with nothing topped off or changed.
   */
  refillWeight: number | null;
  /** Only meaningful when `refillWeight` is set: true if the box was fully emptied before refilling, false if it was just topped off. */
  isFullChange: boolean;
  loggedAt: number;
  notes: string | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export type ExpenseCategory =
  | 'adoption_fee'
  | 'insurance'
  | 'food'
  | 'litter'
  | 'vet'
  | 'grooming'
  | 'supplies'
  | 'medication'
  | 'microchipping'
  | 'spay_neuter'
  | 'other';

export type RecurrenceInterval = 'monthly' | 'yearly';

export interface ExpenseLineItem {
  id: string;
  /** A preset `ExpenseCategory` value or a household's custom category label. */
  category: string;
  label: string | null;
  amount: number;
}

export interface Expense {
  id: string;
  householdId: string;
  catIds: string[];
  /** Line items making up this expense (e.g. exam + bloodwork for one vet visit). Always at least one. */
  items: ExpenseLineItem[];
  /** Denormalized sum of `items[].amount`, kept in sync on every write so totals don't need to re-derive it. */
  amount: number;
  label: string | null;
  isRecurring: boolean;
  recurrenceInterval: RecurrenceInterval | null;
  /** When set, this recurring expense has stopped billing as of this date. Always null when `isRecurring` is false. */
  recurrenceEndedAt: number | null;
  incurredAt: number;
  /** The visit this expense was incurred for, if any. */
  visitId: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface IngestionDraft {
  id: string;
  householdId: string;
  sourceType: 'pdf' | 'photo';
  sourceFileName: string;
  proposedCats: IngestionCatProposal[];
  proposedClinics: IngestionClinicProposal[];
  proposedVisits: IngestionVisitProposal[];
  proposedVaccinations: IngestionVaccinationProposal[];
  proposedPreventives: IngestionPreventiveProposal[];
  proposedWeightEntry: IngestionWeightProposal | null;
  proposedSymptoms: IngestionSymptomProposal[];
  proposedConditions: IngestionConditionProposal[];
  proposedExpenses: IngestionExpenseProposal[];
  suggestKeepAsRecord: boolean;
  confidence: number | null;
  createdBy: string;
  createdAt: number;
}

export type SymptomSeverity = 'mild' | 'moderate' | 'severe';

export type SymptomQuickTag =
  | 'litter_box_change'
  | 'appetite_change'
  | 'vomiting'
  | 'lethargy'
  | 'hiding'
  | 'playfulness_change'
  | 'grooming_change'
  | 'other';

export interface CustomSymptomQuickTag {
  id: string;
  householdId: string;
  label: string;
  createdBy: string;
  createdAt: number;
}

export interface Symptom {
  id: string;
  catId: string;
  description: string;
  /** Preset `SymptomQuickTag` values or a household's custom tag labels (see `CustomSymptomQuickTag`). */
  quickTags: string[];
  firstNoticedAt: number;
  severity: SymptomSeverity | null;
  linkedVisitIds: string[];
  linkedConditionId: string | null;
  resolvedAt: number | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export type ConditionCategory = 'illness' | 'injury' | 'chronic' | 'parasite' | 'allergy';

export interface LibraryCondition {
  id: string;
  name: string;
  category: ConditionCategory;
  description: string;
  source: 'seed' | 'api';
  sourceRef: string | null;
  createdAt: number;
}

export type CatConditionSource = 'library' | 'custom';
export type CatConditionStatus = 'active' | 'ongoing' | 'resolved';

export interface CatCondition {
  id: string;
  catId: string;
  source: CatConditionSource;
  libraryConditionId: string | null;
  name: string;
  category: ConditionCategory;
  status: CatConditionStatus;
  occurredAt: number;
  resolvedAt: number | null;
  description: string | null;
  linkedVisitIds: string[];
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

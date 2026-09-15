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
  label: string;
  date: number;
}

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
  photoURL: string | null;
  dateOfBirth: number;
  isDateOfBirthEstimated: boolean;
  breed: string;
  lifestyle: CatLifestyle | null;
  microchipNumber: string | null;
  shelterOrigin: CatShelterOrigin | null;
  adoptedAt: number | null;
  customKeyDates: CatKeyDate[] | null;
  diet: CatDiet | null;
  currentClinicId: string | null;
  insurance: CatInsurance | null;
  personalityTraits: string[] | null;
  notes: string | null;
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
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface Vaccination {
  id: string;
  householdId: string;
  catId: string;
  name: string;
  administeredAt: number;
  expiresAt: number | null;
  clinicId: string | null;
  doctorId: string | null;
  lotNumber: string | null;
  linkedVisitId: string | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
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

export interface Expense {
  id: string;
  householdId: string;
  catIds: string[];
  category: ExpenseCategory;
  label: string | null;
  amount: number;
  isRecurring: boolean;
  recurrenceInterval: RecurrenceInterval | null;
  /** When set, this recurring expense has stopped billing as of this date. Always null when `isRecurring` is false. */
  recurrenceEndedAt: number | null;
  incurredAt: number;
  notes: string | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
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

export interface Symptom {
  id: string;
  catId: string;
  description: string;
  quickTags: SymptomQuickTag[];
  firstNoticedAt: number;
  severity: SymptomSeverity | null;
  linkedVisitIds: string[];
  linkedConditionId: string | null;
  resolvedAt: number | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export type ConditionCategory =
  | 'illness'
  | 'injury'
  | 'chronic'
  | 'parasite'
  | 'allergy'
  | 'other';

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

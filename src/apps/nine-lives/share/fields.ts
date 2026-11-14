import type { ShareDecision } from '@/lib/connections/fieldDecisions';
import type {
  Household,
  PendingHouseholdRequest,
  CatKeyDate,
  CatLink,
  CatDiet,
  CatInsurance,
  CatShelterOrigin,
  Cat,
  VetClinic,
  Doctor,
  HealthRecord,
  CustomHealthRecordType,
  Visit,
  VaccinationDose,
  Vaccination,
  PreventiveDose,
  Preventive,
  CustomPreventiveProduct,
  CustomPreventiveType,
  WeightEntry,
  LitterBox,
  CustomLitterType,
  Litter,
  LitterEntry,
  ExpenseLineItem,
  Expense,
  IngestionDraft,
  CustomSymptomQuickTag,
  Symptom,
  LibraryCondition,
  CatCondition,
} from '@apps/nine-lives/types';

const HOUSEHOLD_FIELDS = {
  id: 'notUseful',
  name: 'notUseful',
  members: 'filter',
  inviteCode: 'never',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'notUseful',
} satisfies Record<keyof Household, ShareDecision>;

const PENDING_HOUSEHOLD_REQUEST_FIELDS = {
  uid: 'notUseful',
  householdId: 'notUseful',
  inviteCode: 'never',
  requestedAt: 'notUseful',
} satisfies Record<keyof PendingHouseholdRequest, ShareDecision>;

const CAT_KEY_DATE_FIELDS = {
  id: 'notUseful',
  label: 'notUseful',
  date: 'notUseful',
} satisfies Record<keyof CatKeyDate, ShareDecision>;

const CAT_LINK_FIELDS = {
  id: 'notUseful',
  label: 'notUseful',
  url: 'notUseful',
} satisfies Record<keyof CatLink, ShareDecision>;

const CAT_DIET_FIELDS = {
  foodType: 'notUseful',
  brand: 'notUseful',
  feedingsPerDay: 'notUseful',
  usesAutomaticFeeder: 'notUseful',
  treats: 'notUseful',
  notes: 'never',
} satisfies Record<keyof CatDiet, ShareDecision>;

const CAT_INSURANCE_FIELDS = {
  provider: 'never',
  policyNumber: 'never',
  monthlyPremium: 'never',
  coverageStartDate: 'never',
  coverageNotes: 'never',
} satisfies Record<keyof CatInsurance, ShareDecision>;

const CAT_SHELTER_ORIGIN_FIELDS = {
  name: 'notUseful',
  address: 'notUseful',
} satisfies Record<keyof CatShelterOrigin, ShareDecision>;

const CAT_FIELDS = {
  id: 'notUseful',
  householdId: 'notUseful',
  name: 'shared',
  originalName: 'notUseful',
  photoURL: 'notUseful',
  dateOfBirth: 'notUseful',
  isDateOfBirthEstimated: 'notUseful',
  sex: 'notUseful',
  breed: 'notUseful',
  coatColors: 'notUseful',
  lifestyle: 'notUseful',
  microchipNumber: 'never',
  microchipServiceURL: 'notUseful',
  rabiesTagNumber: 'never',
  isSpayedNeutered: 'notUseful',
  spayedNeuteredAt: 'notUseful',
  shelterOrigin: 'notUseful',
  adoptedAt: 'notUseful',
  adoptionProfileURL: 'notUseful',
  otherLinks: 'notUseful',
  customKeyDates: 'notUseful',
  diet: 'notUseful',
  currentClinicId: 'notUseful',
  insurance: 'never',
  personalityTraits: 'notUseful',
  notes: 'never',
  reminderIds: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
} satisfies Record<keyof Cat, ShareDecision>;

const VET_CLINIC_FIELDS = {
  id: 'notUseful',
  householdId: 'notUseful',
  name: 'shared',
  phone: 'shared',
  email: 'never',
  website: 'notUseful',
  address: 'shared',
  isEmergency24Hour: 'notUseful',
  notes: 'never',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
} satisfies Record<keyof VetClinic, ShareDecision>;

const DOCTOR_FIELDS = {
  id: 'notUseful',
  householdId: 'notUseful',
  clinicId: 'notUseful',
  name: 'notUseful',
  notes: 'never',
  createdAt: 'notUseful',
} satisfies Record<keyof Doctor, ShareDecision>;

const HEALTH_RECORD_FIELDS = {
  id: 'never',
  householdId: 'never',
  catIds: 'never',
  fileURL: 'never',
  fileType: 'never',
  fileName: 'never',
  label: 'never',
  recordType: 'never',
  customRecordTypeId: 'never',
  recordDate: 'never',
  linkedVisitId: 'never',
  notes: 'never',
  uploadedBy: 'never',
  createdAt: 'never',
  lastEditedAt: 'never',
} satisfies Record<keyof HealthRecord, ShareDecision>;

const CUSTOM_HEALTH_RECORD_TYPE_FIELDS = {
  id: 'notUseful',
  householdId: 'notUseful',
  label: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
} satisfies Record<keyof CustomHealthRecordType, ShareDecision>;

const VISIT_FIELDS = {
  id: 'notUseful',
  householdId: 'notUseful',
  catIds: 'shared',
  clinicId: 'shared',
  doctorId: 'notUseful',
  status: 'filter',
  reason: 'shared',
  customReasonLabel: 'shared',
  followUpOfVisitId: 'notUseful',
  followUpNote: 'never',
  title: 'notUseful',
  scheduledAt: 'shared',
  completedAt: 'notUseful',
  summary: 'never',
  linkedSymptomIds: 'notUseful',
  linkedConditionIds: 'notUseful',
  linkedHealthRecordIds: 'notUseful',
  linkedVaccinationIds: 'notUseful',
  linkedWeightEntryIds: 'notUseful',
  reminderIds: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
} satisfies Record<keyof Visit, ShareDecision>;

const VACCINATION_DOSE_FIELDS = {
  id: 'notUseful',
  administeredAt: 'notUseful',
  expiresAt: 'notUseful',
  clinicId: 'notUseful',
  doctorId: 'notUseful',
  lotNumber: 'notUseful',
  linkedVisitId: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
} satisfies Record<keyof VaccinationDose, ShareDecision>;

const VACCINATION_FIELDS = {
  id: 'notUseful',
  householdId: 'notUseful',
  catId: 'shared',
  name: 'shared',
  history: 'notUseful',
  firstAdministeredAt: 'notUseful',
  lastAdministeredAt: 'notUseful',
  expiresAt: 'shared',
  reminderIds: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
} satisfies Record<keyof Vaccination, ShareDecision>;

const PREVENTIVE_DOSE_FIELDS = {
  id: 'notUseful',
  administeredAt: 'notUseful',
  expiresAt: 'notUseful',
  dosage: 'notUseful',
  clinicId: 'notUseful',
  doctorId: 'notUseful',
  linkedVisitId: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
} satisfies Record<keyof PreventiveDose, ShareDecision>;

const PREVENTIVE_FIELDS = {
  id: 'notUseful',
  householdId: 'notUseful',
  catIds: 'shared',
  name: 'shared',
  customProductId: 'notUseful',
  type: 'notUseful',
  customTypeId: 'notUseful',
  history: 'notUseful',
  firstAdministeredAt: 'notUseful',
  lastAdministeredAt: 'notUseful',
  expiresAt: 'shared',
  reminderIds: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
} satisfies Record<keyof Preventive, ShareDecision>;

const CUSTOM_PREVENTIVE_PRODUCT_FIELDS = {
  id: 'notUseful',
  householdId: 'notUseful',
  label: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
} satisfies Record<keyof CustomPreventiveProduct, ShareDecision>;

const CUSTOM_PREVENTIVE_TYPE_FIELDS = {
  id: 'notUseful',
  householdId: 'notUseful',
  label: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
} satisfies Record<keyof CustomPreventiveType, ShareDecision>;

const WEIGHT_ENTRY_FIELDS = {
  id: 'never',
  catId: 'never',
  weight: 'never',
  unit: 'never',
  measuredAt: 'never',
  linkedVisitId: 'never',
  createdBy: 'never',
  createdAt: 'never',
} satisfies Record<keyof WeightEntry, ShareDecision>;

const LITTER_BOX_FIELDS = {
  id: 'never',
  householdId: 'never',
  name: 'never',
  location: 'never',
  isActive: 'never',
  reminderIds: 'never',
  createdBy: 'never',
  createdAt: 'never',
  lastEditedAt: 'never',
} satisfies Record<keyof LitterBox, ShareDecision>;

const CUSTOM_LITTER_TYPE_FIELDS = {
  id: 'never',
  householdId: 'never',
  label: 'never',
  createdBy: 'never',
  createdAt: 'never',
} satisfies Record<keyof CustomLitterType, ShareDecision>;

const LITTER_FIELDS = {
  id: 'never',
  householdId: 'never',
  brand: 'never',
  litterType: 'never',
  customLitterTypeId: 'never',
  weight: 'never',
  weightUnit: 'never',
  cost: 'never',
  createdBy: 'never',
  createdAt: 'never',
  lastEditedAt: 'never',
} satisfies Record<keyof Litter, ShareDecision>;

const LITTER_ENTRY_FIELDS = {
  id: 'never',
  householdId: 'never',
  litterBoxId: 'never',
  litterId: 'never',
  weightBefore: 'never',
  weightUnit: 'never',
  refillWeight: 'never',
  isFullChange: 'never',
  loggedAt: 'never',
  notes: 'never',
  createdBy: 'never',
  createdAt: 'never',
  lastEditedAt: 'never',
} satisfies Record<keyof LitterEntry, ShareDecision>;

const EXPENSE_LINE_ITEM_FIELDS = {
  id: 'never',
  category: 'never',
  label: 'never',
  amount: 'never',
} satisfies Record<keyof ExpenseLineItem, ShareDecision>;

const EXPENSE_FIELDS = {
  id: 'never',
  householdId: 'never',
  catIds: 'never',
  items: 'never',
  amount: 'never',
  label: 'never',
  isRecurring: 'never',
  recurrenceInterval: 'never',
  recurrenceEndedAt: 'never',
  incurredAt: 'never',
  visitId: 'never',
  notes: 'never',
  createdBy: 'never',
  createdAt: 'never',
  lastEditedAt: 'never',
} satisfies Record<keyof Expense, ShareDecision>;

const INGESTION_DRAFT_FIELDS = {
  id: 'never',
  householdId: 'never',
  sourceType: 'never',
  sourceFileName: 'never',
  proposedCats: 'never',
  proposedClinics: 'never',
  proposedVisits: 'never',
  proposedVaccinations: 'never',
  proposedPreventives: 'never',
  proposedWeightEntries: 'never',
  proposedSymptoms: 'never',
  proposedConditions: 'never',
  proposedExpenses: 'never',
  proposedRecordType: 'never',
  suggestKeepAsRecord: 'never',
  confidence: 'never',
  matchedCatIds: 'never',
  matchedClinicIds: 'never',
  matchedVisitIds: 'never',
  matchedVaccinationIds: 'never',
  matchedPreventiveIds: 'never',
  likelyDuplicateWeightEntries: 'never',
  likelyDuplicateSymptoms: 'never',
  likelyDuplicateVaccinations: 'never',
  likelyDuplicatePreventives: 'never',
  likelyDuplicateExpenses: 'never',
  matchedLibraryConditionIds: 'never',
  matchedCatConditionIds: 'never',
  createdBy: 'never',
  createdAt: 'never',
} satisfies Record<keyof IngestionDraft, ShareDecision>;

const CUSTOM_SYMPTOM_QUICK_TAG_FIELDS = {
  id: 'notUseful',
  householdId: 'notUseful',
  label: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
} satisfies Record<keyof CustomSymptomQuickTag, ShareDecision>;

const SYMPTOM_FIELDS = {
  id: 'notUseful',
  catId: 'notUseful',
  description: 'notUseful',
  quickTags: 'notUseful',
  firstNoticedAt: 'notUseful',
  severity: 'notUseful',
  linkedVisitIds: 'notUseful',
  linkedConditionId: 'notUseful',
  resolvedAt: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'notUseful',
} satisfies Record<keyof Symptom, ShareDecision>;

const LIBRARY_CONDITION_FIELDS = {
  id: 'notUseful',
  name: 'notUseful',
  category: 'notUseful',
  description: 'notUseful',
  source: 'notUseful',
  sourceRef: 'notUseful',
  createdAt: 'notUseful',
} satisfies Record<keyof LibraryCondition, ShareDecision>;

const CAT_CONDITION_FIELDS = {
  id: 'notUseful',
  catId: 'shared',
  source: 'notUseful',
  libraryConditionId: 'notUseful',
  name: 'shared',
  category: 'notUseful',
  status: 'shared',
  occurredAt: 'notUseful',
  resolvedAt: 'notUseful',
  description: 'notUseful',
  linkedVisitIds: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
} satisfies Record<keyof CatCondition, ShareDecision>;

/** What nine-lives lets Helm read, per stored field; an added, removed or renamed field fails the typecheck until it is decided here. */
export const SHARE_FIELDS = {
  Household: HOUSEHOLD_FIELDS,
  PendingHouseholdRequest: PENDING_HOUSEHOLD_REQUEST_FIELDS,
  CatKeyDate: CAT_KEY_DATE_FIELDS,
  CatLink: CAT_LINK_FIELDS,
  CatDiet: CAT_DIET_FIELDS,
  CatInsurance: CAT_INSURANCE_FIELDS,
  CatShelterOrigin: CAT_SHELTER_ORIGIN_FIELDS,
  Cat: CAT_FIELDS,
  VetClinic: VET_CLINIC_FIELDS,
  Doctor: DOCTOR_FIELDS,
  HealthRecord: HEALTH_RECORD_FIELDS,
  CustomHealthRecordType: CUSTOM_HEALTH_RECORD_TYPE_FIELDS,
  Visit: VISIT_FIELDS,
  VaccinationDose: VACCINATION_DOSE_FIELDS,
  Vaccination: VACCINATION_FIELDS,
  PreventiveDose: PREVENTIVE_DOSE_FIELDS,
  Preventive: PREVENTIVE_FIELDS,
  CustomPreventiveProduct: CUSTOM_PREVENTIVE_PRODUCT_FIELDS,
  CustomPreventiveType: CUSTOM_PREVENTIVE_TYPE_FIELDS,
  WeightEntry: WEIGHT_ENTRY_FIELDS,
  LitterBox: LITTER_BOX_FIELDS,
  CustomLitterType: CUSTOM_LITTER_TYPE_FIELDS,
  Litter: LITTER_FIELDS,
  LitterEntry: LITTER_ENTRY_FIELDS,
  ExpenseLineItem: EXPENSE_LINE_ITEM_FIELDS,
  Expense: EXPENSE_FIELDS,
  IngestionDraft: INGESTION_DRAFT_FIELDS,
  CustomSymptomQuickTag: CUSTOM_SYMPTOM_QUICK_TAG_FIELDS,
  Symptom: SYMPTOM_FIELDS,
  LibraryCondition: LIBRARY_CONDITION_FIELDS,
  CatCondition: CAT_CONDITION_FIELDS,
};

/** Exported types that are not stored, so have no fields to decide. */
export const NOT_STORED: Record<string, string> = {};

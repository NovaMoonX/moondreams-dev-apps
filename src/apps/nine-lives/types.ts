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

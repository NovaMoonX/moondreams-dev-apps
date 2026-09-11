export interface PendingHouseholdMember {
  uid: string;
  requestedAt: number;
}

export interface Household {
  id: string;
  name: string;
  members: string[];
  inviteCode: string | null;
  pendingMembers: PendingHouseholdMember[];
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export type CatLifestyle = 'indoor' | 'outdoor' | 'indoor_outdoor';

export interface CatKeyDate {
  label: string;
  date: number;
}

export type CatFoodType = 'dry' | 'wet' | 'mixed';

export interface CatDiet {
  foodType?: CatFoodType;
  brand?: string;
  feedingsPerDay?: number;
  usesAutomaticFeeder?: boolean;
  treats?: string;
  notes?: string;
}

export interface CatInsurance {
  provider: string;
  policyNumber: string;
  monthlyPremium?: number;
  coverageStartDate?: number;
  coverageNotes?: string;
}

export interface CatShelterOrigin {
  name: string;
  address?: string;
}

export interface Cat {
  id: string;
  householdId: string;
  name: string;
  photoURL?: string;
  dateOfBirth: number;
  isDateOfBirthEstimated: boolean;
  breed: string;
  lifestyle?: CatLifestyle;
  microchipNumber?: string;
  shelterOrigin?: CatShelterOrigin;
  adoptedAt?: number;
  customKeyDates?: CatKeyDate[];
  diet?: CatDiet;
  currentClinicId?: string;
  insurance?: CatInsurance;
  personalityTraits?: string[];
  notes?: string;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface VetClinic {
  id: string;
  householdId: string;
  name: string;
  phone?: string;
  address?: string;
  isEmergency24Hour?: boolean;
  notes?: string;
  createdAt: number;
  lastEditedAt: number;
}

export interface Doctor {
  id: string;
  householdId: string;
  clinicId: string;
  name: string;
  notes?: string;
  createdAt: number;
}

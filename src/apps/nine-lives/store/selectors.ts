import type { RootState } from '@/store';

import { calculateLifetimeExpenseTotal, calculateMonthlyExpenseTotal } from '../utils/budgetCalculators';

export const selectCatsByHousehold = (householdId: string | null | undefined) => (state: RootState) =>
  householdId
    ? state.nineLives.cats.items.filter((cat) => cat.householdId === householdId)
    : [];

export const selectClinicsByHousehold = (householdId: string | null | undefined) => (state: RootState) =>
  householdId
    ? state.nineLives.vetClinics.items.filter((clinic) => clinic.householdId === householdId)
    : [];

export const selectDoctorsByHousehold = (householdId: string | null | undefined) => (state: RootState) =>
  householdId
    ? state.nineLives.doctors.items.filter((doctor) => doctor.householdId === householdId)
    : [];

export const selectDoctorsByClinic =
  (householdId: string | null | undefined, clinicId: string) => (state: RootState) =>
    householdId
      ? state.nineLives.doctors.items.filter(
          (doctor) => doctor.householdId === householdId && doctor.clinicId === clinicId,
        )
      : [];

export const selectVaccinationsByCat = (catId: string | null | undefined) => (state: RootState) =>
  catId ? state.nineLives.vaccinations.items.filter((vaccination) => vaccination.catId === catId) : [];

export const selectSymptomsByCat = (catId: string | null | undefined) => (state: RootState) =>
  catId ? state.nineLives.symptoms.items.filter((symptom) => symptom.catId === catId) : [];

export const selectWeightEntriesByCat = (catId: string | null | undefined) => (state: RootState) =>
  catId ? state.nineLives.weightEntries.items.filter((entry) => entry.catId === catId) : [];

export const selectExpensesByCat = (catId: string | null | undefined) => (state: RootState) =>
  catId ? state.nineLives.expenses.items.filter((expense) => expense.catId === catId) : [];

export const selectExpensesByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.expenses.items.filter((expense) => expense.householdId === householdId)
      : [];

export const selectMonthlyExpenseTotalByHousehold = (
  householdId: string | null | undefined,
) => (state: RootState): number =>
  calculateMonthlyExpenseTotal(selectExpensesByHousehold(householdId)(state));

export const selectLifetimeExpenseTotalByHousehold = (
  householdId: string | null | undefined,
) => (state: RootState): number =>
  calculateLifetimeExpenseTotal(selectExpensesByHousehold(householdId)(state));

export const selectConditionLibrary = (state: RootState) => state.nineLives.conditionLibrary.items;

export const selectConditionsByCat = (catId: string | null | undefined) => (state: RootState) =>
  catId ? state.nineLives.catConditions.items.filter((condition) => condition.catId === catId) : [];

export const selectVisitsByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.visits.items.filter((visit) => visit.householdId === householdId)
      : [];

export const selectVisitsByCat = (catId: string | null | undefined) => (state: RootState) =>
  catId ? state.nineLives.visits.items.filter((visit) => visit.catIds.includes(catId)) : [];

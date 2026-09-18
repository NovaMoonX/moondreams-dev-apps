import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';

import {
  calculateLifetimeExpenseTotal,
  calculateRecurringMonthlyTotal,
  calculateRecurringYearlyTotal,
} from '../utils/budgetCalculators';

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

/** Sorted oldest-first, so the list reads as a queue and "resume" always means the longest-unfinished one first. */
export const selectIngestionDraftsByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? [...state.nineLives.ingestionDrafts.items]
          .filter((draft) => draft.householdId === householdId)
          .sort((a, b) => a.createdAt - b.createdAt)
      : [];

/** A primitive, so callers that only need the count avoid re-rendering on unrelated draft-field edits. */
export const selectIngestionDraftCountByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.ingestionDrafts.items.filter((draft) => draft.householdId === householdId).length
      : 0;

export const selectDoctorsByClinic =
  (householdId: string | null | undefined, clinicId: string) => (state: RootState) =>
    householdId
      ? state.nineLives.doctors.items.filter(
          (doctor) => doctor.householdId === householdId && doctor.clinicId === clinicId,
        )
      : [];

export const selectCustomHealthRecordTypesByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.customHealthRecordTypes.items.filter(
          (type) => type.householdId === householdId,
        )
      : [];

export const selectVaccinationsByCat = (catId: string | null | undefined) => (state: RootState) =>
  catId ? state.nineLives.vaccinations.items.filter((vaccination) => vaccination.catId === catId) : [];

export const selectVaccinationsByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.vaccinations.items.filter(
          (vaccination) => vaccination.householdId === householdId,
        )
      : [];

export const selectPreventivesByCat = (catId: string | null | undefined) => (state: RootState) =>
  catId
    ? state.nineLives.preventives.items.filter((preventive) => preventive.catIds.includes(catId))
    : [];

export const selectPreventivesByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.preventives.items.filter(
          (preventive) => preventive.householdId === householdId,
        )
      : [];

export const selectCustomPreventiveProductsByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.customPreventiveProducts.items.filter(
          (product) => product.householdId === householdId,
        )
      : [];

export const selectCustomPreventiveTypesByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.customPreventiveTypes.items.filter(
          (type) => type.householdId === householdId,
        )
      : [];

export const selectCustomSymptomQuickTagsByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.customSymptomQuickTags.items.filter(
          (tag) => tag.householdId === householdId,
        )
      : [];

export const selectSymptomsByCat = (catId: string | null | undefined) => (state: RootState) =>
  catId ? state.nineLives.symptoms.items.filter((symptom) => symptom.catId === catId) : [];

export const selectWeightEntriesByCat = (catId: string | null | undefined) => (state: RootState) =>
  catId ? state.nineLives.weightEntries.items.filter((entry) => entry.catId === catId) : [];

export const selectHealthRecordsByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.healthRecords.items.filter(
          (record) => record.householdId === householdId,
        )
      : [];

export const selectExpensesByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.expenses.items.filter((expense) => expense.householdId === householdId)
      : [];

export const selectLitterEntriesByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.litterEntries.items.filter((entry) => entry.householdId === householdId)
      : [];

export const selectLitterBoxesByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.litterBoxes.items.filter((box) => box.householdId === householdId)
      : [];

export const selectLittersByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.litters.items.filter((litter) => litter.householdId === householdId)
      : [];

export const selectCustomLitterTypesByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.customLitterTypes.items.filter(
          (type) => type.householdId === householdId,
        )
      : [];

export interface ExpenseTotals {
  recurringMonthly: number;
  recurringYearly: number;
  lifetime: number;
}

const selectExpenseItems = (state: RootState) => state.nineLives.expenses.items;

/**
 * Creates a memoized selector for one household's expense totals — recompute only happens
 * when `expenses.items` actually changes, not on every unrelated render. Callers must build
 * the selector once per householdId (e.g. `useMemo(() => makeSelectExpenseTotalsByHousehold(householdId), [householdId])`)
 * and reuse that instance, since each call here returns a fresh selector with its own cache.
 */
export const makeSelectExpenseTotalsByHousehold = (
  householdId: string | null | undefined,
  catId?: string | null,
) =>
  createSelector([selectExpenseItems], (items): ExpenseTotals => {
    const expenses = householdId
      ? items.filter(
          (expense) => expense.householdId === householdId && (!catId || expense.catIds.includes(catId)),
        )
      : [];

    return {
      recurringMonthly: calculateRecurringMonthlyTotal(expenses),
      recurringYearly: calculateRecurringYearlyTotal(expenses),
      lifetime: calculateLifetimeExpenseTotal(expenses),
    };
  });

export const selectConditionLibrary = (state: RootState) => state.nineLives.conditionLibrary.items;

export const selectConditionsByCat = (catId: string | null | undefined) => (state: RootState) =>
  catId ? state.nineLives.catConditions.items.filter((condition) => condition.catId === catId) : [];

export const selectCatConditionsByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.catConditions.items.filter((condition) =>
          state.nineLives.cats.items.some(
            (cat) => cat.householdId === householdId && cat.id === condition.catId,
          ),
        )
      : [];

export const selectVisitsByHousehold =
  (householdId: string | null | undefined) => (state: RootState) =>
    householdId
      ? state.nineLives.visits.items.filter((visit) => visit.householdId === householdId)
      : [];

export const selectVisitsByCat = (catId: string | null | undefined) => (state: RootState) =>
  catId ? state.nineLives.visits.items.filter((visit) => visit.catIds.includes(catId)) : [];

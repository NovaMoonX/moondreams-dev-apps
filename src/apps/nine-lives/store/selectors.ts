import type { RootState } from '@/store';

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

export const selectWeightEntriesByCat = (catId: string | null | undefined) => (state: RootState) =>
  catId ? state.nineLives.weightEntries.items.filter((entry) => entry.catId === catId) : [];

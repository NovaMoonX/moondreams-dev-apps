import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { RootState } from '@/store';
import type { Doctor } from '@apps/nine-lives/types';

export type DoctorsState = OptimisticCollectionState<Doctor>;

export const doctorsSlice = createOptimisticCollectionSlice<Doctor>(
  'nineLives/doctors',
);

export const {
  setAll: setDoctors,
  upsertOneOptimistic: upsertDoctor,
  removeOneOptimistic: removeDoctor,
  revertOne: revertDoctor,
} = doctorsSlice.actions;

export const doctorsReducer = doctorsSlice.reducer;

export const selectDoctorsForClinic = (state: RootState, clinicId: string) =>
  state.nineLives.doctors.items.filter((doctor) => doctor.clinicId === clinicId);

export default doctorsReducer;

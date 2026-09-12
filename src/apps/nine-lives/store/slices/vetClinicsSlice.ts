import {
  createOptimisticCollectionSlice,
  type OptimisticCollectionState,
} from '@/store/utils/createOptimisticCollectionSlice';

import type { RootState } from '@/store';
import type { VetClinic } from '@apps/nine-lives/types';

export type VetClinicsState = OptimisticCollectionState<VetClinic>;

export const vetClinicsSlice = createOptimisticCollectionSlice<VetClinic>(
  'nineLives/vetClinics',
);

export const {
  setAll: setVetClinics,
  upsertOneOptimistic: upsertVetClinic,
  removeOneOptimistic: removeVetClinic,
  revertOne: revertVetClinic,
} = vetClinicsSlice.actions;

export const vetClinicsReducer = vetClinicsSlice.reducer;

export const selectVetClinicsForHousehold = (
  state: RootState,
  householdId: string,
) =>
  state.nineLives.vetClinics.items.filter(
    (clinic) => clinic.householdId === householdId,
  );

export default vetClinicsReducer;

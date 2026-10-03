import type { RootState } from '@/store';

export const selectMembership = (state: RootState) =>
  state.aList.membership.membership;

export const selectMembershipLoadError = (state: RootState) =>
  state.aList.membership.loadError;

export const selectIsAListLoaded = (state: RootState) =>
  state.aList.membership.isLoaded;

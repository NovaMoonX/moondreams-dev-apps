import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { HelmProfile } from '@apps/helm/types';

export interface HelmState {
  /** The profile, and whether the first snapshot has arrived, so a missing profile is never mistaken for one still loading. */
  profile: HelmProfile | null;
  isProfileLoaded: boolean;
  /** The uid the profile belongs to, so a person's profile never shows for another. */
  uid: string | null;
}

const initialState: HelmState = {
  profile: null,
  isProfileLoaded: false,
  uid: null,
};

const helmSlice = createSlice({
  name: 'helm',
  initialState,
  reducers: {
    setProfile: (
      state,
      action: PayloadAction<{ uid: string; profile: HelmProfile | null }>,
    ) => {
      state.uid = action.payload.uid;
      state.profile = action.payload.profile;
      state.isProfileLoaded = true;
    },
    clearHelm: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setProfile, clearHelm } = helmSlice.actions;
export const helmReducer = helmSlice.reducer;

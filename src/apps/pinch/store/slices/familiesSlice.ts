import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Family } from '@apps/pinch/types';

export interface FamiliesState {
  items: Family[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: FamiliesState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const familiesSlice = createSlice({
  name: 'pinch/families',
  initialState,
  reducers: {
    setFamilies(state, action: PayloadAction<Family[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setFamiliesLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearFamilies: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setFamilies, setFamiliesLoadError, clearFamilies } =
  familiesSlice.actions;
export const familiesReducer = familiesSlice.reducer;

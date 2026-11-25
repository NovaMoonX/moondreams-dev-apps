import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { PinchOutsideChange } from '@apps/pinch/types';

export interface OutsideChangesState {
  items: PinchOutsideChange[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: OutsideChangesState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const outsideChangesSlice = createSlice({
  name: 'pinch/outsideChanges',
  initialState,
  reducers: {
    setOutsideChanges(state, action: PayloadAction<PinchOutsideChange[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setOutsideChangesLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearOutsideChanges: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const {
  setOutsideChanges,
  setOutsideChangesLoadError,
  clearOutsideChanges,
} = outsideChangesSlice.actions;
export const outsideChangesReducer = outsideChangesSlice.reducer;

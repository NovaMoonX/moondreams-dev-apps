import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Cook } from '@apps/pinch/types';

export interface CooksState {
  items: Cook[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: CooksState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const cooksSlice = createSlice({
  name: 'pinch/cooks',
  initialState,
  reducers: {
    setCooks(state, action: PayloadAction<Cook[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setCooksLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearCooks: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setCooks, setCooksLoadError, clearCooks } = cooksSlice.actions;
export const cooksReducer = cooksSlice.reducer;

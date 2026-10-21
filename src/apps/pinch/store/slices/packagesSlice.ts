import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Package } from '@apps/pinch/types';

export interface PackagesState {
  items: Package[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: PackagesState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const packagesSlice = createSlice({
  name: 'pinch/packages',
  initialState,
  reducers: {
    setPackages(state, action: PayloadAction<Package[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setPackagesLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearPackages: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setPackages, setPackagesLoadError, clearPackages } =
  packagesSlice.actions;
export const packagesReducer = packagesSlice.reducer;

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Store } from '@apps/pinch/types';

export interface StoresState {
  items: Store[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: StoresState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const storesSlice = createSlice({
  name: 'pinch/stores',
  initialState,
  reducers: {
    setStores(state, action: PayloadAction<Store[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setStoresLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearStores: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setStores, setStoresLoadError, clearStores } =
  storesSlice.actions;
export const storesReducer = storesSlice.reducer;

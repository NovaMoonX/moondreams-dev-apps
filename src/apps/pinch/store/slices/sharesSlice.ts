import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { PinchShare } from '@apps/pinch/types';

export interface SharesState {
  items: PinchShare[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: SharesState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const sharesSlice = createSlice({
  name: 'pinch/shares',
  initialState,
  reducers: {
    setShares(state, action: PayloadAction<PinchShare[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setSharesLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearShares: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setShares, setSharesLoadError, clearShares } =
  sharesSlice.actions;
export const sharesReducer = sharesSlice.reducer;

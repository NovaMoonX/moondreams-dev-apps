import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { PinchSettings } from '@apps/pinch/types';

export interface PinchSettingsState {
  /** Null until the person's first change; the app uses the defaults meanwhile. */
  settings: PinchSettings | null;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: PinchSettingsState = {
  settings: null,
  isLoaded: false,
  loadError: null,
};

export const pinchSettingsSlice = createSlice({
  name: 'pinch/pinchSettings',
  initialState,
  reducers: {
    setPinchSettings(state, action: PayloadAction<PinchSettings | null>) {
      state.settings = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setPinchSettingsLoadError(state, action: PayloadAction<string>) {
      state.settings = null;
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearPinchSettings: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const {
  setPinchSettings,
  setPinchSettingsLoadError,
  clearPinchSettings,
} = pinchSettingsSlice.actions;
export const pinchSettingsReducer = pinchSettingsSlice.reducer;

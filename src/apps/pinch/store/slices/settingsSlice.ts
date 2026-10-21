import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { KitchenSettings } from '@apps/pinch/types';

export interface SettingsState {
  /** Null until the person's first change; the app uses the defaults meanwhile. */
  settings: KitchenSettings | null;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: SettingsState = {
  settings: null,
  isLoaded: false,
  loadError: null,
};

export const settingsSlice = createSlice({
  name: 'pinch/settings',
  initialState,
  reducers: {
    setSettings(state, action: PayloadAction<KitchenSettings | null>) {
      state.settings = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setSettingsLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearSettings: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setSettings, setSettingsLoadError, clearSettings } =
  settingsSlice.actions;
export const settingsReducer = settingsSlice.reducer;

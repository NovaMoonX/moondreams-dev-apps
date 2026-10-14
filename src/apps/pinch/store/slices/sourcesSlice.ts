import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Source } from '@apps/pinch/types';

export interface SourcesState {
  items: Source[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: SourcesState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const sourcesSlice = createSlice({
  name: 'pinch/sources',
  initialState,
  reducers: {
    setSources(state, action: PayloadAction<Source[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setSourcesLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearSources: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setSources, setSourcesLoadError, clearSources } =
  sourcesSlice.actions;
export const sourcesReducer = sourcesSlice.reducer;

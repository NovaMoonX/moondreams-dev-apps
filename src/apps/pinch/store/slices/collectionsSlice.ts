import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Collection } from '@apps/pinch/types';

export interface CollectionsState {
  items: Collection[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: CollectionsState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const collectionsSlice = createSlice({
  name: 'pinch/collections',
  initialState,
  reducers: {
    setCollections(state, action: PayloadAction<Collection[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setCollectionsLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearCollections: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setCollections, setCollectionsLoadError, clearCollections } =
  collectionsSlice.actions;
export const collectionsReducer = collectionsSlice.reducer;

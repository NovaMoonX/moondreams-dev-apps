import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Idea } from '@apps/pinch/types';

export interface IdeasState {
  items: Idea[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: IdeasState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const ideasSlice = createSlice({
  name: 'pinch/ideas',
  initialState,
  reducers: {
    setIdeas(state, action: PayloadAction<Idea[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setIdeasLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearIdeas: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setIdeas, setIdeasLoadError, clearIdeas } = ideasSlice.actions;
export const ideasReducer = ideasSlice.reducer;

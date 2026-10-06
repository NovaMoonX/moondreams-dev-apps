import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { AListTheatre } from '@apps/a-list/types';

export interface TheatresState {
  items: AListTheatre[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: TheatresState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const theatresSlice = createSlice({
  name: 'aList/theatres',
  initialState,
  reducers: {
    setTheatres(state, action: PayloadAction<AListTheatre[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setTheatresLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearTheatres: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setTheatres, setTheatresLoadError, clearTheatres } =
  theatresSlice.actions;
export const theatresReducer = theatresSlice.reducer;

export default theatresReducer;

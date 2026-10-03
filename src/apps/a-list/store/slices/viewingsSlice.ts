import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Viewing } from '@apps/a-list/types';

export interface ViewingsState {
  items: Viewing[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: ViewingsState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const viewingsSlice = createSlice({
  name: 'aList/viewings',
  initialState,
  reducers: {
    setViewings(state, action: PayloadAction<Viewing[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setViewingsLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearViewings: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setViewings, setViewingsLoadError, clearViewings } =
  viewingsSlice.actions;
export const viewingsReducer = viewingsSlice.reducer;

export default viewingsReducer;

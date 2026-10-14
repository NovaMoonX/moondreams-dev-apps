import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { RecipeNote } from '@apps/pinch/types';

export interface NotesState {
  items: RecipeNote[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: NotesState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const notesSlice = createSlice({
  name: 'pinch/notes',
  initialState,
  reducers: {
    setNotes(state, action: PayloadAction<RecipeNote[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setNotesLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearNotes: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setNotes, setNotesLoadError, clearNotes } = notesSlice.actions;
export const notesReducer = notesSlice.reducer;

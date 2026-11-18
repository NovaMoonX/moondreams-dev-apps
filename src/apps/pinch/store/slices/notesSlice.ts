import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { pinchHeldActions } from '@apps/pinch/store/heldLists';
import type { RecipeNote } from '@apps/pinch/types';

export interface NotesState {
  items: RecipeNote[];
  hold: HeldList<RecipeNote>;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: NotesState = {
  items: [],
  hold: emptyHeldList<RecipeNote>(),
  isLoaded: false,
  loadError: null,
};

const belongs = () => true;

export const notesSlice = createSlice({
  name: 'pinch/notes',
  initialState,
  reducers: {
    setNotes(state, action: PayloadAction<RecipeNote[]>) {
      state.items = deliverHeld(state.hold, action.payload, belongs);
      state.isLoaded = true;
      state.loadError = null;
    },
    setNotesLoadError(state, action: PayloadAction<string>) {
      state.hold = emptyHeldList();
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearNotes: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<RecipeNote, NotesState>(builder, pinchHeldActions, 'notes', {
      belongs,
      show: (state, list) => {
        state.items = list;
      },
      accepts: (state) => state.loadError === null,
    });
  },
});

export const { setNotes, setNotesLoadError, clearNotes } = notesSlice.actions;
export const notesReducer = notesSlice.reducer;

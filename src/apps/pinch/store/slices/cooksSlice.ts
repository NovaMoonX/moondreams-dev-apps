import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@apps/pinch/store/heldLists';
import type { Cook } from '@apps/pinch/types';

export interface CooksState {
  items: Cook[];
  hold: HeldList<Cook>;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: CooksState = {
  items: [],
  hold: emptyHeldList<Cook>(),
  isLoaded: false,
  loadError: null,
};

const belongs = () => true;

export const cooksSlice = createSlice({
  name: 'pinch/cooks',
  initialState,
  reducers: {
    setCooks(state, action: PayloadAction<Cook[]>) {
      state.items = deliverHeld(state.hold, action.payload, belongs);
      state.isLoaded = true;
      state.loadError = null;
    },
    setCooksLoadError(state, action: PayloadAction<string>) {
      state.hold = emptyHeldList();
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearCooks: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<Cook, CooksState>(builder, 'cooks', belongs, (state, list) => {
      state.items = list;
    });
  },
});

export const { setCooks, setCooksLoadError, clearCooks } = cooksSlice.actions;
export const cooksReducer = cooksSlice.reducer;

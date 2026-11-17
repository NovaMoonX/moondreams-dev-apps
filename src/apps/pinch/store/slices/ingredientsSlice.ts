import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@apps/pinch/store/heldLists';
import type { IngredientRecord } from '@apps/pinch/types';

export interface IngredientsState {
  records: IngredientRecord[];
  hold: HeldList<IngredientRecord>;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: IngredientsState = {
  records: [],
  hold: emptyHeldList<IngredientRecord>(),
  isLoaded: false,
  loadError: null,
};

const belongs = () => true;

export const ingredientsSlice = createSlice({
  name: 'pinch/ingredients',
  initialState,
  reducers: {
    setIngredients(state, action: PayloadAction<IngredientRecord[]>) {
      state.records = deliverHeld(state.hold, action.payload, belongs);
      state.isLoaded = true;
      state.loadError = null;
    },
    setIngredientsLoadError(state, action: PayloadAction<string>) {
      state.hold = emptyHeldList();
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearIngredients: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<IngredientRecord, IngredientsState>(
      builder,
      'ingredients',
      belongs,
      (state, list) => {
        state.records = list;
      },
    );
  },
});

export const { setIngredients, setIngredientsLoadError, clearIngredients } =
  ingredientsSlice.actions;
export const ingredientsReducer = ingredientsSlice.reducer;

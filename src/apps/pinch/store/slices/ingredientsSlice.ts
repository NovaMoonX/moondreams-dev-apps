import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { IngredientRecord } from '@apps/pinch/types';

export interface IngredientsState {
  records: IngredientRecord[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: IngredientsState = {
  records: [],
  isLoaded: false,
  loadError: null,
};

export const ingredientsSlice = createSlice({
  name: 'pinch/ingredients',
  initialState,
  reducers: {
    setIngredients(state, action: PayloadAction<IngredientRecord[]>) {
      state.records = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setIngredientsLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearIngredients: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setIngredients, setIngredientsLoadError, clearIngredients } =
  ingredientsSlice.actions;
export const ingredientsReducer = ingredientsSlice.reducer;

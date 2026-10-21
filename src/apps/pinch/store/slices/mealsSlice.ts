import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Meal } from '@apps/pinch/types';

export interface MealsState {
  items: Meal[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: MealsState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const mealsSlice = createSlice({
  name: 'pinch/meals',
  initialState,
  reducers: {
    setMeals(state, action: PayloadAction<Meal[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setMealsLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearMeals: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setMeals, setMealsLoadError, clearMeals } = mealsSlice.actions;
export const mealsReducer = mealsSlice.reducer;

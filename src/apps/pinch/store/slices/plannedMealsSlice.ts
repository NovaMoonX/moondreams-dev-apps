import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { PlannedMeal } from '@apps/pinch/types';

export interface PlannedMealsState {
  items: PlannedMeal[];
  /** The month the loaded window is centred on. */
  windowKey: string | null;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: PlannedMealsState = {
  items: [],
  windowKey: null,
  isLoaded: false,
  loadError: null,
};

export const plannedMealsSlice = createSlice({
  name: 'pinch/plannedMeals',
  initialState,
  reducers: {
    setPlannedMeals(
      state,
      action: PayloadAction<{ windowKey: string; items: PlannedMeal[] }>,
    ) {
      state.items = action.payload.items;
      state.windowKey = action.payload.windowKey;
      state.isLoaded = true;
      state.loadError = null;
    },
    setPlannedMealsLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearPlannedMeals: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setPlannedMeals, setPlannedMealsLoadError, clearPlannedMeals } =
  plannedMealsSlice.actions;
export const plannedMealsReducer = plannedMealsSlice.reducer;

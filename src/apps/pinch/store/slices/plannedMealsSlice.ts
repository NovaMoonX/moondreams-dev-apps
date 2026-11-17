import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@apps/pinch/store/heldLists';
import type { PlannedMeal } from '@apps/pinch/types';
import { getMonthWindow } from '@apps/pinch/utils/dayKeys';

export interface PlannedMealsState {
  items: PlannedMeal[];
  hold: HeldList<PlannedMeal>;
  /** The month the loaded window is centred on. */
  windowKey: string | null;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: PlannedMealsState = {
  items: [],
  hold: emptyHeldList<PlannedMeal>(),
  windowKey: null,
  isLoaded: false,
  loadError: null,
};

const isInWindow = (meal: PlannedMeal, windowKey: string | null) => {
  if (windowKey === null) return false;
  const { start, end } = getMonthWindow(windowKey);
  return meal.date >= start && meal.date < end;
};

export const plannedMealsSlice = createSlice({
  name: 'pinch/plannedMeals',
  initialState,
  reducers: {
    setPlannedMeals(
      state,
      action: PayloadAction<{ windowKey: string; items: PlannedMeal[] }>,
    ) {
      const { windowKey, items } = action.payload;
      state.windowKey = windowKey;
      state.items = deliverHeld(state.hold, items, (meal) =>
        isInWindow(meal, windowKey),
      );
      state.isLoaded = true;
      state.loadError = null;
    },
    setPlannedMealsLoadError(state, action: PayloadAction<string>) {
      state.hold = emptyHeldList();
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearPlannedMeals: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<PlannedMeal, PlannedMealsState>(
      builder,
      'plannedMeals',
      (meal, state) => isInWindow(meal, state.windowKey),
      (state, list) => {
        state.items = list;
      },
    );
  },
});

export const { setPlannedMeals, setPlannedMealsLoadError, clearPlannedMeals } =
  plannedMealsSlice.actions;
export const plannedMealsReducer = plannedMealsSlice.reducer;

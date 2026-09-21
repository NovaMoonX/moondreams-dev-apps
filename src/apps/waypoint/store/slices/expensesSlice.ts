import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { TripExpense } from '@apps/waypoint/types';

export interface ExpensesState {
  items: TripExpense[];
  tripId: string | null;
  loaded: boolean;
}

const initialState: ExpensesState = {
  items: [],
  tripId: null,
  loaded: false,
};

export const expensesSlice = createSlice({
  name: 'waypoint/expenses',
  initialState,
  reducers: {
    setExpenses(
      state,
      action: PayloadAction<{ tripId: string; expenses: TripExpense[] }>,
    ) {
      state.tripId = action.payload.tripId;
      state.items = action.payload.expenses;
      state.loaded = true;
    },
    clearExpenses(state) {
      state.items = [];
      state.tripId = null;
      state.loaded = false;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setExpenses, clearExpenses } = expensesSlice.actions;
export const expensesReducer = expensesSlice.reducer;

export default expensesReducer;

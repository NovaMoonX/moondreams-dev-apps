import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { PersonalExpense } from '@apps/waypoint/types';

export interface PersonalExpensesState {
  items: PersonalExpense[];
  tripId: string | null;
}

const initialState: PersonalExpensesState = {
  items: [],
  tripId: null,
};

export const personalExpensesSlice = createSlice({
  name: 'waypoint/personalExpenses',
  initialState,
  reducers: {
    setPersonalExpenses(
      state,
      action: PayloadAction<{ tripId: string; expenses: PersonalExpense[] }>,
    ) {
      state.tripId = action.payload.tripId;
      state.items = action.payload.expenses;
    },
    clearPersonalExpenses(state) {
      state.items = [];
      state.tripId = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setPersonalExpenses, clearPersonalExpenses } = personalExpensesSlice.actions;
export const personalExpensesReducer = personalExpensesSlice.reducer;

export default personalExpensesReducer;

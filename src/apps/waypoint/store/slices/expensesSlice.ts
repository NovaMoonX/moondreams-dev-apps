import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { waypointHeldActions } from '@apps/waypoint/store/heldLists';
import type { TripExpense } from '@apps/waypoint/types';

export interface ExpensesState {
  items: TripExpense[];
  hold: HeldList<TripExpense>;
  tripId: string | null;
  loaded: boolean;
}

const belongs = () => true;

const initialState: ExpensesState = {
  items: [],
  hold: emptyHeldList<TripExpense>(),
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
      if (action.payload.tripId !== state.tripId) {
        state.hold = emptyHeldList();
      }
      state.tripId = action.payload.tripId;
      state.items = deliverHeld(state.hold, action.payload.expenses, belongs);
      state.loaded = true;
    },
    clearExpenses(state) {
      state.items = [];
      state.hold = emptyHeldList();
      state.tripId = null;
      state.loaded = false;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<TripExpense, ExpensesState>(
      builder,
      waypointHeldActions,
      'expenses',
      {
        belongs,
        show: (state, list) => {
          state.items = list;
        },
        accepts: (state, scope) => state.loaded && state.tripId === scope,
      },
    );
  },
});

export const { setExpenses, clearExpenses } = expensesSlice.actions;
export const expensesReducer = expensesSlice.reducer;

export default expensesReducer;

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { CalendarShare } from '@apps/a-list/types';

export interface CalendarSharesState {
  items: CalendarShare[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: CalendarSharesState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const calendarSharesSlice = createSlice({
  name: 'aList/calendarShares',
  initialState,
  reducers: {
    setCalendarShares(state, action: PayloadAction<CalendarShare[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setCalendarSharesLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearCalendarShares: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const {
  setCalendarShares,
  setCalendarSharesLoadError,
  clearCalendarShares,
} = calendarSharesSlice.actions;
export const calendarSharesReducer = calendarSharesSlice.reducer;

export default calendarSharesReducer;

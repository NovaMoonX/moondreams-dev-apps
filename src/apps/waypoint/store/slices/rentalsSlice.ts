import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Rental } from '@apps/waypoint/types';

export interface RentalsState {
  tripId: string | null;
  items: Rental[];
  loaded: boolean;
}

const initialState: RentalsState = {
  tripId: null,
  items: [],
  loaded: false,
};

export const rentalsSlice = createSlice({
  name: 'waypoint/rentals',
  initialState,
  reducers: {
    setRentals(state, action: PayloadAction<{ tripId: string; rentals: Rental[] }>) {
      state.tripId = action.payload.tripId;
      state.items = action.payload.rentals;
      state.loaded = true;
    },
    clearRentals: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setRentals, clearRentals } = rentalsSlice.actions;
export const rentalsReducer = rentalsSlice.reducer;

export default rentalsReducer;

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { TripSpace } from '@apps/waypoint/types';

export interface TripState {
  items: TripSpace[];
  loaded: boolean;
}

const initialState: TripState = {
  items: [],
  loaded: false,
};

export const tripSlice = createSlice({
  name: 'waypoint/trip',
  initialState,
  reducers: {
    setTrips(state, action: PayloadAction<TripSpace[]>) {
      state.items = action.payload;
      state.loaded = true;
    },
    upsertTrip(state, action: PayloadAction<TripSpace>) {
      const existingIndex = state.items.findIndex(
        (trip) => trip.id === action.payload.id,
      );

      if (existingIndex >= 0) {
        state.items[existingIndex] = action.payload;
        return;
      }

      state.items.push(action.payload);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setTrips, upsertTrip } = tripSlice.actions;
export const tripReducer = tripSlice.reducer;

export default tripReducer;

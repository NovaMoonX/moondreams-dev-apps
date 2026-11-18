import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { waypointHeldActions } from '@apps/waypoint/store/heldLists';
import type { TripSpace } from '@apps/waypoint/types';

export interface TripState {
  items: TripSpace[];
  hold: HeldList<TripSpace>;
  loaded: boolean;
}

const belongs = () => true;

const initialState: TripState = {
  items: [],
  hold: emptyHeldList<TripSpace>(),
  loaded: false,
};

export const tripSlice = createSlice({
  name: 'waypoint/trip',
  initialState,
  reducers: {
    setTrips(state, action: PayloadAction<TripSpace[]>) {
      state.items = deliverHeld(state.hold, action.payload, belongs);
      state.loaded = true;
    },
    upsertTrip(state, action: PayloadAction<TripSpace>) {
      const existingIndex = state.items.findIndex(
        (trip) => trip.id === action.payload.id,
      );

      if (existingIndex >= 0) {
        state.items[existingIndex] = action.payload;
      } else {
        state.items.push(action.payload);
      }

      const heldIndex = state.hold.incoming.findIndex(
        (trip) => trip.id === action.payload.id,
      );
      if (heldIndex >= 0) {
        state.hold.incoming[heldIndex] = action.payload;
      } else {
        state.hold.incoming.push(action.payload);
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<TripSpace, TripState>(builder, waypointHeldActions, 'trips', {
      belongs,
      show: (state, list) => {
        state.items = list;
      },
      accepts: (state) => state.loaded,
    });
  },
});

export const { setTrips, upsertTrip } = tripSlice.actions;
export const tripReducer = tripSlice.reducer;

export default tripReducer;

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { waypointHeldActions } from '@apps/waypoint/store/heldLists';
import type { Rental } from '@apps/waypoint/types';

export interface RentalsState {
  tripId: string | null;
  items: Rental[];
  hold: HeldList<Rental>;
  loaded: boolean;
}

const belongs = () => true;

const initialState: RentalsState = {
  tripId: null,
  items: [],
  hold: emptyHeldList<Rental>(),
  loaded: false,
};

export const rentalsSlice = createSlice({
  name: 'waypoint/rentals',
  initialState,
  reducers: {
    setRentals(
      state,
      action: PayloadAction<{ tripId: string; rentals: Rental[] }>,
    ) {
      if (action.payload.tripId !== state.tripId) {
        state.hold = emptyHeldList();
      }
      state.tripId = action.payload.tripId;
      state.items = deliverHeld(state.hold, action.payload.rentals, belongs);
      state.loaded = true;
    },
    clearRentals: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<Rental, RentalsState>(
      builder,
      waypointHeldActions,
      'rentals',
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

export const { setRentals, clearRentals } = rentalsSlice.actions;
export const rentalsReducer = rentalsSlice.reducer;

export default rentalsReducer;

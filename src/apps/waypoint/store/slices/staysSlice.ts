import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { waypointHeldActions } from '@apps/waypoint/store/heldLists';
import type { Stay } from '@apps/waypoint/types';

export interface StaysState {
  tripId: string | null;
  items: Stay[];
  hold: HeldList<Stay>;
  loaded: boolean;
}

const belongs = () => true;

const initialState: StaysState = {
  tripId: null,
  items: [],
  hold: emptyHeldList<Stay>(),
  loaded: false,
};

export const staysSlice = createSlice({
  name: 'waypoint/stays',
  initialState,
  reducers: {
    setStays(state, action: PayloadAction<{ tripId: string; stays: Stay[] }>) {
      if (action.payload.tripId !== state.tripId) {
        state.hold = emptyHeldList();
      }
      state.tripId = action.payload.tripId;
      state.items = deliverHeld(state.hold, action.payload.stays, belongs);
      state.loaded = true;
    },
    clearStays: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<Stay, StaysState>(builder, waypointHeldActions, 'stays', {
      belongs,
      show: (state, list) => {
        state.items = list;
      },
      accepts: (state, scope) => state.loaded && state.tripId === scope,
    });
  },
});

export const { setStays, clearStays } = staysSlice.actions;
export const staysReducer = staysSlice.reducer;

export default staysReducer;

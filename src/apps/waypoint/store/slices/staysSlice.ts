import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Stay } from '@apps/waypoint/types';

export interface StaysState {
  tripId: string | null;
  items: Stay[];
  loaded: boolean;
}

const initialState: StaysState = {
  tripId: null,
  items: [],
  loaded: false,
};

export const staysSlice = createSlice({
  name: 'waypoint/stays',
  initialState,
  reducers: {
    setStays(state, action: PayloadAction<{ tripId: string; stays: Stay[] }>) {
      state.tripId = action.payload.tripId;
      state.items = action.payload.stays;
      state.loaded = true;
    },
    clearStays: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setStays, clearStays } = staysSlice.actions;
export const staysReducer = staysSlice.reducer;

export default staysReducer;

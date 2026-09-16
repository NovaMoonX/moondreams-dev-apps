import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { TripJoinRequest } from '@apps/waypoint/types';

export interface PendingRequestsState {
  items: TripJoinRequest[];
  loaded: boolean;
}

const initialState: PendingRequestsState = {
  items: [],
  loaded: false,
};

export const pendingRequestsSlice = createSlice({
  name: 'waypoint/pendingRequests',
  initialState,
  reducers: {
    setPendingRequests(state, action: PayloadAction<TripJoinRequest[]>) {
      state.items = action.payload;
      state.loaded = true;
    },
    upsertPendingRequest(state, action: PayloadAction<TripJoinRequest>) {
      const existingIndex = state.items.findIndex(
        (request) =>
          request.uid === action.payload.uid &&
          request.tripId === action.payload.tripId,
      );

      if (existingIndex >= 0) {
        state.items[existingIndex] = action.payload;
        return;
      }

      state.items.push(action.payload);
    },
    removePendingRequest(
      state,
      action: PayloadAction<{ uid: string; tripId: string }>,
    ) {
      state.items = state.items.filter(
        (request) =>
          request.uid !== action.payload.uid ||
          request.tripId !== action.payload.tripId,
      );
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const {
  setPendingRequests,
  upsertPendingRequest,
  removePendingRequest,
} = pendingRequestsSlice.actions;
export const pendingRequestsReducer = pendingRequestsSlice.reducer;

export default pendingRequestsReducer;

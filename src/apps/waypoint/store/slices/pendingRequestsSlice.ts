import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { TripJoinRequest } from '@apps/waypoint/types';

export interface PendingRequestsState {
  // Requests the signed-in user has sent, across every trip — app-scoped,
  // not tied to whichever trip is currently open.
  myRequests: TripJoinRequest[];
  myRequestsLoaded: boolean;
  // Incoming requests for whichever trip is currently open, when the
  // signed-in user is an Admin of it.
  tripRequests: TripJoinRequest[];
  tripRequestsLoaded: boolean;
}

const initialState: PendingRequestsState = {
  myRequests: [],
  myRequestsLoaded: false,
  tripRequests: [],
  tripRequestsLoaded: false,
};

export const pendingRequestsSlice = createSlice({
  name: 'waypoint/pendingRequests',
  initialState,
  reducers: {
    setMyPendingRequests(state, action: PayloadAction<TripJoinRequest[]>) {
      state.myRequests = action.payload;
      state.myRequestsLoaded = true;
    },
    upsertMyPendingRequest(state, action: PayloadAction<TripJoinRequest>) {
      const existingIndex = state.myRequests.findIndex(
        (request) =>
          request.uid === action.payload.uid &&
          request.tripId === action.payload.tripId,
      );

      if (existingIndex >= 0) {
        state.myRequests[existingIndex] = action.payload;
        return;
      }

      state.myRequests.push(action.payload);
    },
    removeMyPendingRequest(
      state,
      action: PayloadAction<{ uid: string; tripId: string }>,
    ) {
      state.myRequests = state.myRequests.filter(
        (request) =>
          request.uid !== action.payload.uid ||
          request.tripId !== action.payload.tripId,
      );
    },
    setTripPendingRequests(state, action: PayloadAction<TripJoinRequest[]>) {
      state.tripRequests = action.payload;
      state.tripRequestsLoaded = true;
    },
    removeTripPendingRequest(
      state,
      action: PayloadAction<{ uid: string; tripId: string }>,
    ) {
      state.tripRequests = state.tripRequests.filter(
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
  setMyPendingRequests,
  upsertMyPendingRequest,
  removeMyPendingRequest,
  setTripPendingRequests,
  removeTripPendingRequest,
} = pendingRequestsSlice.actions;
export const pendingRequestsReducer = pendingRequestsSlice.reducer;

export default pendingRequestsReducer;

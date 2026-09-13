import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { PendingHouseholdRequest } from '@apps/nine-lives/types';

export interface PendingRequestsState {
  items: PendingHouseholdRequest[];
  loaded: boolean;
}

const initialState: PendingRequestsState = {
  items: [],
  loaded: false,
};

export const pendingRequestsSlice = createSlice({
  name: 'nineLives/pendingRequests',
  initialState,
  reducers: {
    setPendingRequests(state, action: PayloadAction<PendingHouseholdRequest[]>) {
      state.items = action.payload;
      state.loaded = true;
    },
    upsertPendingRequest(state, action: PayloadAction<PendingHouseholdRequest>) {
      const existingIndex = state.items.findIndex(
        (request) =>
          request.householdId === action.payload.householdId &&
          request.uid === action.payload.uid,
      );

      if (existingIndex >= 0) {
        state.items[existingIndex] = action.payload;
        return;
      }

      state.items.push(action.payload);
    },
    removePendingRequest(
      state,
      action: PayloadAction<{ householdId: string; uid: string }>,
    ) {
      state.items = state.items.filter(
        (request) =>
          !(request.householdId === action.payload.householdId &&
            request.uid === action.payload.uid),
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

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { MembershipProfile } from '@apps/a-list/types';

export interface MembershipState {
  membership: MembershipProfile | null;
  isLoaded: boolean;
}

const initialState: MembershipState = {
  membership: null,
  isLoaded: false,
};

export const membershipSlice = createSlice({
  name: 'aList/membership',
  initialState,
  reducers: {
    setMembership(state, action: PayloadAction<MembershipProfile | null>) {
      state.membership = action.payload;
      state.isLoaded = true;
    },
    clearMembership: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setMembership, clearMembership } = membershipSlice.actions;
export const membershipReducer = membershipSlice.reducer;

export default membershipReducer;

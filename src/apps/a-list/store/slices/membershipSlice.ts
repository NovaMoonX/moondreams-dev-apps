import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { MembershipProfile } from '@apps/a-list/types';

export interface MembershipState {
  membership: MembershipProfile | null;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: MembershipState = {
  membership: null,
  isLoaded: false,
  loadError: null,
};

export const membershipSlice = createSlice({
  name: 'aList/membership',
  initialState,
  reducers: {
    setMembership(state, action: PayloadAction<MembershipProfile | null>) {
      state.membership = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setMembershipLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearMembership: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setMembership, setMembershipLoadError, clearMembership } =
  membershipSlice.actions;
export const membershipReducer = membershipSlice.reducer;

export default membershipReducer;

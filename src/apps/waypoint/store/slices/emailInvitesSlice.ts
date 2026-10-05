import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { TripEmailInvite } from '@apps/waypoint/types';

export interface EmailInvitesState {
  /** Invitations addressed to the signed-in user's email, across every trip. */
  mine: TripEmailInvite[];
  mineLoaded: boolean;
  /** Invitations an Admin has sent for whichever trip is open. */
  forTrip: TripEmailInvite[];
  forTripLoaded: boolean;
}

const initialState: EmailInvitesState = {
  mine: [],
  mineLoaded: false,
  forTrip: [],
  forTripLoaded: false,
};

export const emailInvitesSlice = createSlice({
  name: 'waypoint/emailInvites',
  initialState,
  reducers: {
    setMyEmailInvites(state, action: PayloadAction<TripEmailInvite[]>) {
      state.mine = action.payload;
      state.mineLoaded = true;
    },
    setTripEmailInvites(state, action: PayloadAction<TripEmailInvite[]>) {
      state.forTrip = action.payload;
      state.forTripLoaded = true;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setMyEmailInvites, setTripEmailInvites } = emailInvitesSlice.actions;
export const emailInvitesReducer = emailInvitesSlice.reducer;

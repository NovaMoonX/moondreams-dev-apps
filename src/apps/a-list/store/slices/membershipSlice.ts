import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { aListHeldActions, type WithId } from '@apps/a-list/store/heldLists';
import type { MembershipProfile } from '@apps/a-list/types';

export interface MembershipState {
  membership: WithId<MembershipProfile> | null;
  /** The member's document as a list of one, so a transaction's write can be laid over it. */
  hold: HeldList<WithId<MembershipProfile>>;
  uid: string | null;
  isLoaded: boolean;
  loadError: string | null;
}

const belongs = () => true;

const initialState: MembershipState = {
  membership: null,
  hold: emptyHeldList<WithId<MembershipProfile>>(),
  uid: null,
  isLoaded: false,
  loadError: null,
};

export const membershipSlice = createSlice({
  name: 'aList/membership',
  initialState,
  reducers: {
    setMembership(
      state,
      action: PayloadAction<{
        uid: string;
        membership: WithId<MembershipProfile> | null;
      }>,
    ) {
      const { uid, membership } = action.payload;
      if (uid !== state.uid) state.hold = emptyHeldList();
      state.uid = uid;
      state.membership =
        deliverHeld(
          state.hold,
          membership === null ? [] : [membership],
          belongs,
        )[0] ?? null;
      state.isLoaded = true;
      state.loadError = null;
    },
    setMembershipLoadError(state, action: PayloadAction<string>) {
      state.hold = emptyHeldList();
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearMembership: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<WithId<MembershipProfile>, MembershipState>(
      builder,
      aListHeldActions,
      'membership',
      {
        belongs,
        show: (state, list) => {
          state.membership = list[0] ?? null;
        },
        accepts: (state, scope) =>
          state.isLoaded && state.loadError === null && state.uid === scope,
      },
    );
  },
});

export const { setMembership, setMembershipLoadError, clearMembership } =
  membershipSlice.actions;
export const membershipReducer = membershipSlice.reducer;

export default membershipReducer;

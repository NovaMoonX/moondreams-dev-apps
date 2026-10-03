import { combineReducers } from '@reduxjs/toolkit';

import {
  membershipReducer,
  type MembershipState,
} from './slices/membershipSlice';

export interface AListState {
  membership: MembershipState;
}

export const aListReducer = combineReducers({
  membership: membershipReducer,
});

export { type MembershipState } from './slices/membershipSlice';

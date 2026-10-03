import { combineReducers } from '@reduxjs/toolkit';

import {
  membershipReducer,
  type MembershipState,
} from './slices/membershipSlice';
import { watchlistReducer, type WatchlistState } from './slices/watchlistSlice';

export interface AListState {
  membership: MembershipState;
  watchlist: WatchlistState;
}

export const aListReducer = combineReducers({
  membership: membershipReducer,
  watchlist: watchlistReducer,
});

export { type MembershipState } from './slices/membershipSlice';
export { type WatchlistState } from './slices/watchlistSlice';

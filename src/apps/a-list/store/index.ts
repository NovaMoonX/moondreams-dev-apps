import { combineReducers } from '@reduxjs/toolkit';

import {
  membershipReducer,
  type MembershipState,
} from './slices/membershipSlice';
import { viewingsReducer, type ViewingsState } from './slices/viewingsSlice';
import { watchlistReducer, type WatchlistState } from './slices/watchlistSlice';

export interface AListState {
  membership: MembershipState;
  watchlist: WatchlistState;
  viewings: ViewingsState;
}

export const aListReducer = combineReducers({
  membership: membershipReducer,
  watchlist: watchlistReducer,
  viewings: viewingsReducer,
});

export { type MembershipState } from './slices/membershipSlice';
export { type WatchlistState } from './slices/watchlistSlice';
export { type ViewingsState } from './slices/viewingsSlice';

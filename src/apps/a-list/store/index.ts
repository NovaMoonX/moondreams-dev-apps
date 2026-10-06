import { combineReducers } from '@reduxjs/toolkit';

import {
  membershipReducer,
  type MembershipState,
} from './slices/membershipSlice';
import { theatresReducer, type TheatresState } from './slices/theatresSlice';
import { viewingsReducer, type ViewingsState } from './slices/viewingsSlice';
import { watchlistReducer, type WatchlistState } from './slices/watchlistSlice';

export interface AListState {
  membership: MembershipState;
  watchlist: WatchlistState;
  viewings: ViewingsState;
  theatres: TheatresState;
}

export const aListReducer = combineReducers({
  membership: membershipReducer,
  watchlist: watchlistReducer,
  viewings: viewingsReducer,
  theatres: theatresReducer,
});

export { type MembershipState } from './slices/membershipSlice';
export { type WatchlistState } from './slices/watchlistSlice';
export { type ViewingsState } from './slices/viewingsSlice';
export { type TheatresState } from './slices/theatresSlice';

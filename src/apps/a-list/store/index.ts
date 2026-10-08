import { combineReducers } from '@reduxjs/toolkit';

import {
  calendarSharesReducer,
  type CalendarSharesState,
} from './slices/calendarSharesSlice';
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
  calendarShares: CalendarSharesState;
}

export const aListReducer = combineReducers({
  membership: membershipReducer,
  watchlist: watchlistReducer,
  viewings: viewingsReducer,
  theatres: theatresReducer,
  calendarShares: calendarSharesReducer,
});

export { type MembershipState } from './slices/membershipSlice';
export { type WatchlistState } from './slices/watchlistSlice';
export { type ViewingsState } from './slices/viewingsSlice';
export { type TheatresState } from './slices/theatresSlice';
export { type CalendarSharesState } from './slices/calendarSharesSlice';

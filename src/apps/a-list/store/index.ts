import { combineReducers } from '@reduxjs/toolkit';

import {
  calendarSharesReducer,
  type CalendarSharesState,
} from './slices/calendarSharesSlice';
import { emailReducer, type EmailState } from './slices/emailSlice';
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
  email: EmailState;
}

export const aListReducer = combineReducers({
  membership: membershipReducer,
  watchlist: watchlistReducer,
  viewings: viewingsReducer,
  theatres: theatresReducer,
  calendarShares: calendarSharesReducer,
  email: emailReducer,
});

export { type MembershipState } from './slices/membershipSlice';
export { type WatchlistState } from './slices/watchlistSlice';
export { type ViewingsState } from './slices/viewingsSlice';
export { type TheatresState } from './slices/theatresSlice';
export { type CalendarSharesState } from './slices/calendarSharesSlice';
export { type EmailState } from './slices/emailSlice';

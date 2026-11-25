import { combineReducers } from '@reduxjs/toolkit';

import {
  addedCalendarsReducer,
  type AddedCalendarsState,
} from './slices/addedCalendarsSlice';
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
  addedCalendars: AddedCalendarsState;
  email: EmailState;
}

export const aListReducer = combineReducers({
  membership: membershipReducer,
  watchlist: watchlistReducer,
  viewings: viewingsReducer,
  theatres: theatresReducer,
  calendarShares: calendarSharesReducer,
  addedCalendars: addedCalendarsReducer,
  email: emailReducer,
});

export { type MembershipState } from './slices/membershipSlice';
export { type WatchlistState } from './slices/watchlistSlice';
export { type ViewingsState } from './slices/viewingsSlice';
export { type TheatresState } from './slices/theatresSlice';
export { type CalendarSharesState } from './slices/calendarSharesSlice';
export { type EmailState } from './slices/emailSlice';
export { type AddedCalendarsState } from './slices/addedCalendarsSlice';

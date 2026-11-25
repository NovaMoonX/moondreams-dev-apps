import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { AddedCalendar, ShareFeed } from '@apps/a-list/types';
import type { AddedFeedState } from '@apps/a-list/utils/friendShowings';

export interface AddedCalendarsState {
  items: AddedCalendar[];
  /** Keyed by the added calendar's id (the share id). */
  feeds: Record<string, AddedFeedState>;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: AddedCalendarsState = {
  items: [],
  feeds: {},
  isLoaded: false,
  loadError: null,
};

export const addedCalendarsSlice = createSlice({
  name: 'aList/addedCalendars',
  initialState,
  reducers: {
    setAddedCalendars(state, action: PayloadAction<AddedCalendar[]>) {
      const ids = new Set(action.payload.map((item) => item.id));
      state.items = action.payload;
      state.feeds = Object.fromEntries(
        Object.entries(state.feeds).filter(([id]) => ids.has(id)),
      );
      state.isLoaded = true;
      state.loadError = null;
    },
    setAddedCalendarsLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    setAddedFeed(
      state,
      action: PayloadAction<{ id: string; feed: ShareFeed | null }>,
    ) {
      const { id, feed } = action.payload;
      state.feeds[id] = feed ? { status: 'ok', feed } : { status: 'ended' };
    },
    clearAddedCalendars: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const {
  setAddedCalendars,
  setAddedCalendarsLoadError,
  setAddedFeed,
  clearAddedCalendars,
} = addedCalendarsSlice.actions;
export const addedCalendarsReducer = addedCalendarsSlice.reducer;

export default addedCalendarsReducer;

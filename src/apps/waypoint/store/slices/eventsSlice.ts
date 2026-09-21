import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { TimelineEvent } from '@apps/waypoint/types';

export interface EventsState {
  tripId: string | null;
  items: TimelineEvent[];
  loaded: boolean;
}

const initialState: EventsState = {
  tripId: null,
  items: [],
  loaded: false,
};

export const eventsSlice = createSlice({
  name: 'waypoint/events',
  initialState,
  reducers: {
    setEvents(state, action: PayloadAction<{ tripId: string; events: TimelineEvent[] }>) {
      state.tripId = action.payload.tripId;
      state.items = action.payload.events;
      state.loaded = true;
    },
    upsertEvent(state, action: PayloadAction<TimelineEvent>) {
      const index = state.items.findIndex((event) => event.id === action.payload.id);
      if (index >= 0) {
        state.items[index] = action.payload;
      } else {
        state.items.push(action.payload);
      }
    },
    clearEvents: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setEvents, upsertEvent, clearEvents } = eventsSlice.actions;
export const eventsReducer = eventsSlice.reducer;

export default eventsReducer;

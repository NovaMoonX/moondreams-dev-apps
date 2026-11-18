import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { waypointHeldActions } from '@apps/waypoint/store/heldLists';
import type { TimelineEvent } from '@apps/waypoint/types';

export interface EventsState {
  tripId: string | null;
  items: TimelineEvent[];
  hold: HeldList<TimelineEvent>;
  loaded: boolean;
}

const belongs = () => true;

const initialState: EventsState = {
  tripId: null,
  items: [],
  hold: emptyHeldList<TimelineEvent>(),
  loaded: false,
};

export const eventsSlice = createSlice({
  name: 'waypoint/events',
  initialState,
  reducers: {
    setEvents(
      state,
      action: PayloadAction<{ tripId: string; events: TimelineEvent[] }>,
    ) {
      if (action.payload.tripId !== state.tripId) {
        state.hold = emptyHeldList();
      }
      state.tripId = action.payload.tripId;
      state.items = deliverHeld(state.hold, action.payload.events, belongs);
      state.loaded = true;
    },
    upsertEvent(state, action: PayloadAction<TimelineEvent>) {
      const index = state.items.findIndex(
        (event) => event.id === action.payload.id,
      );
      if (index >= 0) {
        state.items[index] = action.payload;
      } else {
        state.items.push(action.payload);
      }
      const heldIndex = state.hold.incoming.findIndex(
        (event) => event.id === action.payload.id,
      );
      if (heldIndex >= 0) {
        state.hold.incoming[heldIndex] = action.payload;
      } else {
        state.hold.incoming.push(action.payload);
      }
    },
    clearEvents: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<TimelineEvent, EventsState>(
      builder,
      waypointHeldActions,
      'events',
      {
        belongs,
        show: (state, list) => {
          state.items = list;
        },
        accepts: (state, scope) => state.loaded && state.tripId === scope,
      },
    );
  },
});

export const { setEvents, upsertEvent, clearEvents } = eventsSlice.actions;
export const eventsReducer = eventsSlice.reducer;

export default eventsReducer;

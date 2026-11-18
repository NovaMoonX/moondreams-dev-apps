import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { waypointHeldActions } from '@apps/waypoint/store/heldLists';
import type { EventSuggestion } from '@apps/waypoint/types';

export interface EventSuggestionsState {
  tripId: string | null;
  items: EventSuggestion[];
  hold: HeldList<EventSuggestion>;
  loaded: boolean;
}

const belongs = () => true;

const initialState: EventSuggestionsState = {
  tripId: null,
  items: [],
  hold: emptyHeldList<EventSuggestion>(),
  loaded: false,
};

export const eventSuggestionsSlice = createSlice({
  name: 'waypoint/eventSuggestions',
  initialState,
  reducers: {
    setEventSuggestions(
      state,
      action: PayloadAction<{ tripId: string; suggestions: EventSuggestion[] }>,
    ) {
      if (action.payload.tripId !== state.tripId) {
        state.hold = emptyHeldList();
      }
      state.tripId = action.payload.tripId;
      state.items = deliverHeld(
        state.hold,
        action.payload.suggestions,
        belongs,
      );
      state.loaded = true;
    },
    clearEventSuggestions: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<EventSuggestion, EventSuggestionsState>(
      builder,
      waypointHeldActions,
      'eventSuggestions',
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

export const { setEventSuggestions, clearEventSuggestions } =
  eventSuggestionsSlice.actions;
export const eventSuggestionsReducer = eventSuggestionsSlice.reducer;

export default eventSuggestionsReducer;

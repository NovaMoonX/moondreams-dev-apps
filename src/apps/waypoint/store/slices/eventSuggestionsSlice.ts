import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { EventSuggestion } from '@apps/waypoint/types';

export interface EventSuggestionsState {
  tripId: string | null;
  items: EventSuggestion[];
  loaded: boolean;
}

const initialState: EventSuggestionsState = {
  tripId: null,
  items: [],
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
      state.tripId = action.payload.tripId;
      state.items = action.payload.suggestions;
      state.loaded = true;
    },
    clearEventSuggestions: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setEventSuggestions, clearEventSuggestions } = eventSuggestionsSlice.actions;
export const eventSuggestionsReducer = eventSuggestionsSlice.reducer;

export default eventSuggestionsReducer;

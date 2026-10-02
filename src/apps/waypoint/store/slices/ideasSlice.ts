import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { TripIdea } from '@apps/waypoint/types';

export interface IdeasState {
  tripId: string | null;
  items: TripIdea[];
  loaded: boolean;
}

const initialState: IdeasState = {
  tripId: null,
  items: [],
  loaded: false,
};

export const ideasSlice = createSlice({
  name: 'waypoint/ideas',
  initialState,
  reducers: {
    setIdeas(state, action: PayloadAction<{ tripId: string; ideas: TripIdea[] }>) {
      state.tripId = action.payload.tripId;
      state.items = action.payload.ideas;
      state.loaded = true;
    },
    clearIdeas: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setIdeas, clearIdeas } = ideasSlice.actions;
export const ideasReducer = ideasSlice.reducer;

export default ideasReducer;

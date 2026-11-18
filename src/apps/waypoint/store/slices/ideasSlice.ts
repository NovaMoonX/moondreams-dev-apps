import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { waypointHeldActions } from '@apps/waypoint/store/heldLists';
import type { TripIdea } from '@apps/waypoint/types';

export interface IdeasState {
  tripId: string | null;
  items: TripIdea[];
  hold: HeldList<TripIdea>;
  loaded: boolean;
}

const belongs = () => true;

const initialState: IdeasState = {
  tripId: null,
  items: [],
  hold: emptyHeldList<TripIdea>(),
  loaded: false,
};

export const ideasSlice = createSlice({
  name: 'waypoint/ideas',
  initialState,
  reducers: {
    setIdeas(
      state,
      action: PayloadAction<{ tripId: string; ideas: TripIdea[] }>,
    ) {
      if (action.payload.tripId !== state.tripId) {
        state.hold = emptyHeldList();
      }
      state.tripId = action.payload.tripId;
      state.items = deliverHeld(state.hold, action.payload.ideas, belongs);
      state.loaded = true;
    },
    clearIdeas: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<TripIdea, IdeasState>(builder, waypointHeldActions, 'ideas', {
      belongs,
      show: (state, list) => {
        state.items = list;
      },
      accepts: (state, scope) => state.loaded && state.tripId === scope,
    });
  },
});

export const { setIdeas, clearIdeas } = ideasSlice.actions;
export const ideasReducer = ideasSlice.reducer;

export default ideasReducer;

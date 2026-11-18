import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { waypointHeldActions } from '@apps/waypoint/store/heldLists';
import type { Announcement } from '@apps/waypoint/types';

export interface AnnouncementsState {
  tripId: string | null;
  items: Announcement[];
  hold: HeldList<Announcement>;
  loaded: boolean;
}

const belongs = () => true;

const initialState: AnnouncementsState = {
  tripId: null,
  items: [],
  hold: emptyHeldList<Announcement>(),
  loaded: false,
};

export const announcementsSlice = createSlice({
  name: 'waypoint/announcements',
  initialState,
  reducers: {
    setAnnouncements(
      state,
      action: PayloadAction<{ tripId: string; announcements: Announcement[] }>,
    ) {
      if (action.payload.tripId !== state.tripId) {
        state.hold = emptyHeldList();
      }
      state.tripId = action.payload.tripId;
      state.items = deliverHeld(
        state.hold,
        action.payload.announcements,
        belongs,
      );
      state.loaded = true;
    },
    clearAnnouncements: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<Announcement, AnnouncementsState>(
      builder,
      waypointHeldActions,
      'announcements',
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

export const { setAnnouncements, clearAnnouncements } =
  announcementsSlice.actions;
export const announcementsReducer = announcementsSlice.reducer;

export default announcementsReducer;

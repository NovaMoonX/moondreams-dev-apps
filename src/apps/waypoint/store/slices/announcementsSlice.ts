import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Announcement } from '@apps/waypoint/types';

export interface AnnouncementsState {
  tripId: string | null;
  items: Announcement[];
  loaded: boolean;
}

const initialState: AnnouncementsState = {
  tripId: null,
  items: [],
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
      state.tripId = action.payload.tripId;
      state.items = action.payload.announcements;
      state.loaded = true;
    },
    clearAnnouncements: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setAnnouncements, clearAnnouncements } = announcementsSlice.actions;
export const announcementsReducer = announcementsSlice.reducer;

export default announcementsReducer;

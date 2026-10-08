import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { ChecklistItem } from '@apps/waypoint/types';

export interface PersonalChecklistState {
  items: ChecklistItem[];
  tripId: string | null;
}

const initialState: PersonalChecklistState = {
  items: [],
  tripId: null,
};

export const personalChecklistSlice = createSlice({
  name: 'waypoint/personalChecklist',
  initialState,
  reducers: {
    setPersonalChecklist(state, action: PayloadAction<{ tripId: string; items: ChecklistItem[] }>) {
      state.tripId = action.payload.tripId;
      state.items = action.payload.items;
    },
    clearPersonalChecklist(state) {
      state.items = [];
      state.tripId = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setPersonalChecklist, clearPersonalChecklist } = personalChecklistSlice.actions;
export const personalChecklistReducer = personalChecklistSlice.reducer;

export default personalChecklistReducer;

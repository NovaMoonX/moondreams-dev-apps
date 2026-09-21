import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { ChecklistItem } from '@apps/waypoint/types';

export interface ChecklistState {
  items: ChecklistItem[];
  tripId: string | null;
  loaded: boolean;
}

const initialState: ChecklistState = {
  items: [],
  tripId: null,
  loaded: false,
};

export const checklistSlice = createSlice({
  name: 'waypoint/checklist',
  initialState,
  reducers: {
    setChecklist(
      state,
      action: PayloadAction<{ tripId: string | null; items: ChecklistItem[] }>,
    ) {
      state.tripId = action.payload.tripId;
      state.items = action.payload.items;
      state.loaded = true;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setChecklist } = checklistSlice.actions;
export const checklistReducer = checklistSlice.reducer;

export default checklistReducer;

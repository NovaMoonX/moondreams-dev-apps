import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { waypointHeldActions } from '@apps/waypoint/store/heldLists';
import type { ChecklistItem } from '@apps/waypoint/types';

export interface ChecklistState {
  items: ChecklistItem[];
  hold: HeldList<ChecklistItem>;
  tripId: string | null;
  loaded: boolean;
}

const belongs = () => true;

const initialState: ChecklistState = {
  items: [],
  hold: emptyHeldList<ChecklistItem>(),
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
      if (action.payload.tripId !== state.tripId) {
        state.hold = emptyHeldList();
      }
      state.tripId = action.payload.tripId;
      state.items = deliverHeld(state.hold, action.payload.items, belongs);
      state.loaded = true;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<ChecklistItem, ChecklistState>(
      builder,
      waypointHeldActions,
      'checklist',
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

export const { setChecklist } = checklistSlice.actions;
export const checklistReducer = checklistSlice.reducer;

export default checklistReducer;

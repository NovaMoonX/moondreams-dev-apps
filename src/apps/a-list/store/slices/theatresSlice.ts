import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { aListHeldActions, type WithId } from '@apps/a-list/store/heldLists';
import type { AListTheatre } from '@apps/a-list/types';

export interface TheatresState {
  items: WithId<AListTheatre>[];
  hold: HeldList<WithId<AListTheatre>>;
  uid: string | null;
  isLoaded: boolean;
  loadError: string | null;
}

const belongs = () => true;

const initialState: TheatresState = {
  items: [],
  hold: emptyHeldList<WithId<AListTheatre>>(),
  uid: null,
  isLoaded: false,
  loadError: null,
};

export const theatresSlice = createSlice({
  name: 'aList/theatres',
  initialState,
  reducers: {
    setTheatres(
      state,
      action: PayloadAction<{ uid: string; items: WithId<AListTheatre>[] }>,
    ) {
      if (action.payload.uid !== state.uid) state.hold = emptyHeldList();
      state.uid = action.payload.uid;
      state.items = deliverHeld(state.hold, action.payload.items, belongs);
      state.isLoaded = true;
      state.loadError = null;
    },
    setTheatresLoadError(state, action: PayloadAction<string>) {
      state.hold = emptyHeldList();
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearTheatres: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<WithId<AListTheatre>, TheatresState>(
      builder,
      aListHeldActions,
      'theatres',
      {
        belongs,
        show: (state, list) => {
          state.items = list;
        },
        accepts: (state, scope) =>
          state.isLoaded && state.loadError === null && state.uid === scope,
      },
    );
  },
});

export const { setTheatres, setTheatresLoadError, clearTheatres } =
  theatresSlice.actions;
export const theatresReducer = theatresSlice.reducer;

export default theatresReducer;

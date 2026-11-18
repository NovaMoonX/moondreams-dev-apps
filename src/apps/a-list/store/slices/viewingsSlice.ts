import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { aListHeldActions, type WithId } from '@apps/a-list/store/heldLists';
import type { Viewing } from '@apps/a-list/types';

export interface ViewingsState {
  items: WithId<Viewing>[];
  hold: HeldList<WithId<Viewing>>;
  uid: string | null;
  isLoaded: boolean;
  loadError: string | null;
}

const belongs = () => true;

const initialState: ViewingsState = {
  items: [],
  hold: emptyHeldList<WithId<Viewing>>(),
  uid: null,
  isLoaded: false,
  loadError: null,
};

export const viewingsSlice = createSlice({
  name: 'aList/viewings',
  initialState,
  reducers: {
    setViewings(
      state,
      action: PayloadAction<{ uid: string; items: WithId<Viewing>[] }>,
    ) {
      if (action.payload.uid !== state.uid) state.hold = emptyHeldList();
      state.uid = action.payload.uid;
      state.items = deliverHeld(state.hold, action.payload.items, belongs);
      state.isLoaded = true;
      state.loadError = null;
    },
    setViewingsLoadError(state, action: PayloadAction<string>) {
      state.hold = emptyHeldList();
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearViewings: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<WithId<Viewing>, ViewingsState>(
      builder,
      aListHeldActions,
      'viewings',
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

export const { setViewings, setViewingsLoadError, clearViewings } =
  viewingsSlice.actions;
export const viewingsReducer = viewingsSlice.reducer;

export default viewingsReducer;

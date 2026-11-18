import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { pinchHeldActions } from '@apps/pinch/store/heldLists';
import type { Collection } from '@apps/pinch/types';

export interface CollectionsState {
  items: Collection[];
  hold: HeldList<Collection>;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: CollectionsState = {
  items: [],
  hold: emptyHeldList<Collection>(),
  isLoaded: false,
  loadError: null,
};

const belongs = () => true;

export const collectionsSlice = createSlice({
  name: 'pinch/collections',
  initialState,
  reducers: {
    setCollections(state, action: PayloadAction<Collection[]>) {
      state.items = deliverHeld(state.hold, action.payload, belongs);
      state.isLoaded = true;
      state.loadError = null;
    },
    setCollectionsLoadError(state, action: PayloadAction<string>) {
      state.hold = emptyHeldList();
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearCollections: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<Collection, CollectionsState>(
      builder,
      pinchHeldActions,
      'collections',
      {
        belongs,
        show: (state, list) => {
          state.items = list;
        },
        accepts: (state) => state.loadError === null,
      },
    );
  },
});

export const { setCollections, setCollectionsLoadError, clearCollections } =
  collectionsSlice.actions;
export const collectionsReducer = collectionsSlice.reducer;

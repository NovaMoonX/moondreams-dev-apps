import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { pinchHeldActions } from '@apps/pinch/store/heldLists';
import type { Store } from '@apps/pinch/types';

export interface StoresState {
  items: Store[];
  hold: HeldList<Store>;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: StoresState = {
  items: [],
  hold: emptyHeldList<Store>(),
  isLoaded: false,
  loadError: null,
};

const belongs = () => true;

export const storesSlice = createSlice({
  name: 'pinch/stores',
  initialState,
  reducers: {
    setStores(state, action: PayloadAction<Store[]>) {
      state.items = deliverHeld(state.hold, action.payload, belongs);
      state.isLoaded = true;
      state.loadError = null;
    },
    setStoresLoadError(state, action: PayloadAction<string>) {
      state.hold = emptyHeldList();
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearStores: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<Store, StoresState>(builder, pinchHeldActions, 'stores', {
      belongs,
      show: (state, list) => {
        state.items = list;
      },
      accepts: (state) => state.loadError === null,
    });
  },
});

export const { setStores, setStoresLoadError, clearStores } =
  storesSlice.actions;
export const storesReducer = storesSlice.reducer;

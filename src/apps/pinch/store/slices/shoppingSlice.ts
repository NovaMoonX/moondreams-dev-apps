import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { pinchHeldActions } from '@apps/pinch/store/heldLists';
import type { ShoppingItem } from '@apps/pinch/types';

export interface ShoppingState {
  items: ShoppingItem[];
  hold: HeldList<ShoppingItem>;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: ShoppingState = {
  items: [],
  hold: emptyHeldList<ShoppingItem>(),
  isLoaded: false,
  loadError: null,
};

const belongs = () => true;

export const shoppingSlice = createSlice({
  name: 'pinch/shopping',
  initialState,
  reducers: {
    setShopping(state, action: PayloadAction<ShoppingItem[]>) {
      state.items = deliverHeld(state.hold, action.payload, belongs);
      state.isLoaded = true;
      state.loadError = null;
    },
    setShoppingLoadError(state, action: PayloadAction<string>) {
      state.hold = emptyHeldList();
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearShopping: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<ShoppingItem, ShoppingState>(
      builder,
      pinchHeldActions,
      'shoppingItems',
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

export const { setShopping, setShoppingLoadError, clearShopping } =
  shoppingSlice.actions;
export const shoppingReducer = shoppingSlice.reducer;

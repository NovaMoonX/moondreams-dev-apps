import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { ShoppingItem } from '@apps/pinch/types';

export interface ShoppingState {
  items: ShoppingItem[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: ShoppingState = {
  items: [],
  isLoaded: false,
  loadError: null,
};

export const shoppingSlice = createSlice({
  name: 'pinch/shopping',
  initialState,
  reducers: {
    setShopping(state, action: PayloadAction<ShoppingItem[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setShoppingLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.items = [];
      state.loadError = action.payload;
    },
    clearShopping: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setShopping, setShoppingLoadError, clearShopping } =
  shoppingSlice.actions;
export const shoppingReducer = shoppingSlice.reducer;

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import {
  addHeldCases,
  deliverHeld,
  emptyHeldList,
  type HeldList,
} from '@/store/heldLists';
import { pinchHeldActions } from '@apps/pinch/store/heldLists';
import type { Product } from '@apps/pinch/types';

export interface ProductsState {
  items: Product[];
  hold: HeldList<Product>;
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: ProductsState = {
  items: [],
  hold: emptyHeldList<Product>(),
  isLoaded: false,
  loadError: null,
};

const belongs = () => true;

export const productsSlice = createSlice({
  name: 'pinch/products',
  initialState,
  reducers: {
    setProducts(state, action: PayloadAction<Product[]>) {
      state.items = deliverHeld(state.hold, action.payload, belongs);
      state.isLoaded = true;
      state.loadError = null;
    },
    setProductsLoadError(state, action: PayloadAction<string>) {
      state.hold = emptyHeldList();
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearProducts: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
    addHeldCases<Product, ProductsState>(
      builder,
      pinchHeldActions,
      'products',
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

export const { setProducts, setProductsLoadError, clearProducts } =
  productsSlice.actions;
export const productsReducer = productsSlice.reducer;

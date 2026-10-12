import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllState } from '@/store/actions/globalActions';
import type { Product } from '@apps/pinch/types';

export interface ProductsState {
  items: Product[];
  isLoaded: boolean;
  loadError: string | null;
}

const initialState: ProductsState = { items: [], isLoaded: false, loadError: null };

export const productsSlice = createSlice({
  name: 'pinch/products',
  initialState,
  reducers: {
    setProducts(state, action: PayloadAction<Product[]>) {
      state.items = action.payload;
      state.isLoaded = true;
      state.loadError = null;
    },
    setProductsLoadError(state, action: PayloadAction<string>) {
      state.isLoaded = true;
      state.loadError = action.payload;
    },
    clearProducts: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const { setProducts, setProductsLoadError, clearProducts } = productsSlice.actions;
export const productsReducer = productsSlice.reducer;

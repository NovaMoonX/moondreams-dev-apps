import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { resetAllState } from '@/store/actions/globalActions';
import type { Item, Sale } from '@apps/going-once/types';

type LoadStatus = 'loading' | 'ready' | 'error';

export interface GoingOnceState {
  sales: { items: Sale[]; status: LoadStatus };
  /** The sale on screen, read on its own so it stays current while its tabs are open. */
  openSale: { sale: Sale | null; status: LoadStatus };
  /** The open sale's things, tagged with the sale they were read for so a stale list is never shown. */
  items: { saleId: string | null; items: Item[]; status: LoadStatus };
  /** Photos being saved right now, by thing, so its row can say so. */
  photoUploads: Record<string, number>;
}

const initialState: GoingOnceState = {
  sales: { items: [], status: 'loading' },
  openSale: { sale: null, status: 'loading' },
  items: { saleId: null, items: [], status: 'loading' },
  photoUploads: {},
};

export const goingOnceSlice = createSlice({
  name: 'goingOnce',
  initialState,
  reducers: {
    setSales(state, action: PayloadAction<Sale[]>) {
      state.sales = { items: action.payload, status: 'ready' };
    },
    setSalesError(state) {
      state.sales.status = 'error';
    },
    upsertSale(state, action: PayloadAction<Sale>) {
      state.sales.items = [
        ...state.sales.items.filter((sale) => sale.id !== action.payload.id),
        action.payload,
      ];
    },
    setOpenSale(state, action: PayloadAction<Sale | null>) {
      state.openSale = { sale: action.payload, status: 'ready' };
    },
    setOpenSaleError(state) {
      state.openSale.status = 'error';
    },
    clearOpenSale(state) {
      state.openSale = initialState.openSale;
    },
    setItems(state, action: PayloadAction<{ saleId: string; items: Item[] }>) {
      state.items = { ...action.payload, status: 'ready' };
    },
    setItemsError(state) {
      state.items.status = 'error';
    },
    clearItems(state) {
      state.items = initialState.items;
    },
    photoUploadStarted(state, action: PayloadAction<string>) {
      state.photoUploads[action.payload] =
        (state.photoUploads[action.payload] ?? 0) + 1;
    },
    photoUploadEnded(state, action: PayloadAction<string>) {
      const left = (state.photoUploads[action.payload] ?? 0) - 1;
      if (left > 0) state.photoUploads[action.payload] = left;
      else delete state.photoUploads[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllState, () => initialState);
  },
});

export const {
  setSales,
  setSalesError,
  upsertSale,
  setOpenSale,
  setOpenSaleError,
  clearOpenSale,
  setItems,
  setItemsError,
  clearItems,
  photoUploadStarted,
  photoUploadEnded,
} = goingOnceSlice.actions;
export const goingOnceReducer = goingOnceSlice.reducer;

export const selectGoingOnce = (state: RootState): GoingOnceState =>
  state.goingOnce;

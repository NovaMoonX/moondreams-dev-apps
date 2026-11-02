import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { resetAllState } from '@/store/actions/globalActions';
import type { Sale } from '@apps/going-once/types';

type LoadStatus = 'loading' | 'ready' | 'error';

export interface GoingOnceState {
  sales: { items: Sale[]; status: LoadStatus };
  /** The sale on screen, read on its own so it stays current while its tabs are open. */
  openSale: { sale: Sale | null; status: LoadStatus };
}

const initialState: GoingOnceState = {
  sales: { items: [], status: 'loading' },
  openSale: { sale: null, status: 'loading' },
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
} = goingOnceSlice.actions;
export const goingOnceReducer = goingOnceSlice.reducer;

export const selectGoingOnce = (state: RootState): GoingOnceState =>
  state.goingOnce;

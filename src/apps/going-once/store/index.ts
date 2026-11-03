import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { resetAllState } from '@/store/actions/globalActions';
import type {
  Inquiry,
  Item,
  Sale,
  SaleEmailInvite,
} from '@apps/going-once/types';

type LoadStatus = 'loading' | 'ready' | 'error';

export interface RemovedFrom {
  saleId: string;
  name: string | null;
  ownerUid: string | null;
}

export interface GoingOnceState {
  sales: { items: Sale[]; status: LoadStatus };
  /** The sale on screen, read on its own so it stays current while its tabs are open. */
  openSale: { sale: Sale | null; status: LoadStatus };
  /** Tagged with the sale they were read for, so a stale list is never shown. */
  items: { saleId: string | null; items: Item[]; status: LoadStatus };
  inquiries: {
    saleId: string | null;
    new: { items: Inquiry[]; status: LoadStatus };
    handled: { items: Inquiry[]; status: LoadStatus };
  };
  /** Invitations addressed to the signed-in person's verified email. */
  myInvites: SaleEmailInvite[];
  /** The open sale's waiting invitations, tagged with the sale they were read for. */
  saleInvites: { saleId: string | null; invites: SaleEmailInvite[] };
  /** The sale the person was just taken off (or followed an old link to), kept once its data is cleared; the name and seller are null when the sale was never read. */
  removedFrom: RemovedFrom | null;
  /** A sale the person is leaving right now, so the departure is not shown as a removal. */
  leavingSaleId: string | null;
  /** Photos being saved right now, by thing, so its row can say so. */
  photoUploads: Record<string, number>;
}

const initialState: GoingOnceState = {
  sales: { items: [], status: 'loading' },
  openSale: { sale: null, status: 'loading' },
  items: { saleId: null, items: [], status: 'loading' },
  inquiries: {
    saleId: null,
    new: { items: [], status: 'loading' },
    handled: { items: [], status: 'loading' },
  },
  myInvites: [],
  saleInvites: { saleId: null, invites: [] },
  removedFrom: null,
  leavingSaleId: null,
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
    removeSale(state, action: PayloadAction<string>) {
      state.sales.items = state.sales.items.filter(
        (sale) => sale.id !== action.payload,
      );
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
    setInquiries(
      state,
      action: PayloadAction<{
        saleId: string;
        list: 'new' | 'handled';
        items: Inquiry[];
      }>,
    ) {
      const { saleId, list, items } = action.payload;
      if (state.inquiries.saleId !== saleId)
        state.inquiries = { ...initialState.inquiries, saleId };
      state.inquiries[list] = { items, status: 'ready' };
    },
    setInquiriesError(
      state,
      action: PayloadAction<{ saleId: string; list: 'new' | 'handled' }>,
    ) {
      const { saleId, list } = action.payload;
      if (state.inquiries.saleId !== saleId)
        state.inquiries = { ...initialState.inquiries, saleId };
      state.inquiries[list].status = 'error';
    },
    clearInquiries(state) {
      state.inquiries = initialState.inquiries;
    },
    setMyInvites(state, action: PayloadAction<SaleEmailInvite[]>) {
      state.myInvites = action.payload;
    },
    setSaleInvites(
      state,
      action: PayloadAction<{ saleId: string; invites: SaleEmailInvite[] }>,
    ) {
      state.saleInvites = action.payload;
    },
    clearSaleInvites(state) {
      state.saleInvites = initialState.saleInvites;
    },
    setRemovedFrom(state, action: PayloadAction<RemovedFrom | null>) {
      state.removedFrom = action.payload;
    },
    setLeavingSaleId(state, action: PayloadAction<string | null>) {
      state.leavingSaleId = action.payload;
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
  removeSale,
  setOpenSale,
  setOpenSaleError,
  clearOpenSale,
  setItems,
  setItemsError,
  clearItems,
  setInquiries,
  setInquiriesError,
  clearInquiries,
  setMyInvites,
  setSaleInvites,
  clearSaleInvites,
  setRemovedFrom,
  setLeavingSaleId,
  photoUploadStarted,
  photoUploadEnded,
} = goingOnceSlice.actions;
export const goingOnceReducer = goingOnceSlice.reducer;

export const selectGoingOnce = (state: RootState): GoingOnceState =>
  state.goingOnce;

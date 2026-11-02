import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { Item, Sale } from '@apps/going-once/types';
import { getStatusSummary } from '@apps/going-once/utils/statusSummary';

export const selectSales = (state: RootState) => state.goingOnce.sales.items;

export const selectSalesStatus = (state: RootState) =>
  state.goingOnce.sales.status;

/** The sale with this id: its own listener's copy once it has arrived, else the one in my sales. */
export const selectSaleById = (
  state: RootState,
  saleId: string | null,
): Sale | null => {
  if (saleId === null) return null;
  const { openSale } = state.goingOnce;
  if (openSale.sale?.id === saleId) return openSale.sale;
  return state.goingOnce.sales.items.find((sale) => sale.id === saleId) ?? null;
};

/** The open sale's things, newest first; empty while another sale's are still arriving. */
export const selectItems = createSelector(
  [
    (state: RootState) => state.goingOnce.items,
    (_state: RootState, saleId: string | null) => saleId,
  ],
  (items, saleId): Item[] =>
    items.saleId === saleId
      ? [...items.items].sort(
          (first, second) => second.createdAt - first.createdAt,
        )
      : [],
);

/** The open sale's counts and sums per status, worked out once per change to its things. */
export const selectStatusSummary = createSelector([selectItems], (items) =>
  getStatusSummary(items),
);

export const selectItemsStatus = (state: RootState) =>
  state.goingOnce.items.status;

export const selectPhotoUploads = (state: RootState) =>
  state.goingOnce.photoUploads;

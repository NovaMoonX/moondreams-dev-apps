import type { RootState } from '@/store';
import type { Sale } from '@apps/going-once/types';

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

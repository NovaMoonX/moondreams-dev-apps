import { useEffect } from 'react';

import { useAppDispatch } from '@/store';
import {
  clearItems,
  clearOpenSale,
  setItems,
  setItemsError,
  setOpenSale,
  setOpenSaleError,
  setSales,
  setSalesError,
} from '@apps/going-once/store';
import {
  startOpenSaleItemsListener,
  startOpenSaleListener,
} from '@apps/going-once/store/listeners/openSaleListener';
import { startSalesListener } from '@apps/going-once/store/listeners/salesListener';

/** Starts the listeners: the person's sales, and the open sale and its things once one is chosen. */
export function useGoingOnceSync(uid: string | null, saleId: string | null) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!uid) return;
    return startSalesListener(
      uid,
      (sales) => dispatch(setSales(sales)),
      () => dispatch(setSalesError()),
    );
  }, [uid, dispatch]);

  useEffect(() => {
    if (!uid || !saleId) return;
    const unsubscribeSale = startOpenSaleListener(
      saleId,
      (sale) => dispatch(setOpenSale(sale)),
      () => dispatch(setOpenSaleError()),
    );
    const unsubscribeItems = startOpenSaleItemsListener(
      saleId,
      (items) => dispatch(setItems({ saleId, items })),
      () => dispatch(setItemsError()),
    );
    return () => {
      unsubscribeSale();
      unsubscribeItems();
      dispatch(clearOpenSale());
      dispatch(clearItems());
    };
  }, [uid, saleId, dispatch]);
}

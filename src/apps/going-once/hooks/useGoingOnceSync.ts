import { useEffect } from 'react';

import { useAppDispatch } from '@/store';
import {
  clearOpenSale,
  setOpenSale,
  setOpenSaleError,
  setSales,
  setSalesError,
} from '@apps/going-once/store';
import { startOpenSaleListener } from '@apps/going-once/store/listeners/openSaleListener';
import { startSalesListener } from '@apps/going-once/store/listeners/salesListener';

/** Starts the listeners: the person's sales, and the open sale once one is chosen. */
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
    const unsubscribe = startOpenSaleListener(
      saleId,
      (sale) => dispatch(setOpenSale(sale)),
      () => dispatch(setOpenSaleError()),
    );
    return () => {
      unsubscribe();
      dispatch(clearOpenSale());
    };
  }, [uid, saleId, dispatch]);
}

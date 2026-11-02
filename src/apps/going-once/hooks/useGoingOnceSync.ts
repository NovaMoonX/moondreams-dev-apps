import { useEffect } from 'react';

import { store, useAppDispatch, type AppDispatch } from '@/store';
import {
  clearItems,
  clearOpenSale,
  clearSaleInvites,
  setItems,
  setItemsError,
  setMyInvites,
  setOpenSale,
  setOpenSaleError,
  setRemovedFrom,
  setSaleInvites,
  setSales,
  setSalesError,
} from '@apps/going-once/store';
import {
  startMyInvitesListener,
  startSaleInvitesListener,
} from '@apps/going-once/store/listeners/invitesListener';
import {
  startOpenSaleItemsListener,
  startOpenSaleListener,
} from '@apps/going-once/store/listeners/openSaleListener';
import { startSalesListener } from '@apps/going-once/store/listeners/salesListener';

const isRefused = (error: unknown) =>
  (error as { code?: string } | null)?.code === 'permission-denied';

/** Keeps the name of the sale on screen when it stops being the person's, before its data is cleared. */
function noteRemoval(
  uid: string,
  dispatch: AppDispatch,
  isStillMine: (saleId: string) => boolean,
) {
  const { openSale, leavingSaleId } = store.getState().goingOnce;
  const open = openSale.sale;
  if (!open || open.ownerUid === uid || leavingSaleId === open.id) return;
  if (!isStillMine(open.id))
    dispatch(setRemovedFrom({ saleId: open.id, name: open.name }));
}

/** Starts the listeners: the person's sales and invitations, and the open sale, its things and its invitations once one is chosen. */
export function useGoingOnceSync(
  uid: string | null,
  verifiedEmail: string | null,
  saleId: string | null,
) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!uid) return;
    return startSalesListener(
      uid,
      (sales) => {
        noteRemoval(uid, dispatch, (id) =>
          sales.some((sale) => sale.id === id),
        );
        dispatch(setSales(sales));
      },
      () => dispatch(setSalesError()),
    );
  }, [uid, dispatch]);

  useEffect(() => {
    if (!verifiedEmail) return;
    const stop = startMyInvitesListener(verifiedEmail, (invites) =>
      dispatch(setMyInvites(invites)),
    );
    return () => {
      stop();
      dispatch(setMyInvites([]));
    };
  }, [verifiedEmail, dispatch]);

  useEffect(() => {
    if (!uid || !saleId) return;
    const unsubscribeSale = startOpenSaleListener(
      saleId,
      (sale) => dispatch(setOpenSale(sale)),
      (error) => {
        if (isRefused(error)) noteRemoval(uid, dispatch, () => false);
        dispatch(setOpenSaleError());
      },
    );
    const unsubscribeItems = startOpenSaleItemsListener(
      saleId,
      (items) => dispatch(setItems({ saleId, items })),
      (error) => {
        if (isRefused(error)) noteRemoval(uid, dispatch, () => false);
        dispatch(setItemsError());
      },
    );
    const unsubscribeInvites = startSaleInvitesListener(saleId, (invites) =>
      dispatch(setSaleInvites({ saleId, invites })),
    );
    return () => {
      unsubscribeSale();
      unsubscribeItems();
      unsubscribeInvites();
      dispatch(clearOpenSale());
      dispatch(clearItems());
      dispatch(clearSaleInvites());
    };
  }, [uid, saleId, dispatch]);
}

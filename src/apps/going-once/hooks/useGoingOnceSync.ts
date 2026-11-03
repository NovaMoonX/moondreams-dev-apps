import { useEffect } from 'react';

import { store, useAppDispatch, type AppDispatch } from '@/store';
import {
  clearInquiries,
  clearItems,
  clearOpenSale,
  clearSaleInvites,
  setInquiries,
  setInquiriesError,
  setItems,
  setItemsError,
  setMyInvites,
  setOpenSale,
  setLeavingSaleId,
  setOpenSaleError,
  setRemovedFrom,
  setSaleInvites,
  setSales,
  setSalesError,
} from '@apps/going-once/store';
import {
  startHandledInquiriesListener,
  startNewInquiriesListener,
} from '@apps/going-once/store/listeners/inquiriesListener';
import {
  startMyInvitesListener,
  startSaleInvitesListener,
} from '@apps/going-once/store/listeners/invitesListener';
import {
  canReadSale,
  isPermissionDenied,
  startOpenSaleItemsListener,
  startOpenSaleListener,
} from '@apps/going-once/store/listeners/openSaleListener';
import { startSalesListener } from '@apps/going-once/store/listeners/salesListener';

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
    dispatch(
      setRemovedFrom({
        saleId: open.id,
        name: open.name,
        ownerUid: open.ownerUid,
      }),
    );
}

/** A refused read of the sale's things alone could be a one-off, so removal is declared only once the sale itself is refused too. */
function noteRemovalIfSaleRefused(
  uid: string,
  saleId: string,
  dispatch: AppDispatch,
) {
  void canReadSale(saleId).then((isReadable) => {
    if (!isReadable && store.getState().goingOnce.openSale.sale?.id === saleId)
      noteRemoval(uid, dispatch, () => false);
  });
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
        const { leavingSaleId } = store.getState().goingOnce;
        if (leavingSaleId && !sales.some((sale) => sale.id === leavingSaleId))
          dispatch(setLeavingSaleId(null));
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
        if (isPermissionDenied(error)) noteRemoval(uid, dispatch, () => false);
        dispatch(setOpenSaleError());
      },
    );
    const unsubscribeItems = startOpenSaleItemsListener(
      saleId,
      (items) => dispatch(setItems({ saleId, items })),
      (error) => {
        if (isPermissionDenied(error))
          noteRemovalIfSaleRefused(uid, saleId, dispatch);
        dispatch(setItemsError());
      },
    );
    const unsubscribeInvites = startSaleInvitesListener(saleId, (invites) =>
      dispatch(setSaleInvites({ saleId, invites })),
    );
    const unsubscribeNew = startNewInquiriesListener(
      saleId,
      (items) => dispatch(setInquiries({ saleId, list: 'new', items })),
      () => dispatch(setInquiriesError({ saleId, list: 'new' })),
    );
    const unsubscribeHandled = startHandledInquiriesListener(
      saleId,
      (items) => dispatch(setInquiries({ saleId, list: 'handled', items })),
      () => dispatch(setInquiriesError({ saleId, list: 'handled' })),
    );
    return () => {
      unsubscribeNew();
      unsubscribeHandled();
      dispatch(clearInquiries());
      unsubscribeSale();
      unsubscribeItems();
      unsubscribeInvites();
      dispatch(clearOpenSale());
      dispatch(clearItems());
      dispatch(clearSaleInvites());
    };
  }, [uid, saleId, dispatch]);
}

import { useEffect } from 'react';

import type { Unsubscribe } from 'firebase/firestore';

import {
  store,
  useAppDispatch,
  useAppSelector,
  type AppDispatch,
} from '@/store';
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
  setPushOffSaleIds,
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
import { startPushOffListener } from '@apps/going-once/store/listeners/peopleListener';
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

const RETRY_DELAYS_MS = [500, 1000, 2000, 4000];

/** A sale this person just started is written in the background, so the server can refuse its things for a moment; restarts the listener with a growing wait before reporting that refusal. */
function listenWithRetry(
  start: (onError: (error: unknown) => void) => Unsubscribe,
  canRetry: (error: unknown) => boolean,
  onFailed: (error: unknown) => void,
): Unsubscribe {
  let stop: Unsubscribe = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isStopped = false;
  const run = (attempt: number) => {
    stop = start((error) => {
      const delay = RETRY_DELAYS_MS[attempt];
      if (isStopped) return;
      if (delay === undefined || !isPermissionDenied(error) || !canRetry(error))
        return onFailed(error);
      timer = setTimeout(() => run(attempt + 1), delay);
    });
  };
  run(0);
  return () => {
    isStopped = true;
    clearTimeout(timer);
    stop();
  };
}

/** Starts the listeners: the person's sales and invitations, and the open sale, its things and its invitations once one is chosen. */
export function useGoingOnceSync(
  uid: string | null,
  verifiedEmail: string | null,
  saleId: string | null,
) {
  const dispatch = useAppDispatch();
  const loadAttempt = useAppSelector((state) => state.goingOnce.loadAttempt);

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
  }, [uid, dispatch, loadAttempt]);

  useEffect(() => {
    if (!uid) return;
    const stop = startPushOffListener(uid, (saleIds) =>
      dispatch(setPushOffSaleIds(saleIds)),
    );
    return () => {
      stop();
      dispatch(setPushOffSaleIds(null));
    };
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
    const unsubscribeInvites = startSaleInvitesListener(saleId, (invites) =>
      dispatch(setSaleInvites({ saleId, invites })),
    );
    return () => {
      unsubscribeSale();
      unsubscribeInvites();
      dispatch(clearOpenSale());
      dispatch(clearSaleInvites());
    };
  }, [uid, saleId, dispatch]);

  useEffect(() => {
    if (!uid || !saleId) return;
    const isOwnSale = () =>
      store.getState().goingOnce.openSale.sale?.ownerUid === uid;
    const unsubscribeItems = listenWithRetry(
      (onError) =>
        startOpenSaleItemsListener(
          saleId,
          (items) => dispatch(setItems({ saleId, items })),
          onError,
        ),
      isOwnSale,
      (error) => {
        if (isPermissionDenied(error))
          noteRemovalIfSaleRefused(uid, saleId, dispatch);
        dispatch(setItemsError());
      },
    );
    const unsubscribeNew = listenWithRetry(
      (onError) =>
        startNewInquiriesListener(
          saleId,
          (items) => dispatch(setInquiries({ saleId, list: 'new', items })),
          onError,
        ),
      isOwnSale,
      () => dispatch(setInquiriesError({ saleId, list: 'new' })),
    );
    const unsubscribeHandled = listenWithRetry(
      (onError) =>
        startHandledInquiriesListener(
          saleId,
          (items) => dispatch(setInquiries({ saleId, list: 'handled', items })),
          onError,
        ),
      isOwnSale,
      () => dispatch(setInquiriesError({ saleId, list: 'handled' })),
    );
    return () => {
      unsubscribeNew();
      unsubscribeHandled();
      unsubscribeItems();
      dispatch(clearInquiries());
      dispatch(clearItems());
    };
  }, [uid, saleId, dispatch, loadAttempt]);
}

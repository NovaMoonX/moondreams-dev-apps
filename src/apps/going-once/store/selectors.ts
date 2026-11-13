import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { FINISHED_SALE_STATUS } from '@apps/going-once/constants';
import type {
  Bundle,
  Inquiry,
  Item,
  Sale,
  SaleEmailInvite,
} from '@apps/going-once/types';
import { getStatusSummary } from '@apps/going-once/utils/statusSummary';

export const selectSales = (state: RootState) => state.goingOnce.sales.items;

export const selectSalesStatus = (state: RootState) =>
  state.goingOnce.sales.status;

/** Whether the sale with this id is finished. */
export const selectIsSaleFinished = (state: RootState, saleId: string | null) =>
  selectSaleById(state, saleId)?.status === FINISHED_SALE_STATUS;

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

/** The open sale's things by id; empty while another sale's are still arriving. */
export const selectItemsById = createSelector(
  [
    (state: RootState) => state.goingOnce.items,
    (_state: RootState, saleId: string | null) => saleId,
  ],
  (items, saleId): Record<string, Item> =>
    items.saleId === saleId
      ? Object.fromEntries(items.items.map((item) => [item.id, item]))
      : {},
);

const NO_BUNDLES: Bundle[] = [];

/** The open sale's bundles in the order they were made; empty while another sale's are still arriving. */
export const selectBundles = createSelector(
  [
    (state: RootState) => state.goingOnce.bundles,
    (_state: RootState, saleId: string | null) => saleId,
  ],
  (bundles, saleId): Bundle[] =>
    bundles.saleId === saleId && bundles.items.length > 0
      ? [...bundles.items].sort(
          (first, second) => first.createdAt - second.createdAt,
        )
      : NO_BUNDLES,
);

/** The bundle with this id in the open sale, or `null`. */
export const selectBundleById = (
  state: RootState,
  saleId: string | null,
  bundleId: string | null,
): Bundle | null =>
  state.goingOnce.bundles.saleId === saleId && bundleId !== null
    ? (state.goingOnce.bundles.items.find((found) => found.id === bundleId) ??
      null)
    : null;

/** The open sale's counts and sums per status, worked out once per change to its things. */
export const selectStatusSummary = createSelector([selectItems], (items) =>
  getStatusSummary(items),
);

/** Whether this sale's bundles have arrived, so a missing bundle id means it is gone rather than still loading. */
export const selectIsBundlesReady = (state: RootState, saleId: string | null) =>
  state.goingOnce.bundles.saleId === saleId &&
  state.goingOnce.bundles.status === 'ready';

export const selectItemsStatus = (state: RootState) =>
  state.goingOnce.items.status;

export const selectPhotoUploads = (state: RootState) =>
  state.goingOnce.photoUploads;

export const selectMyInvites = (state: RootState) => state.goingOnce.myInvites;

/** The open sale's waiting invitations, oldest first; empty while another sale's are still arriving. */
export const selectSaleInvites = createSelector(
  [
    (state: RootState) => state.goingOnce.saleInvites,
    (_state: RootState, saleId: string | null) => saleId,
  ],
  (saleInvites, saleId): SaleEmailInvite[] =>
    saleInvites.saleId === saleId
      ? [...saleInvites.invites].sort(
          (first, second) => first.createdAt - second.createdAt,
        )
      : [],
);

export const selectRemovedFrom = (state: RootState) =>
  state.goingOnce.removedFrom;

const NO_INQUIRIES: Inquiry[] = [];

/** The open sale's New inquiries, newest sent first; empty while another sale's are still arriving. */
export const selectNewInquiries = (
  state: RootState,
  saleId: string | null,
): Inquiry[] =>
  state.goingOnce.inquiries.saleId === saleId
    ? state.goingOnce.inquiries.new.items
    : NO_INQUIRIES;

/** The open sale's newest Handled inquiries, most recently handled first. */
export const selectHandledInquiries = (
  state: RootState,
  saleId: string | null,
): Inquiry[] =>
  state.goingOnce.inquiries.saleId === saleId
    ? state.goingOnce.inquiries.handled.items
    : NO_INQUIRIES;

/** Whether both inquiry lists have answered for this sale. */
export const selectInquiriesStatus = (
  state: RootState,
  saleId: string | null,
): 'loading' | 'ready' | 'error' => {
  const { inquiries } = state.goingOnce;
  if (inquiries.saleId !== saleId) return 'loading';
  const statuses = [inquiries.new.status, inquiries.handled.status];
  if (statuses.includes('error')) return 'error';
  return statuses.every((status) => status === 'ready') ? 'ready' : 'loading';
};

/** Whether this person's interest push is off for the sale; `null` until their settings are read. */
export const selectIsInquiryPushOff = (
  state: RootState,
  saleId: string,
): boolean | null => {
  const { pushOffSaleIds } = state.goingOnce;
  return pushOffSaleIds === null ? null : pushOffSaleIds.includes(saleId);
};

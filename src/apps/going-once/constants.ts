import type {
  InboxView,
  InterestResult,
  ItemCondition,
  ItemStatus,
  PaymentMethod,
  SaleDetailField,
  SaleStatus,
} from '@apps/going-once/types';

/** The feature switch for starting new sales (`FEATURE_GATES`). */
export const CREATE_SALES_GATE_ID = 'create-sales';

export const GOING_ONCE_TABS = ['things', 'inbox', 'sale'] as const;

export const DEFAULT_GOING_ONCE_TAB = 'things';

export const GOING_ONCE_TAB_LABELS = {
  things: 'Things',
  inbox: 'Inbox',
  sale: 'Sale',
} as const;

export const SALE_NAME_SUGGESTIONS = [
  'Clear-out',
  'Garage sale',
  'Estate sale',
] as const;

export const MAX_SALE_NAME_LENGTH = 80;
export const MAX_PICKUP_AREA_LENGTH = 80;
export const MAX_BUYER_NOTE_LENGTH = 300;

/** The ways to pay a seller can pick in one tap; they may add their own. */
export const PAYMENT_METHOD_SUGGESTIONS = [
  'Cash',
  'Venmo',
  'Zelle',
  'PayPal',
  'Cash App',
  'Card',
] as const;

export const MAX_PAYMENT_METHODS = 8;
export const MAX_PAYMENT_METHOD_LENGTH = 30;

/** A public page's address in the app, followed by the link's id. */
export const SALE_PAGE_PATH = '/going-once/s/';

/** A public link id is 26 characters of the 32-letter share alphabet. */
export const SALE_LINK_ID_PATTERN = /^[2-9a-hj-np-z]{26}$/;

/** Co-sellers and waiting invites together, per sale. */
export const MAX_CO_SELLERS = 10;

/** The sale's editable details on the Sale tab: what each is called, what an empty one invites and what it tells the seller. */
export const SALE_DETAILS: Record<
  SaleDetailField,
  { label: string; empty: string; hint: string | null }
> = {
  name: {
    label: 'Name',
    empty: 'Name your sale',
    hint: 'Buyers see this. Leave out your name and address.',
  },
  pickupArea: {
    label: 'Pickup area',
    empty: 'Add a pickup area',
    hint: 'An area, never your address. Buyers see this.',
  },
  buyerNote: {
    label: 'Note for buyers',
    empty: 'Add a note for buyers',
    hint: 'Buyers see this.',
  },
};

/** What a row says under a sale detail's value: all of them reach the public page. */
export const SALE_DETAIL_NOTES: Record<SaleDetailField, string> = {
  name: 'Buyers see this. Leave out your name and address.',
  pickupArea: 'Buyers see this',
  buyerNote: 'Buyers see this',
};

/** `check:going-once-share` fails when this drifts from the functions' `FINISHED_SALE_STATUS`. */
export const FINISHED_SALE_STATUS = 'FINISHED' satisfies SaleStatus;

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  OPEN: 'Open',
  FINISHED: 'Finished',
};

export const MAX_ITEM_PHOTOS = 12;
export const MAX_ITEM_TITLE_LENGTH = 120;
export const MAX_ITEM_DESCRIPTION_LENGTH = 2000;
export const MAX_ITEM_BRAND_LENGTH = 80;
export const MAX_ITEM_SIZE_LENGTH = 80;
export const MAX_STORE_URL_LENGTH = 2000;
export const MAX_BOUGHT_FROM_LENGTH = 120;
export const MAX_ITEM_NOTES_LENGTH = 1000;
export const MAX_BUYER_NAME_LENGTH = 80;

/** How many status changes a thing keeps. */
export const MAX_STATUS_HISTORY = 50;

/** How long after adding a thing its co-seller can still delete it; `firestore.rules` holds the same ten minutes. */
export const CO_SELLER_DELETE_WINDOW_MS = 10 * 60_000;

/** The Things tab shows a search field from this many things. */
export const SEARCH_FROM_ITEMS = 8;

export const ITEM_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price', label: 'Price' },
  { value: 'name', label: 'Name' },
] as const;

export const CONDITION_OPTIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'LIKE_NEW', label: 'Like new' },
  { value: 'GOOD', label: 'Good' },
  { value: 'FAIR', label: 'Fair' },
  { value: 'WELL_USED', label: 'Well used' },
] as const satisfies readonly { value: ItemCondition; label: string }[];

export const CONDITION_LABELS: Record<ItemCondition, string> = {
  NEW: 'New',
  LIKE_NEW: 'Like new',
  GOOD: 'Good',
  FAIR: 'Fair',
  WELL_USED: 'Well used',
};

/** What a thing that buyers can't be shown yet is called where a status word would stand. */
export const NOT_LISTED_LABEL = 'Not listed yet';

/** What an Available thing is called once the sale is finished: it didn't find a buyer. */
export const DID_NOT_SELL_LABEL = "Didn't sell";

export const STATUS_LABELS: Record<ItemStatus, string> = {
  AVAILABLE: 'Available',
  PENDING: 'Pending',
  SOLD: 'Sold',
  WITHDRAWN: 'Taken off the list',
};

/** The Things tab's switch; taken-off things sit at the end of Sold. */
export const STATUS_VIEWS = ['AVAILABLE', 'PENDING', 'SOLD'] as const;

/** The Things tab's status in the address (`?status=sold`); Available is the default and leaves the address clean. */
export const STATUS_VIEW_PARAMS = {
  available: 'AVAILABLE',
  pending: 'PENDING',
  sold: 'SOLD',
} as const;

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'VENMO', label: 'Venmo' },
  { value: 'ZELLE', label: 'Zelle' },
  { value: 'OTHER', label: 'Other' },
] as const satisfies readonly { value: PaymentMethod; label: string }[];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  VENMO: 'Venmo',
  ZELLE: 'Zelle',
  OTHER: 'Other',
};

export const MAX_INQUIRY_NAME_LENGTH = 80;
export const MAX_INQUIRY_CONTACT_LENGTH = 254;
export const MAX_INQUIRY_MESSAGE_LENGTH = 1000;

export const HANDLED_INBOX_LIMIT = 30;

export const INBOX_VIEWS = [
  'new',
  'handled',
] as const satisfies readonly InboxView[];

export const INBOX_VIEW_LABELS: Record<InboxView, string> = {
  new: 'New',
  handled: 'Handled',
};

export const INTEREST_REFUSALS: Record<
  Exclude<InterestResult['status'], 'sent' | 'invalid'>,
  string
> = {
  not_found: "This sale isn't taking messages anymore.",
  not_available: 'This one just sold, sorry.',
  busy: "This sale isn't taking messages right now. Try again tomorrow.",
  full: 'This one already has plenty of messages. Try again later.',
  slow_down: "That's a few messages in a row. Try again in a little while.",
};

export const INTEREST_FAILURE =
  "Couldn't send. Check your connection and try again.";

export const INTEREST_INVALID_FIELDS = {
  name: 'Add your name.',
  contact: "That phone or email doesn't look right.",
  message: 'That message is too long.',
} as const;

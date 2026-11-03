import type { LinkPreview } from '@/lib/linkMetadata/types';
import type { GOING_ONCE_TABS } from '@apps/going-once/constants';

export type GoingOnceTab = (typeof GOING_ONCE_TABS)[number];

export type SaleCurrency = 'USD';

/** The details of a sale its seller can edit. */
export type SaleDetailField = 'name' | 'pickupArea' | 'buyerNote';

/** A sale, the container its things belong to (`apps/going-once/sales/{saleId}`). */
export interface Sale {
  id: string;
  name: string;
  /** An area, never an address. */
  pickupArea: string | null;
  buyerNote: string | null;
  currency: SaleCurrency;
  /** The seller's IANA zone, which the push's quiet hours follow; `null` on a sale from before it was kept, until the seller opens it. */
  timeZone: string | null;
  /** The seller; never changes. */
  ownerUid: string;
  createdBy: string;
  /** The seller and any co-sellers; every rule keys off it. */
  members: string[];
  /** When each member joined, by uid; a sale from before co-sellers may lack some. */
  memberJoinedAt: Record<string, number>;
  /** The address of the sale's public page; written only by `changeSalePublicLink`. */
  publicLinkId: string | null;
  /** When the address was made or last renewed. */
  publicLinkChangedAt: number | null;
  createdAt: number;
  lastEditedAt: number | null;
}

/** The seller's standing welcome for an email address (`apps/going-once/emailInvites/{saleId}_{email}`). */
export interface SaleEmailInvite {
  saleId: string;
  /** Lowercased. */
  email: string;
  invitedBy: string;
  /** Copied in so the invitee never reads the sale before joining. */
  saleName: string;
  inviterName: string;
  createdAt: number;
}

export type ItemCondition = 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR' | 'WELL_USED';

export type ItemStatus = 'AVAILABLE' | 'PENDING' | 'SOLD' | 'WITHDRAWN';

export type PaymentMethod = 'CASH' | 'VENMO' | 'ZELLE' | 'OTHER';

/** Who is set to pick a thing up (`pending`); cleared on Back to available and on Sold. */
export interface ItemPendingRecord {
  /** Set by the inquiry rows that arrive with the inbox. */
  inquiryId: string | null;
  /** A typed name; the buyer's personal data. */
  buyerName: string | null;
  /** A date-only value (UTC midnight). */
  pickupOn: number | null;
  markedBy: string;
  markedAt: number;
}

/** What a thing sold for (`sale`); cleared by Not sold after all. */
export interface ItemSaleRecord {
  priceCents: number;
  method: PaymentMethod | null;
  /** A date-only value (UTC midnight). */
  soldOn: number;
  /** Carried over from the hold it was sold from; the buyer's personal data. */
  buyerName: string | null;
  markedBy: string;
  markedAt: number;
}

/** Which act wrote a history entry; the words of a history row come from it. */
export type StatusChangeKind =
  | 'MARK_PENDING'
  | 'CHANGE_HOLD'
  | 'BACK_TO_AVAILABLE'
  | 'MARK_SOLD'
  | 'CHANGE_PAID'
  | 'NOT_SOLD'
  | 'RESTORE_SALE'
  | 'TAKE_OFF'
  | 'PUT_BACK';

/** One entry of a thing's status history; a corrected price carries the figure it replaced, an undone sale the figure it undid. */
export interface StatusChange {
  kind: StatusChangeKind;
  status: ItemStatus;
  byUid: string;
  at: number;
  priceCents: number | null;
  fromPriceCents: number | null;
  /** The hold's name after a Mark pending or a changed hold; the buyer's personal data. */
  buyerName: string | null;
  /** The hold's date-only pickup day (UTC midnight) after a Mark pending or a changed hold. */
  pickupOn: number | null;
}

/** One stored listing-size photo; array order is display order and the first is the cover. */
export interface ItemPhoto {
  id: string;
  /** Storage path of the one stored file. */
  path: string;
  width: number;
  height: number;
  sizeBytes: number;
  createdAt: number;
}

/** A thing for sale (`apps/going-once/sales/{saleId}/items/{itemId}`). */
export interface Item {
  id: string;
  saleId: string;
  /** Empty until the person names it. */
  title: string;
  condition: ItemCondition | null;
  /** `0` is Free; `null` is no price yet. */
  askingPriceCents: number | null;
  /** Private: the lowest price the sellers will take. */
  floorPriceCents: number | null;
  description: string | null;
  brandModel: string | null;
  size: string | null;
  /** Private unless `showOriginalPrice`. */
  originalPriceCents: number | null;
  showOriginalPrice: boolean;
  /** Private: where it was bought. */
  boughtFrom: string | null;
  /** Private: a date-only value (UTC midnight). */
  boughtOn: number | null;
  /** Private: the store's page. */
  boughtUrl: string | null;
  boughtUrlPreview: LinkPreview | null;
  /** Private. */
  notes: string | null;
  photos: ItemPhoto[];
  status: ItemStatus;
  pending: ItemPendingRecord | null;
  sale: ItemSaleRecord | null;
  /** The last 50 status changes, oldest first. */
  statusHistory: StatusChange[];
  /** The most recent Copy listing text, so Mark sold can say to take that listing down. */
  listingCopiedAt: number | null;
  listingCopiedBy: string | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number | null;
  lastEditedBy: string | null;
}

/** One photo's two public copies (480px and 1,280px WebP), as Storage paths. */
export interface PublicPhoto {
  s: string;
  m: string;
}

/** A thing as the public page shows it: only the fields `getSalePage` allows. */
export interface PublicThing {
  id: string;
  title: string;
  description: string | null;
  brandModel: string | null;
  size: string | null;
  condition: ItemCondition | null;
  askingPriceCents: number;
  /** Set only when the seller chose to show it. */
  originalPriceCents: number | null;
  status: Extract<ItemStatus, 'AVAILABLE' | 'PENDING'>;
  /** Cover first, in the thing's order; only photos whose copies exist. */
  photos: PublicPhoto[];
}

/** What `getSalePage` answers: the page, or one `not_found` for every link that shows nothing. */
export type SalePageResult =
  | { status: 'not_found' }
  | {
      status: 'ok';
      sale: Pick<Sale, 'name' | 'pickupArea' | 'buyerNote'>;
      things: PublicThing[];
      /** True when the signed-in visitor is the seller or a co-seller. */
      isMember: boolean;
    };

export type SaleLinkAction = 'create' | 'renew' | 'stop';

export type InquiryStatus = 'NEW' | 'HANDLED';

/** A buyer's message about a thing; made and resent only by the server. */
export interface Inquiry {
  id: string;
  saleId: string;
  itemId: string;
  itemTitleAtSend: string;
  /** `null` once the sale's contacts are cleared. */
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  status: InquiryStatus;
  handledBy: string | null;
  handledAt: number | null;
  sendCount: number;
  createdAt: number;
  lastSentAt: number;
  contactClearedAt: number | null;
}

export type InterestResult =
  | { status: 'sent'; contact: 'email' | 'phone' }
  | {
      status: 'not_found' | 'not_available' | 'busy' | 'full' | 'slow_down';
    }
  | { status: 'invalid'; field: 'name' | 'contact' | 'message' };

export interface InterestRequest {
  linkId: string;
  itemId: string;
  name: string;
  contact: string;
  message: string;
  /** Left empty by a person; anything in it is a bot. */
  website: string;
}

export type InboxView = 'new' | 'handled';

/** A person's own settings (`apps/going-once/people/{uid}`). */
export interface PersonSettings {
  /** Sales whose "someone's interested" push this person turned off; a sale not listed is on. */
  inquiryPushOffSaleIds: string[];
}

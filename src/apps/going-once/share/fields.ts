import type { ShareDecision } from '@/lib/connections/fieldDecisions';
import type {
  Sale,
  SaleEmailInvite,
  ItemPendingRecord,
  ItemSaleRecord,
  StatusChange,
  ItemPhoto,
  Item,
  Inquiry,
  PersonSettings,
} from '@apps/going-once/types';

const SALE_FIELDS = {
  id: 'notUseful',
  name: 'shared',
  pickupArea: 'shared',
  buyerNote: 'shared',
  paymentMethods: 'shared',
  currency: 'shared',
  timeZone: 'notUseful',
  ownerUid: 'notUseful',
  createdBy: 'notUseful',
  members: 'filter',
  memberJoinedAt: 'notUseful',
  publicLinkId: 'notUseful',
  publicLinkChangedAt: 'notUseful',
  status: 'filter',
  finishedAt: 'notUseful',
  finishedBy: 'notUseful',
  contactsClearAt: 'notUseful',
  contactsClearedAt: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
} satisfies Record<keyof Sale, ShareDecision>;

const SALE_EMAIL_INVITE_FIELDS = {
  saleId: 'never',
  email: 'never',
  invitedBy: 'never',
  saleName: 'never',
  inviterName: 'never',
  createdAt: 'never',
} satisfies Record<keyof SaleEmailInvite, ShareDecision>;

const ITEM_PENDING_RECORD_FIELDS = {
  inquiryId: 'notUseful',
  buyerName: 'never',
  pickupOn: 'shared',
  markedBy: 'notUseful',
  markedAt: 'notUseful',
} satisfies Record<keyof ItemPendingRecord, ShareDecision>;

const ITEM_SALE_RECORD_FIELDS = {
  priceCents: 'shared',
  method: 'never',
  soldOn: 'never',
  buyerName: 'never',
  markedBy: 'never',
  markedAt: 'never',
} satisfies Record<keyof ItemSaleRecord, ShareDecision>;

const STATUS_CHANGE_FIELDS = {
  kind: 'never',
  status: 'never',
  byUid: 'never',
  at: 'never',
  priceCents: 'never',
  fromPriceCents: 'never',
  buyerName: 'never',
  pickupOn: 'never',
} satisfies Record<keyof StatusChange, ShareDecision>;

const ITEM_PHOTO_FIELDS = {
  id: 'notUseful',
  path: 'notUseful',
  width: 'notUseful',
  height: 'notUseful',
  sizeBytes: 'notUseful',
  createdAt: 'notUseful',
} satisfies Record<keyof ItemPhoto, ShareDecision>;

const ITEM_FIELDS = {
  id: 'notUseful',
  saleId: 'notUseful',
  title: 'shared',
  condition: 'notUseful',
  askingPriceCents: 'shared',
  floorPriceCents: 'never',
  description: 'notUseful',
  brandModel: 'notUseful',
  size: 'notUseful',
  originalPriceCents: 'never',
  showOriginalPrice: 'notUseful',
  boughtFrom: 'never',
  boughtOn: 'never',
  boughtUrl: 'never',
  boughtUrlPreview: 'never',
  showBoughtUrl: 'notUseful',
  notes: 'never',
  isDraft: 'filter',
  photos: 'filter',
  status: 'filter',
  pending: 'shared',
  sale: 'filter',
  statusHistory: 'notUseful',
  listingCopiedAt: 'notUseful',
  listingCopiedBy: 'notUseful',
  createdBy: 'notUseful',
  createdAt: 'notUseful',
  lastEditedAt: 'shared',
  lastEditedBy: 'notUseful',
} satisfies Record<keyof Item, ShareDecision>;

const INQUIRY_FIELDS = {
  id: 'never',
  saleId: 'never',
  itemId: 'never',
  itemTitleAtSend: 'never',
  name: 'never',
  email: 'never',
  phone: 'never',
  message: 'never',
  status: 'filter',
  handledBy: 'never',
  handledAt: 'never',
  sendCount: 'never',
  createdAt: 'never',
  lastSentAt: 'never',
  contactClearedAt: 'never',
} satisfies Record<keyof Inquiry, ShareDecision>;

const PERSON_SETTINGS_FIELDS = {
  inquiryPushOffSaleIds: 'notUseful',
} satisfies Record<keyof PersonSettings, ShareDecision>;

/** What going-once lets Helm read, per stored field; an added, removed or renamed field fails the typecheck until it is decided here. */
export const SHARE_FIELDS = {
  Sale: SALE_FIELDS,
  SaleEmailInvite: SALE_EMAIL_INVITE_FIELDS,
  ItemPendingRecord: ITEM_PENDING_RECORD_FIELDS,
  ItemSaleRecord: ITEM_SALE_RECORD_FIELDS,
  StatusChange: STATUS_CHANGE_FIELDS,
  ItemPhoto: ITEM_PHOTO_FIELDS,
  Item: ITEM_FIELDS,
  Inquiry: INQUIRY_FIELDS,
  PersonSettings: PERSON_SETTINGS_FIELDS,
};

/** Exported types that are not stored, so have no fields to decide. */
export const NOT_STORED: Record<string, string> = {
  PublicPhoto: 'public page response',
  PublicThing: 'public page response',
  InterestRequest: 'callable request',
};

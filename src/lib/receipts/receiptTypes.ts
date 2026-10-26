/** What kind of purchase a receipt is for, so an app can pick its own category for it. */
export const RECEIPT_KINDS = [
  'RESTAURANT',
  'GROCERY',
  'TRANSPORT',
  'LODGING',
  'ENTERTAINMENT',
  'SHOPPING',
  'OTHER',
] as const;

export type ReceiptKind = (typeof RECEIPT_KINDS)[number];

export interface ReceiptLineReading {
  name: string;
  /** How many were bought; 1 when the receipt doesn't say. */
  quantity: number;
  /** The price of one, when the receipt shows it. */
  unitPriceCents: number | null;
  /** The line total in cents: the price already multiplied by the quantity. */
  priceCents: number;
}

export interface ReceiptSuggestedTip {
  percent: number;
  /** The tip in cents at that percent, when the receipt prints it. */
  tipCents: number | null;
  /** The total with that tip in cents, when the receipt prints it. */
  totalCents: number | null;
}

/** What a bill, receipt or invoice says, in integer cents. `null` means the paper doesn't state it. */
export interface ReceiptReading {
  merchant: string | null;
  kind: ReceiptKind | null;
  /** Street address or the place the purchase was made, as printed. */
  address: string | null;
  /** YYYY-MM-DD, as printed. */
  date: string | null;
  /** 24-hour HH:mm, as printed. */
  time: string | null;
  /** 3-letter ISO code. */
  currency: string | null;
  lines: ReceiptLineReading[];
  /** Lines the reader saw but couldn't price. */
  unpricedLineCount: number;
  subtotalCents: number | null;
  /** All tax lines added together. */
  taxCents: number | null;
  /** Service, delivery and other charges. */
  feesCents: number | null;
  /** A reduction, as a positive number. */
  discountCents: number | null;
  /** A tip that was actually charged or written in. */
  tipCents: number | null;
  /** The tip amounts a bill suggests ("18% = $9.00"), never counted as a tip. */
  suggestedTips: ReceiptSuggestedTip[];
  totalCents: number | null;
}

export const MAX_RECEIPT_LINES = 80;
export const MAX_RECEIPT_NAME_LENGTH = 60;
export const MAX_RECEIPT_ADDRESS_LENGTH = 120;
export const MAX_RECEIPT_SUGGESTED_TIPS = 5;

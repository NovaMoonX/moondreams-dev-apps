/** What a bill, receipt or invoice says, in integer cents. `null` means the paper doesn't state it. */
export interface ReceiptReading {
  merchant: string | null;
  /** YYYY-MM-DD, as printed. */
  date: string | null;
  currency: string | null;
  lines: { name: string; priceCents: number }[];
  /** Lines the reader saw but couldn't price. */
  unpricedLineCount: number;
  subtotalCents: number | null;
  taxCents: number | null;
  /** Service, delivery and other charges. */
  feesCents: number | null;
  /** A reduction, as a positive number. */
  discountCents: number | null;
  /** A tip that was actually charged or written in, never a suggested one. */
  tipCents: number | null;
  totalCents: number | null;
}

export const MAX_RECEIPT_LINES = 80;
export const MAX_RECEIPT_NAME_LENGTH = 60;

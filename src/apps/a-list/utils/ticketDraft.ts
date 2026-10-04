import { MAX_AMOUNT_CENTS, MAX_TAX_RATE } from '@apps/a-list/constants';
import type { AmcFormat, Ticket } from '@apps/a-list/types';
import { centsToInputValue, parseMoneyToCents } from '@apps/a-list/utils/money';

/** The three amounts AMC itemizes on every ticket, in dollars as typed, plus its format. */
export interface TicketDraft {
  format: AmcFormat;
  /** Before tax. */
  price: string;
  standardPrice: string;
  fee: string;
  tax: string;
}

export function getInitialTicketDraft(
  ticket: Ticket | null,
  defaultFeeCents: number,
): TicketDraft {
  if (ticket) {
    return {
      format: ticket.format,
      price: centsToInputValue(ticket.priceCents),
      standardPrice: centsToInputValue(ticket.standardPriceCents),
      fee: centsToInputValue(ticket.feeAvoidedCents),
      tax: centsToInputValue(ticket.taxCents),
    };
  }

  return {
    format: 'STANDARD',
    price: '',
    standardPrice: '',
    fee: centsToInputValue(defaultFeeCents),
    tax: '',
  };
}

export interface TicketDraftResult {
  ticket: Ticket | null;
  errors: {
    price?: string;
    standardPrice?: string;
    fee?: string;
    tax?: string;
  };
  isValid: boolean;
}

const TOO_BIG = "That's more than $10,000. Double-check it?";

function parseAmount(value: string): { cents: number | null; error?: string } {
  if (value.trim() === '') return { cents: null };
  const cents = parseMoneyToCents(value);
  if (cents === null)
    return { cents: null, error: 'Enter an amount like 18.50.' };
  if (cents > MAX_AMOUNT_CENTS) return { cents: null, error: TOO_BIG };
  return { cents };
}

export function evaluateTicketDraft(draft: TicketDraft): TicketDraftResult {
  const price = parseAmount(draft.price);
  const fee = parseAmount(draft.fee);
  const tax = parseAmount(draft.tax);
  const isPremium = draft.format !== 'STANDARD';
  const standard = isPremium
    ? parseAmount(draft.standardPrice)
    : { cents: null };
  const isTaxTooHigh =
    price.cents !== null &&
    price.cents > 0 &&
    tax.cents !== null &&
    tax.cents / price.cents > MAX_TAX_RATE;
  const errors = {
    price: price.error,
    standardPrice: standard.error,
    fee: fee.error,
    tax: isTaxTooHigh
      ? "That's more than 25% of the price. Double-check the tax?"
      : tax.error,
  };
  const hasError = Object.values(errors).some(Boolean);

  if (
    hasError ||
    price.cents === null ||
    fee.cents === null ||
    tax.cents === null
  ) {
    return { ticket: null, errors, isValid: false };
  }

  const ticket: Ticket = {
    entryMode: 'ITEMIZED',
    format: draft.format,
    priceCents: price.cents,
    standardPriceCents: isPremium ? standard.cents : null,
    feeAvoidedCents: fee.cents,
    taxRate:
      price.cents > 0
        ? Math.round((tax.cents / price.cents) * 10_000) / 10_000
        : null,
    taxCents: tax.cents,
    totalCents: price.cents + fee.cents + tax.cents,
  };
  const isValid = ticket.totalCents <= MAX_AMOUNT_CENTS;
  return {
    ticket: isValid ? ticket : null,
    errors: isValid ? errors : { ...errors, price: TOO_BIG },
    isValid,
  };
}

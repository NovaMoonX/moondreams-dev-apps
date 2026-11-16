import { MAX_AMOUNT_CENTS, MAX_TAX_RATE } from '@apps/a-list/constants';
import type { AmcFormat, TaxChoice, Ticket } from '@apps/a-list/types';
import type { TicketSuggestion } from '@apps/a-list/utils/chips';
import { getItemizedTaxCents } from '@apps/a-list/utils/tax';
import { centsToInputValue, parseMoneyToCents } from '@/utils/moneyUtils';

/** The three amounts AMC itemizes on every ticket, in dollars as typed, plus its format. */
export interface TicketDraft {
  format: AmcFormat;
  /** Before tax. */
  price: string;
  standardPrice: string;
  fee: string;
  tax: string;
  /** Until the member types or picks one, the fee and tax follow the suggestion for the theater, format and price. */
  isFeeEdited: boolean;
  isTaxEdited: boolean;
  /** AMC's tax for the picked showing; null with no pick or when AMC lists none. */
  amcTaxCents: number | null;
  /** The saved ticket's choice and the tax it was made on, kept while that tax is unchanged. */
  savedTaxChoice: { taxCents: number; choice: TaxChoice | null } | null;
}

/** The two figures the tax can start from, offered side by side when both exist and disagree. */
export interface TaxOptions {
  amcCents: number;
  usualCents: number;
  usualRate: number;
}

export function getTaxOptions(
  draft: TicketDraft,
  suggestion: TicketSuggestion | null,
): TaxOptions | null {
  const priceCents = parseMoneyToCents(draft.price);
  const usualRate = suggestion?.usualTaxRate ?? null;
  if (draft.amcTaxCents === null || priceCents === null || usualRate === null)
    return null;
  const usualCents = getItemizedTaxCents(priceCents, usualRate);
  if (usualCents === draft.amcTaxCents) return null;
  return { amcCents: draft.amcTaxCents, usualCents, usualRate };
}

/** The tax an untouched field starts with: with AMC's figure, whichever this theater keeps; otherwise the rate learned here. */
function getSuggestedTax(
  draft: TicketDraft,
  suggestion: TicketSuggestion | null,
): string {
  const options = getTaxOptions(draft, suggestion);
  if (options)
    return centsToInputValue(
      suggestion?.preferredTaxChoice === 'AMC'
        ? options.amcCents
        : options.usualCents,
    );
  if (draft.amcTaxCents !== null) return centsToInputValue(draft.amcTaxCents);
  const priceCents = parseMoneyToCents(draft.price);
  return priceCents !== null && suggestion && suggestion.taxRate !== null
    ? centsToInputValue(getItemizedTaxCents(priceCents, suggestion.taxRate))
    : '';
}

function getTaxChoice(
  draft: TicketDraft,
  options: TaxOptions | null,
  taxCents: number,
): TaxChoice | null {
  if (options) {
    if (taxCents === options.amcCents) return 'AMC';
    return taxCents === options.usualCents ? 'USUAL' : null;
  }
  return draft.savedTaxChoice?.taxCents === taxCents
    ? draft.savedTaxChoice.choice
    : null;
}

export function getInitialTicketDraft(ticket: Ticket | null): TicketDraft {
  if (ticket) {
    return {
      format: ticket.format,
      price: centsToInputValue(ticket.priceCents),
      standardPrice: centsToInputValue(ticket.standardPriceCents),
      fee: centsToInputValue(ticket.feeAvoidedCents),
      tax: centsToInputValue(ticket.taxCents),
      isFeeEdited: true,
      isTaxEdited: true,
      amcTaxCents: null,
      savedTaxChoice: {
        taxCents: ticket.taxCents,
        choice: ticket.taxChoice ?? null,
      },
    };
  }

  return {
    format: 'STANDARD',
    price: '',
    standardPrice: '',
    fee: '',
    tax: '',
    isFeeEdited: false,
    isTaxEdited: false,
    amcTaxCents: null,
    savedTaxChoice: null,
  };
}

/** The draft with an untouched fee and tax filled from the suggestion; the tax follows the price typed so far. */
export function resolveTicketDraft(
  draft: TicketDraft,
  suggestion: TicketSuggestion | null,
): TicketDraft {
  const result = {
    ...draft,
    fee:
      draft.isFeeEdited || !suggestion
        ? draft.fee
        : centsToInputValue(suggestion.feeCents),
    tax: draft.isTaxEdited ? draft.tax : getSuggestedTax(draft, suggestion),
  };
  return result;
}

/** AMC's tax is for the price and format it listed; typing another drops it. */
function isSameShowingPrice(
  draft: TicketDraft,
  data: Partial<Pick<TicketDraft, 'format' | 'price'>>,
): boolean {
  const result =
    (data.price === undefined ||
      parseMoneyToCents(data.price) === parseMoneyToCents(draft.price)) &&
    (data.format === undefined || data.format === draft.format);
  return result;
}

/** Applies the form's new values; `edited` says which of the fee and tax the member just typed or picked. */
export function applyTicketFormChange(
  draft: TicketDraft,
  data: Partial<
    Pick<TicketDraft, 'format' | 'price' | 'standardPrice' | 'fee' | 'tax'>
  >,
  edited: { fee: boolean; tax: boolean },
): TicketDraft {
  const result = {
    ...draft,
    ...data,
    isFeeEdited: draft.isFeeEdited || edited.fee,
    isTaxEdited: draft.isTaxEdited || edited.tax,
    amcTaxCents: isSameShowingPrice(draft, data) ? draft.amcTaxCents : null,
  };
  return result;
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

export function evaluateTicketDraft(
  rawDraft: TicketDraft,
  suggestion: TicketSuggestion | null,
): TicketDraftResult {
  const draft = resolveTicketDraft(rawDraft, suggestion);
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
    taxChoice: getTaxChoice(draft, getTaxOptions(draft, suggestion), tax.cents),
    totalCents: price.cents + fee.cents + tax.cents,
  };
  const isValid = ticket.totalCents <= MAX_AMOUNT_CENTS;
  return {
    ticket: isValid ? ticket : null,
    errors: isValid ? errors : { ...errors, price: TOO_BIG },
    isValid,
  };
}

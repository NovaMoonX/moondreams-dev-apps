import { MAX_AMOUNT_CENTS, MAX_TAX_RATE } from '@apps/a-list/constants';
import type { AmcFormat, Ticket, TicketEntryMode } from '@apps/a-list/types';
import { centsToInputValue, parseMoneyToCents } from '@apps/a-list/utils/money';
import { getItemizedTaxCents, splitAllInTotal } from '@apps/a-list/utils/tax';

export interface FeeValue {
  selected: number | 'OTHER';
  other: string;
}

export interface RateValue {
  selected: number | 'NONE' | 'OTHER';
  /** A percent, e.g. "8.875". */
  other: string;
}

export interface TicketDraft {
  entryMode: TicketEntryMode;
  format: AmcFormat;
  /** The price before tax when itemized, the total when all-in. */
  amount: string;
  standardPrice: string;
  fee: FeeValue;
  rate: RateValue;
}

export function getInitialTicketDraft(
  ticket: Ticket | null,
  defaultRate: number | null,
): TicketDraft {
  if (ticket) {
    return {
      entryMode: ticket.entryMode,
      format: ticket.format,
      amount: centsToInputValue(
        ticket.entryMode === 'ITEMIZED' ? ticket.priceCents : ticket.totalCents,
      ),
      standardPrice: centsToInputValue(ticket.standardPriceCents),
      fee: { selected: ticket.feeAvoidedCents, other: '' },
      rate: { selected: ticket.taxRate ?? 'NONE', other: '' },
    };
  }

  return {
    entryMode: 'ITEMIZED',
    format: 'STANDARD',
    amount: '',
    standardPrice: '',
    fee: { selected: 0, other: '' },
    rate: { selected: defaultRate ?? 'NONE', other: '' },
  };
}

export interface TicketDraftResult {
  ticket: Ticket | null;
  errors: {
    amount?: string;
    standardPrice?: string;
    fee?: string;
    rate?: string;
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

function resolveRate(rate: RateValue): { rate: number | null; error?: string } {
  if (rate.selected === 'NONE') return { rate: null };
  if (rate.selected !== 'OTHER') return { rate: rate.selected };
  const percent = Number(rate.other.trim().replace(/%$/, ''));
  if (rate.other.trim() === '' || !Number.isFinite(percent))
    return { rate: null, error: 'Enter a rate like 8.875.' };
  if (percent < 0 || percent / 100 > MAX_TAX_RATE)
    return { rate: null, error: 'Pick a rate from 0% to 25%.' };
  return { rate: Math.round(percent * 1000) / 100_000 };
}

export function evaluateTicketDraft(draft: TicketDraft): TicketDraftResult {
  const amount = parseAmount(draft.amount);
  const isPremium = draft.format !== 'STANDARD';
  const standard = isPremium
    ? parseAmount(draft.standardPrice)
    : { cents: null };
  const fee =
    draft.fee.selected === 'OTHER'
      ? parseAmount(draft.fee.other)
      : { cents: draft.fee.selected };
  const feeError =
    draft.fee.selected === 'OTHER' && draft.fee.other.trim() === ''
      ? 'Enter the fee, or pick $0.'
      : fee.error;
  const rate = resolveRate(draft.rate);
  const isAllIn = draft.entryMode === 'ALL_IN';
  const amountError =
    amount.error ??
    (isAllIn &&
    amount.cents !== null &&
    fee.cents !== null &&
    amount.cents < fee.cents
      ? "The total can't be less than the fee."
      : undefined);
  const errors = {
    amount: amountError,
    standardPrice: standard.error,
    fee: feeError,
    rate: rate.error,
  };
  const hasError = Object.values(errors).some(Boolean);

  if (hasError || amount.cents === null || fee.cents === null) {
    return { ticket: null, errors, isValid: false };
  }

  const split = isAllIn
    ? splitAllInTotal(amount.cents, fee.cents, rate.rate)
    : {
        priceCents: amount.cents,
        taxCents: getItemizedTaxCents(amount.cents, rate.rate),
      };
  const ticket: Ticket = {
    entryMode: draft.entryMode,
    format: draft.format,
    priceCents: split.priceCents,
    standardPriceCents: isPremium ? standard.cents : null,
    feeAvoidedCents: fee.cents,
    taxRate: rate.rate,
    taxCents: split.taxCents,
    totalCents: split.priceCents + fee.cents + split.taxCents,
  };
  const isValid = ticket.totalCents <= MAX_AMOUNT_CENTS;
  return {
    ticket: isValid ? ticket : null,
    errors: isValid ? errors : { ...errors, amount: TOO_BIG },
    isValid,
  };
}

import { useMemo, useState } from 'react';

import type { ReceiptReading } from '@/lib/receipts/receiptTypes';
import { generateUuid } from '@/utils/idUtils';
import { centsToInputValue, parseMoneyToCents } from '@/utils/moneyUtils';
import {
  getTipFromPercent,
  splitReceipt,
  sumLinesCents,
  type ReceiptLine,
  type ReceiptSplitResult,
  type TipSplit,
} from '@/utils/receiptSplitUtils';

export interface ReceiptPerson {
  id: string;
  name: string;
}

export type TipChoice = 'NONE' | 'RECEIPT' | '15' | '18' | '20' | 'CUSTOM';

export const TIP_PERCENTS = [15, 18, 20] as const;

interface ReceiptSplitState {
  lines: ReceiptLine[];
  claims: Record<string, string[]>;
  tax: string;
  fees: string;
  discount: string;
  tipChoice: TipChoice;
  customTip: string;
  tipSplit: TipSplit;
  openLineId: string | null;
}

const toMoneyText = (cents: number | null) => (cents ? centsToInputValue(cents) : '');
const toCents = (text: string) => parseMoneyToCents(text) ?? 0;

function getInitialState(reading: ReceiptReading | null): ReceiptSplitState {
  const lines = (reading?.lines ?? []).map((line) => ({ id: generateUuid(), ...line }));
  return {
    lines,
    claims: {},
    tax: toMoneyText(reading?.taxCents ?? null),
    fees: toMoneyText(reading?.feesCents ?? null),
    discount: toMoneyText(reading?.discountCents ?? null),
    tipChoice: reading?.tipCents ? 'RECEIPT' : 'NONE',
    customTip: '',
    tipSplit: 'PROPORTIONAL',
    openLineId: null,
  };
}

/** The state of one bill being split between people: who had which line, the charges on top, the tip, and what each person owes. The host draws the footer and reads `result` when the person is done. */
export function useReceiptSplit(reading: ReceiptReading | null, people: ReceiptPerson[]) {
  const [state, setState] = useState(() => getInitialState(reading));
  const peopleIds = useMemo(() => people.map((person) => person.id), [people]);
  const receiptTipCents = reading?.tipCents ?? 0;

  const taxCents = toCents(state.tax);
  const feesCents = toCents(state.fees);
  const discountCents = toCents(state.discount);

  const getTipCents = () => {
    if (state.tipChoice === 'NONE') return 0;
    if (state.tipChoice === 'RECEIPT') return receiptTipCents;
    if (state.tipChoice === 'CUSTOM') return toCents(state.customTip);
    return getTipFromPercent(state.lines, discountCents, Number(state.tipChoice));
  };
  const tipCents = getTipCents();

  const result: ReceiptSplitResult = useMemo(
    () =>
      splitReceipt({
        lines: state.lines,
        claims: state.claims,
        people: peopleIds,
        taxCents,
        feesCents,
        discountCents,
        tipCents,
        tipSplit: state.tipSplit,
      }),
    [state.lines, state.claims, state.tipSplit, peopleIds, taxCents, feesCents, discountCents, tipCents],
  );

  const patch = (changes: Partial<ReceiptSplitState>) => setState((current) => ({ ...current, ...changes }));

  const setLineClaims = (lineId: string, uids: string[]) =>
    setState((current) => ({ ...current, claims: { ...current.claims, [lineId]: uids } }));

  const updateLine = (lineId: string, changes: Partial<Pick<ReceiptLine, 'name' | 'priceCents'>>) =>
    setState((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === lineId ? { ...line, ...changes } : line)),
    }));

  const addLine = () => {
    const id = generateUuid();
    setState((current) => ({
      ...current,
      lines: [...current.lines, { id, name: '', priceCents: 0 }],
      openLineId: id,
    }));
  };

  const removeLine = (lineId: string) =>
    setState((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.id !== lineId),
      claims: Object.fromEntries(Object.entries(current.claims).filter(([id]) => id !== lineId)),
      openLineId: current.openLineId === lineId ? null : current.openLineId,
    }));

  const itemsCents = sumLinesCents(state.lines);
  const printedTotalCents = reading?.totalCents ?? null;
  const hasUnnamedLine = state.lines.some((line) => line.name.trim() === '');
  const isComplete =
    state.lines.length > 0 && result.unclaimedLineIds.length === 0 && !hasUnnamedLine && result.totalCents > 0;

  return {
    state,
    result,
    people,
    itemsCents,
    taxCents,
    feesCents,
    discountCents,
    tipCents,
    receiptTipCents,
    printedTotalCents,
    isComplete,
    patch,
    setLineClaims,
    updateLine,
    addLine,
    removeLine,
  };
}

export type ReceiptSplit = ReturnType<typeof useReceiptSplit>;

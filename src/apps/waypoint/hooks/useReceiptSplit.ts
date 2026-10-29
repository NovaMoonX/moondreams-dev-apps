import { useMemo, useState } from 'react';

import type { ReceiptReading } from '@/lib/receipts/receiptTypes';
import { generateUuid } from '@/utils/idUtils';
import { centsToInputValue, parseMoneyToCents } from '@/utils/moneyUtils';
import {
  getTipFromPercent,
  itemizeLine,
  splitReceipt,
  sumLinesCents,
  type ReceiptLine,
  type ReceiptSplitResult,
  type TipSplit,
} from '@apps/waypoint/utils/receiptSplit';

export interface ReceiptPerson {
  id: string;
  name: string;
}

export type TipChoice = 'NONE' | 'RECEIPT' | 'CUSTOM' | `${number}`;

const DEFAULT_TIP_PERCENTS = [15, 18, 20];

/** The percents the bill itself suggests, else the usual three. */
const getTipPercents = (reading: ReceiptReading | null) => {
  const suggested = Array.from(new Set((reading?.suggestedTips ?? []).map((tip) => tip.percent))).sort((a, b) => a - b);
  return suggested.length > 0 ? suggested : DEFAULT_TIP_PERCENTS;
};

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
  editingLineId: string | null;
}

const toMoneyText = (cents: number | null) => (cents ? centsToInputValue(cents) : '');
const toCents = (text: string) => parseMoneyToCents(text) ?? 0;

const MAX_ITEMIZED_LINES = 100;

const toSnapshot = (state: ReceiptSplitState) =>
  JSON.stringify([
    state.lines.map((line) => [line.name, line.priceCents]),
    Object.entries(state.claims)
      .filter(([, uids]) => uids.length > 0)
      .map(([id, uids]) => [id, [...uids].sort()]),
    [state.tax, state.fees, state.discount, state.tipChoice, state.customTip, state.tipSplit],
  ]);

function getInitialState(reading: ReceiptReading | null): ReceiptSplitState {
  const lines = (reading?.lines ?? []).reduce<ReceiptLine[]>((acc, line) => {
    const units = itemizeLine(line.name, line.quantity, line.priceCents, acc.length + line.quantity <= MAX_ITEMIZED_LINES);
    const groupId = units.length > 1 ? generateUuid() : undefined;
    return [...acc, ...units.map((unit) => ({ id: generateUuid(), ...unit, groupId }))];
  }, []);
  return {
    lines,
    claims: {},
    tax: toMoneyText(reading?.taxCents ?? null),
    fees: toMoneyText(reading?.feesCents ?? null),
    discount: toMoneyText(reading?.discountCents ?? null),
    tipChoice: reading?.tipCents ? 'RECEIPT' : 'NONE',
    customTip: '',
    tipSplit: 'PROPORTIONAL',
    openLineId: lines[0]?.id ?? null,
    editingLineId: lines[0] && (lines[0].name === '' || lines[0].priceCents === 0) ? lines[0].id : null,
  };
}

/** The state of one bill being split between people: who had which line, the charges on top, the tip, and what each person owes. The host draws the footer and reads `result` when the person is done. */
export function useReceiptSplit(reading: ReceiptReading | null, people: ReceiptPerson[]) {
  const [state, setState] = useState(() => getInitialState(reading));
  const [baseline] = useState(() => toSnapshot(state));
  const peopleIds = useMemo(() => people.map((person) => person.id), [people]);
  const receiptTipCents = reading?.tipCents ?? 0;
  const tipPercents = useMemo(() => getTipPercents(reading), [reading]);

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

  const setGroupClaims = (groupId: string, uids: string[]) =>
    setState((current) => ({
      ...current,
      claims: current.lines.reduce(
        (claims, line) => (line.groupId === groupId ? { ...claims, [line.id]: uids } : claims),
        current.claims,
      ),
    }));

  const setLineClaims = (lineId: string, uids: string[]) =>
    setState((current) => ({ ...current, claims: { ...current.claims, [lineId]: uids } }));

  const updateLine = (lineId: string, changes: Partial<Pick<ReceiptLine, 'name' | 'priceCents'>>) =>
    setState((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === lineId ? { ...line, ...changes } : line)),
    }));

  const openLine = (lineId: string | null) =>
    setState((current) => ({ ...current, openLineId: lineId, editingLineId: null }));

  const startEditing = (lineId: string) => setState((current) => ({ ...current, openLineId: lineId, editingLineId: lineId }));

  const stopEditing = () => setState((current) => ({ ...current, editingLineId: null }));

  const addLine = () => {
    const id = generateUuid();
    setState((current) => ({
      ...current,
      lines: [...current.lines, { id, name: '', priceCents: 0 }],
      openLineId: id,
      editingLineId: id,
    }));
  };

  const removeLine = (lineId: string) =>
    setState((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.id !== lineId),
      claims: Object.fromEntries(Object.entries(current.claims).filter(([id]) => id !== lineId)),
      openLineId: current.openLineId === lineId ? null : current.openLineId,
      editingLineId: current.editingLineId === lineId ? null : current.editingLineId,
    }));

  const itemsCents = sumLinesCents(state.lines);
  const printedTotalCents = reading?.totalCents ?? null;
  const hasUnnamedLine = state.lines.some((line) => line.name.trim() === '');
  const hasUnpricedLine = state.lines.some((line) => line.priceCents <= 0);
  const hasNegativeShare = Object.values(result.totals).some((total) => total.totalCents < 0);
  const isDirty = reading !== null || toSnapshot(state) !== baseline;
  const isComplete =
    state.lines.length > 0 &&
    result.unclaimedLineIds.length === 0 &&
    !hasUnnamedLine &&
    !hasUnpricedLine &&
    !hasNegativeShare &&
    result.totalCents > 0;

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
    tipPercents,
    printedTotalCents,
    hasUnnamedLine,
    hasUnpricedLine,
    hasNegativeShare,
    isDirty,
    isComplete,
    patch,
    setLineClaims,
    setGroupClaims,
    updateLine,
    openLine,
    startEditing,
    stopEditing,
    addLine,
    removeLine,
  };
}

export type ReceiptSplit = ReturnType<typeof useReceiptSplit>;

import { useState } from 'react';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown, Copy, Pencil, Plus, X } from 'lucide-react';

import MoneyInput from '@/components/MoneyInput';
import Pill from '@/components/Pill';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import RevealChip from '@/components/RevealChip';
import SectionHeader from '@/components/SectionHeader';
import UndoSnackbar from '@/components/UndoSnackbar';
import { type ReceiptSplit, type TipChoice } from '@apps/waypoint/hooks/useReceiptSplit';
import { centsToInputValue, formatCents, parseMoneyToCents } from '@/utils/moneyUtils';
import type { ReceiptLine, TipSplit } from '@apps/waypoint/utils/receiptSplit';

interface ReceiptSplitEditorProps {
  split: ReceiptSplit;
}

interface LineRowProps {
  line: ReceiptLine;
  holders: string[];
  split: ReceiptSplit;
}

const formatNames = (names: string[]) => {
  if (names.length <= 3) return names.length === 3 ? `${names[0]}, ${names[1]} and ${names[2]}` : names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
};

interface LineEditFieldsProps {
  line: ReceiptLine;
  onSave: (changes: { name: string; priceCents: number }) => void;
  onCancel: () => void;
}

function LineEditFields({ line, onSave, onCancel }: LineEditFieldsProps) {
  const [name, setName] = useState(line.name);
  const [canAutoFocus] = useState(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  const [priceText, setPriceText] = useState(line.priceCents ? centsToInputValue(line.priceCents) : '');
  const canSave = name.trim() !== '';

  return (
    <div className='space-y-3'>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='space-y-1.5'>
          <Label className='text-muted-foreground text-xs'>Item</Label>
          <Input
            aria-label='Item name'
            variant='outline'
            className='h-10'
            autoFocus={canAutoFocus}
            placeholder='Margherita pizza'
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className='space-y-1.5'>
          <Label className='text-muted-foreground text-xs'>Price</Label>
          <MoneyInput variant='outline' className='h-10' ariaLabel='Item price' placeholder='0.00' value={priceText} onChange={setPriceText} />
        </div>
      </div>
      <div className='flex justify-end gap-2'>
        <Button type='button' variant='tertiary' size='sm' className='h-10 px-4' onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type='button'
          size='sm'
          className='h-10 px-5'
          disabled={!canSave}
          onClick={() => onSave({ name: name.trim(), priceCents: parseMoneyToCents(priceText) ?? 0 })}
        >
          Done
        </Button>
      </div>
    </div>
  );
}

/** First names, or the full name where two people share one. */
const getShortNames = (people: { id: string; name: string }[]) =>
  Object.fromEntries(
    people.map((person) => {
      const first = person.name.split(' ')[0] ?? person.name;
      const isShared = people.filter((other) => (other.name.split(' ')[0] ?? other.name) === first).length > 1;
      return [person.id, isShared ? person.name : first];
    }),
  );

const PICKER_INLINE_LIMIT = 8;
const EVERYONE = '__everyone__';

function LineRow({ line, holders, split }: LineRowProps) {
  const { state, people, setLineClaims, setGroupClaims, updateLine, removeLine, discardLine, openLine, startEditing, stopEditing } = split;
  const isOpen = state.openLineId === line.id;
  const isEditing = isOpen && state.editingLineId === line.id;
  const isEveryone = people.length > 0 && holders.length === people.length;
  const shortNames = getShortNames(people);
  const unitCount = line.groupId ? state.lines.filter((other) => other.groupId === line.groupId).length : 0;
  const hasInlinePicker = people.length <= PICKER_INLINE_LIMIT;
  const warning = line.priceCents <= 0 ? 'Add a price' : null;

  const showsPicker = holders.length === 0 || isOpen;
  const summary = isEveryone ? 'Everyone' : formatNames(holders.map((uid) => shortNames[uid] ?? ''));

  const assign = (uids: string[]) => {
    setLineClaims(line.id, uids);
    if (!isOpen) openLine(line.id);
  };
  const toggleEveryone = () => assign(isEveryone ? [] : people.map((person) => person.id));
  const togglePerson = (uid: string) => assign(holders.includes(uid) ? holders.filter((id) => id !== uid) : [...holders, uid]);

  const pickerPills = (
    <div className='flex flex-wrap gap-1.5'>
      <Pill isThin isSelected={isEveryone} onClick={toggleEveryone}>
        Everyone
      </Pill>
      {people.map((person) => (
        <Pill
          key={person.id}
          isThin
          isSelected={holders.includes(person.id)}
          ariaLabel={person.name}
          onClick={() => togglePerson(person.id)}
        >
          {shortNames[person.id]}
        </Pill>
      ))}
    </div>
  );

  return (
    <li className={join('space-y-2 px-3 py-2.5', isOpen && 'bg-muted/50')}>
      <Button
        type='button'
        variant='tertiary'
        aria-expanded={isOpen}
        className='h-auto min-h-0 w-full items-start justify-between gap-3 rounded-none p-0! text-left font-normal whitespace-normal'
        onClick={() => openLine(isOpen ? null : line.id)}
      >
        <span className='min-w-0 flex-1'>
          <span className='line-clamp-2 text-sm font-medium'>{line.name || 'New item'}</span>
          {warning ? (
            <span className='text-warning mt-0.5 text-xs'>{warning}</span>
          ) : (
            !showsPicker && <span className='text-muted-foreground mt-0.5 text-xs'>{summary}</span>
          )}
        </span>
        <span className='flex shrink-0 items-center gap-1.5'>
          <span className='text-sm font-medium whitespace-nowrap'>{formatCents(line.priceCents)}</span>
          <ChevronDown className={join('text-muted-foreground h-4 w-4', isOpen && 'rotate-180')} aria-hidden='true' />
        </span>
      </Button>
      {isEditing ? (
        <LineEditFields
          line={line}
          onSave={(changes) => {
            updateLine(line.id, changes);
            stopEditing();
          }}
          onCancel={() => (line.name === '' ? discardLine(line.id) : stopEditing())}
        />
      ) : (
        <>
          {hasInlinePicker && showsPicker && pickerPills}
          {isOpen && (
            <div className='flex flex-wrap items-center gap-x-1'>
              {!hasInlinePicker && (
                <div className='w-full pb-1'>
                  <MultiPillGroup
                    label={`Who had ${line.name || 'this item'}`}
                    options={[{ value: EVERYONE, label: 'Everyone' }, ...people.map((person) => ({ value: person.id, label: person.name }))]}
                    values={isEveryone ? [EVERYONE, ...holders] : holders}
                    onChange={(next) => {
                      const wantsEveryone = next.includes(EVERYONE);
                      if (wantsEveryone !== isEveryone) {
                        setLineClaims(line.id, wantsEveryone ? people.map((person) => person.id) : []);
                        return;
                      }
                      setLineClaims(line.id, next.filter((value) => value !== EVERYONE));
                    }}
                  />
                </div>
              )}
              <Button type='button' variant='tertiary' size='sm' className='text-muted-foreground! h-10 gap-1.5 px-2 font-normal' onClick={() => startEditing(line.id)}>
                <Pencil className='h-4 w-4' aria-hidden='true' />
                Edit
              </Button>
              {unitCount > 1 && holders.length > 0 && (
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  className='text-muted-foreground! h-10 gap-1.5 px-2 font-normal'
                  onClick={() => line.groupId && setGroupClaims(line.groupId, holders)}
                >
                  <Copy className='h-4 w-4' aria-hidden='true' />
                  Same for all {unitCount}
                </Button>
              )}
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                aria-label={`Remove ${line.name || 'this item'}`}
                className='text-destructive! h-10 gap-1.5 px-2 font-normal'
                onClick={() => removeLine(line.id)}
              >
                <X className='h-4 w-4' aria-hidden='true' />
                <span className='max-sm:hidden'>Remove</span>
              </Button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

function ReceiptSplitEditor({ split }: ReceiptSplitEditorProps) {
  const { state, result, people, itemsCents, taxCents, tipCents, receiptTipCents, tipPercents, printedTotalCents, patch, addLine, pendingUndo, undo } = split;
  const [showFees, setShowFees] = useState(state.fees !== '');
  const [showDiscount, setShowDiscount] = useState(state.discount !== '');
  const nameOf = (uid: string) => people.find((person) => person.id === uid)?.name ?? 'Someone';
  const unclaimedCount = result.unclaimedLineIds.length;
  const tipBasisCents = Math.max(0, itemsCents - split.discountCents);
  const hasPercentTip = !['NONE', 'RECEIPT', 'CUSTOM'].includes(state.tipChoice);

  const tipOptions: { value: TipChoice; label: string }[] = [
    { value: 'NONE', label: 'No tip' },
    ...(receiptTipCents > 0 ? [{ value: 'RECEIPT' as const, label: `On the receipt · ${formatCents(receiptTipCents)}` }] : []),
    ...tipPercents.map((percent) => ({ value: `${percent}` as const, label: `${percent}%` })),
    { value: 'CUSTOM', label: 'Other amount' },
  ];
  const tipSplitOptions: { value: TipSplit; label: string }[] = [
    { value: 'PROPORTIONAL', label: 'By what they ordered' },
    { value: 'EVEN', label: 'Evenly' },
  ];

  const billWithoutOwnTip = itemsCents + taxCents + split.feesCents - split.discountCents + receiptTipCents;
  const hasShares = unclaimedCount < state.lines.length && itemsCents > 0;
  const leftOut = hasShares
    ? people.filter((person) => (result.totals[person.id]?.totalCents ?? 0) === 0).map((person) => person.name)
    : [];
  const mismatch = printedTotalCents !== null && Math.abs(printedTotalCents - billWithoutOwnTip) > 1;

  return (
    <div className='space-y-6'>
      <section className='space-y-2'>
        <SectionHeader
          title='Who had what'
          subtitle={
            unclaimedCount > 0
              ? `${unclaimedCount} ${unclaimedCount === 1 ? 'item has' : 'items have'} nobody yet. Tap one to pick who had it.`
              : 'Everything is picked. Tap an item to change it.'
          }
        />
        {state.lines.length > 0 && (
          <ul className='border-border divide-border divide-y overflow-hidden rounded-2xl border'>
            {state.lines.map((line) => (
              <LineRow key={line.id} line={line} holders={state.claims[line.id] ?? []} split={split} />
            ))}
          </ul>
        )}
        <div className='flex flex-wrap items-center gap-2'>
          <RevealChip icon={<Plus className='h-4 w-4' />} onClick={addLine}>
            Add an item
          </RevealChip>
        </div>
      </section>

      <section className='space-y-4'>
        <SectionHeader title='Tax, tip and fees' />
        <div className='space-y-1.5'>
          <Label>Tax</Label>
          <MoneyInput
            variant='outline'
            ariaLabel='Tax'
            placeholder='0.00'
            value={state.tax}
            onChange={(tax) => patch({ tax })}
          />
          <p className='text-muted-foreground text-xs'>Shared by what each person ordered.</p>
        </div>
        {showFees && (
          <div className='space-y-1.5'>
            <Label>Service charge or fees</Label>
            <MoneyInput
              variant='outline'
              ariaLabel='Service charge or fees'
              placeholder='0.00'
              value={state.fees}
              onChange={(fees) => patch({ fees })}
            />
          </div>
        )}
        {showDiscount && (
          <div className='space-y-1.5'>
            <Label>Discount</Label>
            <MoneyInput
              variant='outline'
              ariaLabel='Discount'
              placeholder='0.00'
              value={state.discount}
              onChange={(discount) => patch({ discount })}
            />
          </div>
        )}
        {(!showFees || !showDiscount) && (
          <div className='flex flex-wrap gap-2'>
            {!showFees && (
              <RevealChip icon={<Plus className='h-4 w-4' />} onClick={() => setShowFees(true)}>
                Service charge or fee
              </RevealChip>
            )}
            {!showDiscount && (
              <RevealChip icon={<Plus className='h-4 w-4' />} onClick={() => setShowDiscount(true)}>
                Discount
              </RevealChip>
            )}
          </div>
        )}
        <div className='space-y-2'>
          <Label>Tip</Label>
          <PillGroup
            label='Tip'
            options={tipOptions}
            value={state.tipChoice}
            onChange={(tipChoice) => patch({ tipChoice })}
          />
          {state.tipChoice === 'CUSTOM' && (
            <MoneyInput
              variant='outline'
              ariaLabel='Tip amount'
              placeholder='0.00'
              value={state.customTip}
              onChange={(customTip) => patch({ customTip })}
            />
          )}
          {hasPercentTip && (
            <p className='text-muted-foreground text-xs'>
              {formatCents(tipCents)} is {state.tipChoice}% of {formatCents(tipBasisCents)} before tax.
            </p>
          )}
        </div>
        {state.tipChoice !== 'NONE' && (
          <div className='space-y-1'>
            <Label>Split the tip</Label>
            <PillGroup
              label='Split the tip'
              isThin
              options={tipSplitOptions}
              value={state.tipSplit}
              onChange={(tipSplit) => patch({ tipSplit })}
            />
            <p className='text-muted-foreground text-xs'>
              {state.tipSplit === 'EVEN' ? 'Everyone on the bill tips the same.' : 'A bigger order tips more.'}
            </p>
          </div>
        )}
      </section>

      <section className='space-y-2'>
        <SectionHeader title='Who owes what' />
        {unclaimedCount === state.lines.length || itemsCents === 0 ? (
          <p className='text-muted-foreground text-sm'>Pick who had each item and the amounts show up here.</p>
        ) : (
          <ul className='border-border divide-border divide-y overflow-hidden rounded-2xl border'>
            {result.participants
              .filter((uid) => uid in result.totals && (result.totals[uid]?.totalCents ?? 0) !== 0)
              .map((uid) => {
                const total = result.totals[uid];
                const parts = [
                  ['Items', total.itemsCents],
                  ['Tax', total.taxCents],
                  ['Fees', total.feesCents],
                  ['Discount', total.discountCents],
                  ['Tip', total.tipCents],
                ] as const;
                return (
                  <li key={uid} className='flex items-start justify-between gap-3 px-3 py-2.5'>
                    <div className='min-w-0'>
                      <p className='line-clamp-2 text-sm font-medium'>{nameOf(uid)}</p>
                      <p className='text-muted-foreground flex flex-wrap gap-x-2 text-xs'>
                        {parts
                          .filter(([, cents]) => cents !== 0)
                          .map(([label, cents]) => (
                            <span key={label} className='whitespace-nowrap'>
                              {label} {formatCents(cents)}
                            </span>
                          ))}
                      </p>
                    </div>
                    <p className='shrink-0 text-sm font-semibold whitespace-nowrap'>{formatCents(total.totalCents)}</p>
                  </li>
                );
              })}
          </ul>
        )}
        {hasShares && (
          <>
        <div className='flex items-center justify-between gap-3 px-[13px] text-sm'>
          <span className='text-muted-foreground'>Bill total</span>
          <span className='font-semibold whitespace-nowrap'>{formatCents(result.totalCents)}</span>
        </div>
        {unclaimedCount > 0 && (
          <p className='text-muted-foreground px-[13px] text-xs'>
            {unclaimedCount} {unclaimedCount === 1 ? 'item isn’t' : 'items aren’t'} picked yet, so they aren’t in anyone’s share.
          </p>
        )}
        {mismatch && (
          <p className='text-warning px-[13px] text-xs' role='status'>
            The receipt says {formatCents(printedTotalCents ?? 0)}, and the items, tax and fees here add up to{' '}
            {formatCents(billWithoutOwnTip)}, {formatCents(Math.abs((printedTotalCents ?? 0) - billWithoutOwnTip))}{' '}
            {(printedTotalCents ?? 0) > billWithoutOwnTip ? 'short' : 'over'}. Check the items, tax and fees; an item you removed counts too.
          </p>
        )}
        {leftOut.length > 0 && unclaimedCount === 0 && (
          <p className='text-muted-foreground px-[13px] text-xs'>Not in this split: {formatNames(leftOut)}.</p>
        )}
          </>
        )}
      </section>
      <UndoSnackbar pending={pendingUndo} onUndo={undo} />
    </div>
  );
}

export default ReceiptSplitEditor;

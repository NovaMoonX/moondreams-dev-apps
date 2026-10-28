import { useCallback, useState } from 'react';

import { Button, DropdownMenuFactories, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ArrowRight, ChevronDown, Plus, Users } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import EllipsisDropdown from '@/components/EllipsisDropdown';
import MoneyInput from '@/components/MoneyInput';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import RevealChip from '@/components/RevealChip';
import SectionHeader from '@/components/SectionHeader';
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
  const [priceText, setPriceText] = useState(line.priceCents ? centsToInputValue(line.priceCents) : '');
  const canSave = name.trim() !== '';

  return (
    <div className='space-y-3'>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='space-y-1.5'>
          <Label>Item</Label>
          <Input
            aria-label='Item name'
            variant='outline'
            placeholder='Margherita pizza'
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className='space-y-1.5'>
          <Label>Price</Label>
          <MoneyInput variant='outline' ariaLabel='Item price' placeholder='0.00' value={priceText} onChange={setPriceText} />
        </div>
      </div>
      <div className='flex gap-2'>
        <Button type='button' variant='secondary' className='flex-1' onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type='button'
          className='flex-1'
          disabled={!canSave}
          onClick={() => onSave({ name: name.trim(), priceCents: parseMoneyToCents(priceText) ?? 0 })}
        >
          Done
        </Button>
      </div>
    </div>
  );
}

const { option } = DropdownMenuFactories;

function LineRow({ line, holders, split }: LineRowProps) {
  const { state, people, setLineClaims, updateLine, removeLine, openLine, startEditing, stopEditing } = split;
  const isOpen = state.openLineId === line.id;
  const isEditing = isOpen && state.editingLineId === line.id;
  const names = people.filter((person) => holders.includes(person.id)).map((person) => person.name);
  const isEveryone = people.length > 0 && holders.length === people.length;
  const scrollIntoViewWhenOpen = useCallback(
    (node: HTMLLIElement | null) => {
      if (isOpen) node?.scrollIntoView({ block: 'nearest' });
    },
    [isOpen],
  );
  const nextUnclaimedId = state.lines.find((other) => other.id !== line.id && (state.claims[other.id] ?? []).length === 0)?.id;

  return (
    <li ref={scrollIntoViewWhenOpen}>
      <Button
        type='button'
        variant='tertiary'
        aria-expanded={isOpen}
        className='h-auto min-h-14 w-full items-start justify-between gap-3 rounded-none px-3! py-2.5 text-left font-normal whitespace-normal'
        onClick={() => openLine(isOpen ? null : line.id)}
      >
        <span className='min-w-0 flex-1'>
          <span className='line-clamp-2 text-sm font-medium'>{line.name || 'New item'}</span>
          <span className={join('mt-0.5 text-xs', names.length === 0 || line.priceCents <= 0 ? 'text-warning' : 'text-muted-foreground')}>
            {line.priceCents <= 0 ? 'Add a price' : names.length === 0 ? 'Nobody yet' : isEveryone ? 'Everyone' : formatNames(names)}
          </span>
        </span>
        <span className='flex shrink-0 items-center gap-1.5'>
          <span className='text-sm font-medium whitespace-nowrap'>{formatCents(line.priceCents)}</span>
          <ChevronDown className={join('text-muted-foreground h-4 w-4', isOpen && 'rotate-180')} aria-hidden='true' />
        </span>
      </Button>
      {isOpen && (
        <div className='bg-muted/50 space-y-3 px-3 pt-1 pb-3'>
          {isEditing ? (
            <LineEditFields
              key={line.id}
              line={line}
              onSave={(changes) => {
                updateLine(line.id, changes);
                stopEditing();
              }}
              onCancel={() => (line.name === '' ? removeLine(line.id) : stopEditing())}
            />
          ) : (
            <>
              <MultiPillGroup
                label={`Who had ${line.name || 'this item'}`}
                options={people.map((person) => ({ value: person.id, label: person.name }))}
                values={holders}
                onChange={(uids) => setLineClaims(line.id, uids)}
              />
              <div className='flex items-center gap-2'>
                <ActionChips
                  className='min-w-0 flex-1'
                  label='Item actions'
                  actions={[
                    {
                      key: 'everyone',
                      icon: <Users className='h-4 w-4' />,
                      label: isEveryone ? 'Clear' : 'Everyone',
                      description: isEveryone ? 'Clear who had this' : 'Everyone shares this',
                      onClick: () => setLineClaims(line.id, isEveryone ? [] : people.map((person) => person.id)),
                    },
                    ...(nextUnclaimedId
                      ? [
                          {
                            key: 'next',
                            icon: <ArrowRight className='h-4 w-4' />,
                            label: 'Next',
                            description: 'Next item nobody has yet',
                            onClick: () => openLine(nextUnclaimedId),
                          },
                        ]
                      : []),
                  ]}
                />
                <EllipsisDropdown
                  variant='tertiary'
                  className='border-border size-10! shrink-0 border'
                  ariaLabel={`More for ${line.name || 'this item'}`}
                  items={[option({ label: 'Edit item', value: 'edit' }), option({ label: 'Remove item', value: 'remove' })]}
                  onItemSelect={(value) => {
                    if (value === 'edit') startEditing(line.id);
                    else removeLine(line.id);
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function ReceiptSplitEditor({ split }: ReceiptSplitEditorProps) {
  const { state, result, people, itemsCents, taxCents, tipCents, receiptTipCents, tipPercents, printedTotalCents, patch, addLine } = split;
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
  const tipSplitOptions: { value: TipSplit; label: string; detail: string }[] = [
    { value: 'PROPORTIONAL', label: 'By what they ordered', detail: 'A bigger order tips more.' },
    { value: 'EVEN', label: 'Evenly', detail: 'Everyone on the bill tips the same.' },
  ];

  const billWithoutOwnTip = itemsCents + taxCents + split.feesCents - split.discountCents + receiptTipCents;
  const hasShares = result.participants.length > 0 && itemsCents > 0;
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
          <PillGroup
            label='Split the tip'
            options={tipSplitOptions}
            value={state.tipSplit}
            onChange={(tipSplit) => patch({ tipSplit })}
          />
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
        <div className='flex items-center justify-between gap-3 px-[13px] text-sm'>
          <span className='text-muted-foreground'>Bill total</span>
          <span className='font-semibold whitespace-nowrap'>{formatCents(result.totalCents)}</span>
        </div>
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
      </section>
    </div>
  );
}

export default ReceiptSplitEditor;

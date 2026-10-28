import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import MoneyInput from '@/components/MoneyInput';
import RevealChip from '@/components/RevealChip';
import { formatCents } from '@/utils/moneyUtils';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import {
  CONFIRM_FLOW_WORDS,
  FORM_FLOW_WORDS,
  MAX_NOTE_LENGTH,
} from '@apps/runway/constants';
import { MaskedText } from '@apps/runway/components/MaskedText';

export interface LineAmountItem {
  id: string;
  name: string;
  emoji: string | null;
  cents: number | null;
  /** The one muted line under the name ("Planned $120.00" once the amount moved). */
  detail: string | null;
}

interface LineAmountListProps {
  items: readonly LineAmountItem[];
  onOpen: (id: string) => void;
  className?: string;
}

/** The lines of a day as glance rows (badge, name, amount, chevron) in one hairline frame; each opens its amount in `LineAmountView`. */
export function LineAmountList({
  items,
  onOpen,
  className,
}: LineAmountListProps) {
  return (
    <ul
      className={join(
        'border-border divide-border divide-y overflow-y-auto rounded-2xl border',
        className,
      )}
    >
      {items.map((item) => (
        <ItemRow
          key={item.id}
          name={item.name}
          emoji={item.emoji}
          detail={item.detail}
          figure={item.cents === null ? '–' : formatCents(item.cents)}
          ariaLabel={`${item.name}, ${item.cents === null ? 'no amount' : formatCents(item.cents)}. Change`}
          onOpen={() => onOpen(item.id)}
        />
      ))}
    </ul>
  );
}

interface LineAmountViewProps {
  name: string;
  value: string;
  onChange: (text: string) => void;
  onBack: () => void;
  /** What the line was before this sheet changed it. */
  plannedCents: number | null;
  /** A note on why the line moved, asked only once it differs. */
  note?: {
    value: string;
    placeholder: string;
    onChange: (text: string) => void;
  };
  isChanged?: boolean;
  isDisabled?: boolean;
  footerNote?: string | null;
  /** The host sheet already pins its own footer. */
  hasOwnFooter?: boolean;
}

/** One line's amount alone, swapped into the sheet under a Back chip: the figure is the hero and the note is asked only once the amount differs. */
export function LineAmountView({
  name,
  value,
  onChange,
  onBack,
  plannedCents,
  note,
  isChanged = false,
  isDisabled = false,
  footerNote = null,
  hasOwnFooter = false,
}: LineAmountViewProps) {
  return (
    <div className='space-y-4'>
      <BackLink onBack={onBack} />
      <ActionTitle>{name}</ActionTitle>
      <AmountHero
        label={`${name} amount`}
        value={value}
        onChange={onChange}
        disabled={isDisabled}
        suffix={
          plannedCents === null ? undefined : (
            <p className='text-muted-foreground'>
              <MaskedText>{`Planned ${formatCents(plannedCents)}`}</MaskedText>
            </p>
          )
        }
      />
      {note && isChanged && (
        <Input
          variant='outline'
          aria-label={`Note on ${name}`}
          maxLength={MAX_NOTE_LENGTH}
          placeholder={note.placeholder}
          value={note.value}
          disabled={isDisabled}
          onChange={(event) => note.onChange(event.target.value)}
        />
      )}
      {!hasOwnFooter && (
        <ModalFooterActions
          note={footerNote}
          rightActions={
            <Button type='button' onClick={onBack}>
              Done
            </Button>
          }
        />
      )}
    </div>
  );
}

export interface LineAmountField {
  id: string;
  name: string;
  emoji: string | null;
  /** What the person typed, or the planned amount while untouched. */
  value: string;
  plannedCents: number;
  isChanged: boolean;
  /** Why it changed, asked only once it differs. */
  note: string;
}

interface LineAmountEditListProps {
  items: readonly LineAmountField[];
  onChange: (id: string, text: string) => void;
  onNote: (id: string, text: string) => void;
  notePlaceholder: string;
  isDisabled?: boolean;
  className?: string;
}

/** Every item of a day with its amount typed in place, as roomy rows in one hairline frame: the badge, the name over what was planned, and the amount field, which drops under the name when the row is narrow. */
export function LineAmountEditList({
  items,
  onChange,
  onNote,
  notePlaceholder,
  isDisabled = false,
  className,
}: LineAmountEditListProps) {
  const [noting, setNoting] = useState<ReadonlySet<string>>(new Set());

  return (
    <ul
      className={join(
        'border-border divide-border divide-y overflow-y-auto rounded-2xl border',
        className,
      )}
    >
      {items.map((item) => (
        <li key={item.id} className='flex items-start gap-3 px-3 py-3'>
          <ItemBadge name={item.name} emoji={item.emoji} />
          <div className='min-w-0 flex-1 space-y-2'>
            <div className='flex flex-wrap items-start gap-x-3 gap-y-2'>
              <div className='min-w-32 flex-1'>
                <p className='text-base font-medium break-words'>
                  <span className='line-clamp-2'>{item.name}</span>
                </p>
                <p className='text-muted-foreground text-sm'>
                  {item.isChanged ? (
                    <MaskedText>
                      {CONFIRM_FLOW_WORDS.suggestDetail(
                        formatCents(item.plannedCents),
                      )}
                    </MaskedText>
                  ) : (
                    FORM_FLOW_WORDS.linesAsPlanned
                  )}
                </p>
              </div>
              <MoneyInput
                variant='outline'
                className='h-10 text-base!'
                ariaLabel={CONFIRM_FLOW_WORDS.amountOf(item.name)}
                value={item.value}
                disabled={isDisabled}
                onChange={(text) => onChange(item.id, text)}
                wrapperClassName='w-28 shrink-0'
              />
            </div>
            {item.isChanged &&
              (noting.has(item.id) || item.note !== '' ? (
                <Input
                  variant='outline'
                  className='text-base!'
                  aria-label={`${CONFIRM_FLOW_WORDS.whyChanged}: ${item.name}`}
                  maxLength={MAX_NOTE_LENGTH}
                  placeholder={notePlaceholder}
                  value={item.note}
                  autoFocus={noting.has(item.id) && item.note === ''}
                  disabled={isDisabled}
                  onChange={(event) => onNote(item.id, event.target.value)}
                />
              ) : (
                <RevealChip
                  onClick={() =>
                    setNoting((current) => new Set([...current, item.id]))
                  }
                >
                  {CONFIRM_FLOW_WORDS.whyChanged}
                </RevealChip>
              ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

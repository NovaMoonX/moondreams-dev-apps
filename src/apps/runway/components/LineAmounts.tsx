import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import { formatCents } from '@/utils/moneyUtils';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import ItemRow from '@apps/runway/components/ItemRow';
import { MAX_NOTE_LENGTH } from '@apps/runway/constants';

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
              Planned {formatCents(plannedCents)}
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

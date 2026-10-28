import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check } from 'lucide-react';

import AmountField, { type AmountMode } from '@/components/AmountField';
import BackLink from '@/components/BackLink';
import DeleteIconButton from '@/components/DeleteIconButton';
import HelpTip from '@/components/HelpTip';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import SummaryRow from '@/components/SummaryRow';
import ItemBadge from '@apps/runway/components/ItemBadge';
import { RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';

export type PairingOf = 'dayMoney' | 'remaining';

export interface PairingRow {
  key: number;
  targetItemId: string | null;
  mode: AmountMode;
  of: PairingOf;
  amount: string;
  topUp: boolean;
}

export interface PairingChoice {
  value: string;
  text: string;
  emoji: string | null;
  description: string;
}

type View = 'main' | 'what' | 'how' | 'topUp';

const MODE_OPTIONS = [
  { value: 'exact', label: 'Exact' },
  { value: 'percent', label: 'Percent' },
  { value: 'rest', label: 'The rest' },
] as const;

const OF_OPTIONS = [
  { value: 'dayMoney', label: "Of the day's money" },
  { value: 'remaining', label: 'Of what is left' },
] as const;

const TOP_UP_OPTIONS = [
  { value: 'hold', label: 'Hold it until I choose' },
  { value: 'topUp', label: 'Top up from the rest' },
] as const;

interface PairingRowSheetProps {
  row: PairingRow;
  /** Starts on the first question and walks through them, for a row just added. */
  isNew: boolean;
  choices: PairingChoice[];
  fromLabel: string;
  /** What the amount reads as, "$300.00" or "10% of this pay". */
  amountText: string;
  /** Why the row can't be kept as it is; null when it can. */
  problem: string | null;
  onChange: (patch: Partial<PairingRow>) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** One thing a pay funds, edited one question at a time in place of the list inside the same sheet: what it funds, how much, and what happens when the money runs short. */
function PairingRowSheet({
  row,
  isNew,
  choices,
  fromLabel,
  amountText,
  problem,
  onChange,
  onRemove,
  onClose,
}: PairingRowSheetProps) {
  const [view, setView] = useState<View>(isNew ? 'what' : 'main');
  const [query, setQuery] = useState('');
  const picked = choices.find((choice) => choice.value === row.targetItemId);
  const shown = choices.filter((choice) =>
    choice.text.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const getBody = () => {
    if (view === 'what') {
      return (
        <div className='flex flex-col gap-3'>
          <h3 className='text-2xl font-semibold'>What comes out first?</h3>
          {choices.length >= RUNWAY_SEARCH_THRESHOLD && (
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder='Search your plan'
            />
          )}
          <ul className='border-border divide-border max-h-[max(12rem,calc(92dvh-26rem))] divide-y overflow-y-auto rounded-2xl border'>
            {shown.map((choice) => (
              <li key={choice.value}>
                <Button
                  type='button'
                  variant='tertiary'
                  className='text-foreground! h-auto min-h-14 w-full items-start justify-start gap-3 rounded-none p-3! text-left font-normal whitespace-normal'
                  onClick={() => {
                    onChange({ targetItemId: choice.value });
                    setView(isNew ? 'how' : 'main');
                  }}
                >
                  <ItemBadge name={choice.text} emoji={choice.emoji} />
                  <span className='min-w-0 flex-1 text-left'>
                    <span className='block break-words'>{choice.text}</span>
                    <span className='text-muted-foreground block text-xs'>
                      {choice.description}
                    </span>
                  </span>
                  {choice.value === row.targetItemId && (
                    <Check
                      className='mt-0.5 h-4 w-4 shrink-0'
                      aria-label='Chosen'
                    />
                  )}
                </Button>
              </li>
            ))}
            {shown.length === 0 && (
              <li className='text-muted-foreground p-3 text-sm'>
                Nothing matches that.
              </li>
            )}
          </ul>
        </div>
      );
    }
    if (view === 'how') {
      return (
        <div className='space-y-4'>
          <h3 className='text-2xl font-semibold'>How much?</h3>
          <PillGroup
            label='How much'
            isThin
            options={MODE_OPTIONS}
            value={row.mode === 'range' ? 'exact' : row.mode}
            onChange={(mode) => onChange({ mode, amount: '' })}
          />
          {row.mode === 'rest' ? (
            <p className='text-muted-foreground text-sm'>
              Takes what is left of {fromLabel} after the others.
            </p>
          ) : (
            <AmountField
              isHero
              autoFocus
              label={row.mode === 'percent' ? 'Percent' : 'Amount'}
              value={row.amount}
              onChange={(amount) => onChange({ amount })}
              mode={row.mode}
              percentOfLabel={`of ${fromLabel}`}
            />
          )}
          {row.mode === 'percent' && (
            <PillGroup
              label='A percentage of'
              isThin
              options={OF_OPTIONS}
              value={row.of}
              onChange={(of) => onChange({ of })}
            />
          )}
        </div>
      );
    }
    if (view === 'topUp') {
      return (
        <div className='space-y-4'>
          <h3 className='flex items-center gap-1 text-2xl font-semibold'>
            If the money runs short?
            <HelpTip title='Running short'>
              Held means a Must or Should waits until you choose what to do.
              Topping up takes the difference from the rest of the pay.
            </HelpTip>
          </h3>
          <PillGroup
            label='If the money runs short'
            options={TOP_UP_OPTIONS}
            value={row.topUp ? 'topUp' : 'hold'}
            onChange={(value) => onChange({ topUp: value === 'topUp' })}
          />
        </div>
      );
    }
    return (
      <div className='space-y-2'>
        <SummaryRow label='Paid first' onClick={() => setView('what')}>
          {picked?.text ?? 'Pick one'}
        </SummaryRow>
        <SummaryRow label='How much' onClick={() => setView('how')}>
          {row.amount === '' && row.mode !== 'rest'
            ? 'Not set yet'
            : amountText}
        </SummaryRow>
        <SummaryRow label='If it runs short' onClick={() => setView('topUp')}>
          {row.topUp ? 'Top up from the rest' : 'Hold it until I choose'}
        </SummaryRow>
      </div>
    );
  };

  const next = () => {
    if (view === 'how' && isNew) setView('topUp');
    else if (view === 'main' || (view === 'topUp' && isNew)) onClose();
    else setView('main');
  };
  const isAnswered =
    view === 'what' ? row.targetItemId !== null : problem === null;

  return (
    <>
      <div className={join('space-y-4 pb-4')}>
        <BackLink
          onBack={() =>
            view === 'main' || (isNew && view === 'what')
              ? onClose()
              : setView('main')
          }
        />
        {getBody()}
      </div>
      <ModalFooterActions
        note={view === 'main' && problem ? problem : null}
        leftActions={
          isNew ? undefined : (
            <DeleteIconButton onClick={onRemove} label='Stop paying this first' />
          )
        }
        rightActions={
          <Button
            type='button'
            disabled={view === 'main' ? problem !== null : !isAnswered}
            onClick={next}
          >
            {view === 'main' || (view === 'topUp' && isNew) ? 'Done' : 'Next'}
          </Button>
        }
      />
    </>
  );
}

export default PairingRowSheet;

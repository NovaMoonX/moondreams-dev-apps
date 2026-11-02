import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, X } from 'lucide-react';

import BackLink from '@/components/BackLink';
import DateInput from '@/components/DateInput';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import RevealChip from '@/components/RevealChip';
import {
  fromDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import StatusViewFooter from '@apps/going-once/components/things/StatusViewFooter';
import { MAX_BUYER_NAME_LENGTH } from '@apps/going-once/constants';
import { changeStatus } from '@apps/going-once/store/actions/statusActions';
import type { Item } from '@apps/going-once/types';

const OTHER_DAY = 'other';
const DAYS_SHOWN = 7;

/** Today and the next six days as pills, each valued as a local date input's text. */
const getDayOptions = (now: number): PillOption<string>[] => {
  const today = new Date(now);
  return Array.from({ length: DAYS_SHOWN }, (_, offset) => {
    const day = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + offset,
    );
    return {
      value: toLocalDateInputValue(day.getTime()),
      label:
        offset === 0
          ? 'Today'
          : day.toLocaleDateString(undefined, { weekday: 'short' }),
    };
  });
};

interface MarkPendingViewProps {
  item: Item;
  uid: string;
  now: number;
  footerNode: HTMLElement | null;
  onBack: () => void;
  onDone: () => void;
}

/** Who is picking it up, and when: nothing is chosen until the person picks "Someone else". */
function MarkPendingView({
  item,
  uid,
  now,
  footerNode,
  onBack,
  onDone,
}: MarkPendingViewProps) {
  const [isSomeoneElse, setIsSomeoneElse] = useState(false);
  const [name, setName] = useState('');
  const [isDayShown, setIsDayShown] = useState(false);
  const [day, setDay] = useState('');
  const [isOtherDay, setIsOtherDay] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dayOptions = [
    ...getDayOptions(now),
    { value: OTHER_DAY, label: 'Other day' },
  ];
  const today = toLocalDateInputValue(now);
  const pickedDay = isOtherDay ? OTHER_DAY : day;

  const markPending = async () => {
    setIsBusy(true);
    setError(null);
    const result = await changeStatus(item.saleId, item.id, uid, {
      kind: 'MARK_PENDING',
      buyerName: name.trim() === '' ? null : name.trim(),
      pickupOn: isDayShown ? (fromDateInputValue(day) ?? null) : null,
    });
    setIsBusy(false);
    if (result.ok) onDone();
    else setError(result.message);
  };

  const pickDay = (value: string) => {
    if (value === OTHER_DAY) {
      setIsOtherDay(true);
      return;
    }
    setIsOtherDay(false);
    setDay(value);
  };

  return (
    <div className='space-y-5'>
      <div className='space-y-2'>
        <BackLink onBack={onBack} label='Mark pending' />
        <p className='text-lg font-semibold'>Who&apos;s picking it up?</p>
      </div>
      <div className='space-y-3'>
        <Button
          type='button'
          variant='tertiary'
          aria-pressed={isSomeoneElse}
          className={join(
            'text-foreground! h-auto min-h-14 w-full justify-start gap-3 rounded-2xl border px-3 py-2 text-left font-normal',
            isSomeoneElse ? 'border-primary bg-accent/50' : 'border-border',
          )}
          onClick={() => setIsSomeoneElse(true)}
        >
          <span
            className={join(
              'grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold',
              isSomeoneElse
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground',
            )}
            aria-hidden='true'
          >
            {isSomeoneElse ? <Check className='size-4' /> : 'A'}
          </span>
          <span>Someone else</span>
        </Button>
        {isSomeoneElse && (
          <Input
            aria-label='Their name'
            placeholder='Their name'
            value={name}
            maxLength={MAX_BUYER_NAME_LENGTH}
            autoComplete='off'
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </div>
      {isDayShown ? (
        <div className='space-y-3'>
          <PillGroup
            label='Pickup day'
            options={dayOptions}
            value={pickedDay === '' ? null : pickedDay}
            onChange={pickDay}
          />
          {isOtherDay && (
            <DateInput
              variant='outline'
              aria-label='Pickup day'
              min={today}
              value={day}
              onChange={(event) => setDay(event.target.value)}
            />
          )}
          <RevealChip
            icon={<X className='size-4' aria-hidden='true' />}
            onClick={() => {
              setIsDayShown(false);
              setIsOtherDay(false);
              setDay('');
            }}
          >
            No pickup day
          </RevealChip>
        </div>
      ) : (
        <RevealChip icon='+' onClick={() => setIsDayShown(true)}>
          Add a pickup day
        </RevealChip>
      )}
      <p className='text-muted-foreground text-sm'>
        Buyers still see it, marked Pending.
      </p>
      <StatusViewFooter
        footerNode={footerNode}
        note={error ?? (isSomeoneElse ? null : 'Pick who, or Someone else')}
        isRefusal={error !== null}
      >
        <Button
          type='button'
          size='lg'
          rounded='full'
          className='w-full'
          disabled={!isSomeoneElse || isBusy}
          onClick={() => void markPending()}
        >
          Mark pending
        </Button>
      </StatusViewFooter>
    </div>
  );
}

export default MarkPendingView;

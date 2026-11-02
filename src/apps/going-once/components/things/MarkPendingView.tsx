import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { Plus, X } from 'lucide-react';

import BackLink from '@/components/BackLink';
import DateInput from '@/components/DateInput';
import { PillGroup } from '@/components/PillGroup';
import RevealChip from '@/components/RevealChip';
import {
  fromDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import StatusViewFooter from '@apps/going-once/components/things/StatusViewFooter';
import { MAX_BUYER_NAME_LENGTH } from '@apps/going-once/constants';
import { useStatusWrite } from '@apps/going-once/hooks/useStatusWrite';
import { changeStatus } from '@apps/going-once/store/actions/statusActions';
import type { Item } from '@apps/going-once/types';
import { describeMovedOn } from '@apps/going-once/utils/status';
import {
  getDayOptions,
  getHoldDraft,
  isDraftChanged,
  OTHER_DAY,
  type HoldDraft,
} from '@apps/going-once/utils/statusDrafts';

interface MarkPendingViewProps {
  item: Item;
  uid: string;
  now: number;
  /** Marking a thing pending, or changing who or when on a hold it already has. */
  mode: 'MARK' | 'CHANGE';
  draft: HoldDraft;
  onDraft: (next: HoldDraft) => void;
  footerNode: HTMLElement | null;
  /** Back, asking first when something was typed. */
  onBack: () => void;
  /** Leaves at once, for Done after a refusal. */
  onLeave: () => void;
  onDone: () => void;
}

/** Who is picking it up, and when; both are optional, so Mark pending is on from the start. */
function MarkPendingView({
  item,
  uid,
  now,
  mode,
  draft,
  onDraft,
  footerNode,
  onBack,
  onLeave,
  onDone,
}: MarkPendingViewProps) {
  const { isBusy, refusal, write } = useStatusWrite();
  const isChange = mode === 'CHANGE';
  const dayOptions = [
    ...getDayOptions(now),
    { value: OTHER_DAY, label: 'Other day' },
  ];
  const today = toLocalDateInputValue(now);
  const pickedDay = draft.isOtherDay ? OTHER_DAY : draft.day;
  const lockedNote =
    refusal ??
    (isBusy
      ? null
      : describeMovedOn(item, [isChange ? 'PENDING' : 'AVAILABLE']));
  const isUnchanged =
    isChange && !isDraftChanged(draft, getHoldDraft(item.pending, now));

  const save = async () => {
    const buyerName = draft.name.trim() === '' ? null : draft.name.trim();
    const pickupOn = draft.isDayShown
      ? (fromDateInputValue(draft.day) ?? null)
      : null;
    const isSaved = await write(() =>
      changeStatus(
        item.saleId,
        item.id,
        uid,
        isChange
          ? {
              kind: 'CHANGE_HOLD',
              buyerName,
              pickupOn,
              from: {
                buyerName: item.pending?.buyerName ?? null,
                pickupOn: item.pending?.pickupOn ?? null,
              },
            }
          : { kind: 'MARK_PENDING', buyerName, pickupOn },
      ),
    );
    if (isSaved) onDone();
  };

  const pickDay = (value: string) => {
    if (value === OTHER_DAY) {
      onDraft({ ...draft, isOtherDay: true });
      return;
    }
    onDraft({ ...draft, isOtherDay: false, day: value });
  };

  const getNote = () => {
    if (isUnchanged) return 'Change the name or the day first';
    if (draft.isDayShown && draft.day === '')
      return 'No day picked, so it saves without one';
    return null;
  };

  return (
    <div className='space-y-5'>
      <div className='space-y-2'>
        <BackLink
          onBack={onBack}
          label={isChange ? 'Change the hold' : 'Mark pending'}
        />
        <p className='text-lg font-semibold'>Who&apos;s picking it up?</p>
      </div>
      <div className='space-y-2'>
        <p className='text-muted-foreground text-sm'>Their name (optional)</p>
        <Input
          aria-label='Their name'
          placeholder='Their name'
          value={draft.name}
          maxLength={MAX_BUYER_NAME_LENGTH}
          autoComplete='off'
          disabled={lockedNote !== null}
          onChange={(event) => onDraft({ ...draft, name: event.target.value })}
        />
      </div>
      {draft.isDayShown ? (
        <div className='space-y-3'>
          <p className='text-muted-foreground text-sm'>Pickup day (optional)</p>
          <PillGroup
            label='Pickup day'
            options={dayOptions}
            value={pickedDay === '' ? null : pickedDay}
            onChange={pickDay}
          />
          {draft.isOtherDay && (
            <DateInput
              variant='outline'
              aria-label='Pickup day'
              min={today}
              value={draft.day}
              onChange={(event) =>
                onDraft({ ...draft, day: event.target.value })
              }
            />
          )}
          <RevealChip
            icon={<X className='size-4' aria-hidden='true' />}
            onClick={() =>
              onDraft({
                ...draft,
                isDayShown: false,
                isOtherDay: false,
                day: '',
              })
            }
          >
            No pickup day
          </RevealChip>
        </div>
      ) : (
        <RevealChip
          icon={<Plus className='size-4' aria-hidden='true' />}
          onClick={() => onDraft({ ...draft, isDayShown: true })}
        >
          Add a pickup day
        </RevealChip>
      )}
      <p className='text-muted-foreground text-sm'>
        Buyers still see it, marked Pending.
      </p>
      <StatusViewFooter
        footerNode={footerNode}
        note={getNote()}
        lockedNote={lockedNote}
        onDone={onLeave}
      >
        <Button
          type='button'
          size='lg'
          rounded='full'
          className='w-full'
          disabled={isBusy || isUnchanged}
          onClick={() => void save()}
        >
          {isChange ? 'Save' : 'Mark pending'}
        </Button>
      </StatusViewFooter>
    </div>
  );
}

export default MarkPendingView;

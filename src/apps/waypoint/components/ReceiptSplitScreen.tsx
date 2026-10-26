import { useMemo, useState } from 'react';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import ReceiptPhotoStep from '@/components/receipt/ReceiptPhotoStep';
import ReceiptSplitEditor from '@/components/receipt/ReceiptSplitEditor';
import Subview from '@/components/Subview';
import { useReceiptSplit } from '@/hooks/useReceiptSplit';
import { useUserInfo } from '@/hooks/useUserInfo';
import type { ReceiptReading } from '@/lib/receipts/receiptTypes';
import { useAppDispatch } from '@/store';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { getDayCount } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import { MAX_DAYS_OUTSIDE_TRIP } from '@apps/waypoint/constants';
import { createExpense } from '@apps/waypoint/store/actions/expenseActions';
import type { ExpenseLink, TripSpace } from '@apps/waypoint/types';

/** What the expense form already knew when the person chose to split a receipt instead. */
export interface ReceiptSplitPrefill {
  title: string;
  dayIndex: number | null;
  link: ExpenseLink | null;
}

interface ReceiptSplitScreenProps {
  trip: TripSpace;
  currentUserId: string;
  prefill: ReceiptSplitPrefill | null;
  onClose: () => void;
}

interface SplitStepProps extends ReceiptSplitScreenProps {
  reading: ReceiptReading | null;
}

/** A receipt's date as a trip day, when it falls on the trip or just around it. */
function getReceiptDay(trip: TripSpace, date: string | null) {
  if (date === null) {
    return null;
  }
  const day = fromDateInputValue(date);
  if (day === undefined) {
    return null;
  }
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const offset = Math.round((day - trip.startDate) / 86_400_000);
  const isNearTrip = offset >= -MAX_DAYS_OUTSIDE_TRIP && offset < dayCount + MAX_DAYS_OUTSIDE_TRIP;
  return isNearTrip ? offset : null;
}

function SplitStep({ trip, currentUserId, prefill, reading, onClose }: SplitStepProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const memberIds = useMemo(() => Object.keys(trip.members), [trip.members]);
  const memberInfo = useUserInfo(memberIds);
  const people = useMemo(
    () =>
      memberIds.map((id) => ({
        id,
        name: id === currentUserId ? 'You' : memberInfo?.map[id]?.displayName || memberInfo?.map[id]?.email || 'Trip member',
      })),
    [memberIds, memberInfo, currentUserId],
  );
  const split = useReceiptSplit(reading, people);
  const [title, setTitle] = useState(prefill?.title || reading?.merchant || '');
  const [payerUid, setPayerUid] = useState(currentUserId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { result, isComplete } = split;
  const canSave = isComplete && title.trim() !== '' && !isSubmitting;
  const unclaimedCount = result.unclaimedLineIds.length;

  const getNote = () => {
    if (split.state.lines.length === 0) return 'Add an item to start splitting.';
    if (split.state.lines.some((line) => line.name.trim() === '')) return 'Give each item a name.';
    if (unclaimedCount > 0) return `${unclaimedCount} ${unclaimedCount === 1 ? 'item has' : 'items have'} nobody yet.`;
    if (title.trim() === '') return 'Add a title to save it.';
    return null;
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const shared = result.participants;
      await dispatch(
        createExpense({
          uid: currentUserId,
          tripId: trip.id,
          memberIds,
          title,
          amount: result.totalCents / 100,
          amountMin: null,
          amountMax: null,
          currency: 'USD',
          payerUid,
          status: 'PAID',
          dayIndex: prefill?.dayIndex ?? getReceiptDay(trip, reading?.date ?? null),
          category: 'FOOD',
          customCategoryLabel: null,
          note: null,
          groupLabel: null,
          isPerPerson: false,
          linkedTo: prefill?.link ?? null,
          split: { targetType: 'SPECIFIC_MEMBERS', targetMemberIds: shared },
          splitAmounts: Object.fromEntries(shared.map((uid) => [uid, (result.totals[uid]?.totalCents ?? 0) / 100])),
        }),
      ).unwrap();
      addToast({
        title: `Added ${title.trim()}`,
        description: `${formatCents(result.totalCents)} split between ${shared.length} ${shared.length === 1 ? 'person' : 'people'}.`,
        type: 'success',
      });
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to add this expense.'));
      setIsSubmitting(false);
    }
  };

  return (
    <div className='space-y-6'>
      <ReceiptSplitEditor split={split} />
      <section className='space-y-4'>
        <div className='space-y-1.5'>
          <Label>Expense title</Label>
          <Input
            aria-label='Expense title'
            variant='outline'
            placeholder='Dinner at Ichiran'
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <PillGroup
          label='Who paid the bill?'
          options={people.map((person) => ({ value: person.id, label: person.name }))}
          value={payerUid}
          onChange={setPayerUid}
        />
        <p className='text-muted-foreground text-xs'>
          It&apos;s added as paid by them, and everyone else owes their share.
        </p>
      </section>
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      <ModalFooterActions
        note={getNote()}
        cancelAction={
          <Button type='button' variant='secondary' onClick={onClose}>
            Cancel
          </Button>
        }
        rightActions={
          <Button type='button' loading={isSubmitting} disabled={!canSave} onClick={() => void handleSave()}>
            {isSubmitting ? 'Adding…' : 'Add'}
          </Button>
        }
      />
    </div>
  );
}

/** Splitting one bill between the people who shared it: a photo of the receipt (or the items by hand), who had what, tax and tip, then one expense with each person's exact share. */
function ReceiptSplitScreen({ trip, currentUserId, prefill, onClose }: ReceiptSplitScreenProps) {
  const { confirm } = useActionModal();
  const [stage, setStage] = useState<{ step: 'photo' } | { step: 'split'; reading: ReceiptReading | null }>({
    step: 'photo',
  });

  const requestClose = async () => {
    if (stage.step === 'photo') {
      onClose();
      return;
    }
    const shouldLeave = await confirm({
      title: 'Discard this split?',
      message: 'What you picked for each item will be lost.',
      confirmText: 'Discard',
      cancelText: 'Keep editing',
      destructive: true,
    });
    if (shouldLeave) {
      onClose();
    }
  };

  return (
    <Subview overlay title='Split a receipt' onClose={() => void requestClose()}>
      {stage.step === 'photo' ? (
        <ReceiptPhotoStep
          noun='receipt'
          onRead={(reading) => setStage({ step: 'split', reading })}
          onManual={() => setStage({ step: 'split', reading: null })}
        />
      ) : (
        <SplitStep
          trip={trip}
          currentUserId={currentUserId}
          prefill={prefill}
          reading={stage.reading}
          onClose={onClose}
        />
      )}
    </Subview>
  );
}

export default ReceiptSplitScreen;

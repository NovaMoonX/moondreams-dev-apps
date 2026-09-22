import { useMemo, useState } from 'react';

import {
  Button,
  Checkbox,
  Input,
  Label,
  Modal,
  Select,
} from '@moondreamsdev/dreamer-ui/components';

import { useUserInfo } from '@/hooks/useUserInfo';
import { getErrorMessage } from '@/utils/errorUtils';
import { computeEvenSplit } from '@apps/waypoint/utils/splitCalculators';
import type { ExpenseTargetType, TripExpense, TripSpace } from '@apps/waypoint/types';

export interface ExpenseSplitSubmitValues {
  targetType: ExpenseTargetType;
  targetMemberIds: string[];
  splitAmounts: Record<string, number> | null;
}

interface ExpenseSplitModalProps {
  isOpen: boolean;
  trip: TripSpace;
  expense: TripExpense | null;
  isSubmitting?: boolean;
  onSubmit: (values: ExpenseSplitSubmitValues) => Promise<void> | void;
  onClose: () => void;
}

const targetTypeOptions: { value: ExpenseTargetType; text: string }[] = [
  { value: 'EVERYONE_CURRENT', text: 'Everyone (current members)' },
  { value: 'EVERYONE_INCLUDING_FUTURE', text: 'Everyone, including future members' },
  { value: 'JUST_ME', text: 'Just me' },
  { value: 'SPECIFIC_MEMBERS', text: 'Specific members' },
];

function ExpenseSplitModal({
  isOpen,
  trip,
  expense,
  isSubmitting = false,
  onSubmit,
  onClose,
}: ExpenseSplitModalProps) {
  const [error, setError] = useState<string | null>(null);
  const memberIds = useMemo(() => Object.keys(trip.members), [trip.members]);
  const memberInfo = useUserInfo(memberIds);
  const memberLabel = (uid: string) =>
    memberInfo?.map[uid]?.displayName || memberInfo?.map[uid]?.email || uid;

  const [targetType, setTargetType] = useState<ExpenseTargetType>(
    expense?.targetType ?? 'EVERYONE_CURRENT',
  );
  const [specificMemberIds, setSpecificMemberIds] = useState<string[]>(
    expense?.targetType === 'SPECIFIC_MEMBERS' ? expense.targetMemberIds : [],
  );
  const [customSplitAmounts, setCustomSplitAmounts] = useState<Record<
    string,
    string
  > | null>(
    expense?.splitAmounts
      ? Object.fromEntries(
          Object.entries(expense.splitAmounts).map(([uid, amount]) => [
            uid,
            String(amount),
          ]),
        )
      : null,
  );

  const splitMemberIds = useMemo(() => {
    if (!expense) {
      return [];
    }

    switch (targetType) {
      case 'JUST_ME':
        return [expense.payerUid];
      case 'EVERYONE_CURRENT':
      case 'EVERYONE_INCLUDING_FUTURE':
        return memberIds;
      case 'SPECIFIC_MEMBERS':
      default:
        return specificMemberIds;
    }
  }, [expense, targetType, specificMemberIds, memberIds]);

  const amount = expense
    ? (expense.amount ?? (expense.status === 'PAID' ? expense.paidAmount : null) ?? 0)
    : 0;
  const evenSplit = useMemo(
    () => computeEvenSplit(splitMemberIds, amount),
    [splitMemberIds, amount],
  );
  const isCustomSplit = customSplitAmounts !== null;
  const displayAmounts =
    customSplitAmounts ??
    Object.fromEntries(
      splitMemberIds.map((uid) => [uid, String(evenSplit[uid] ?? 0)]),
    );
  const customTotal = splitMemberIds.reduce(
    (sum, uid) => sum + (Number(displayAmounts[uid]) || 0),
    0,
  );
  const isMemberSelectionValid =
    targetType !== 'SPECIFIC_MEMBERS' || specificMemberIds.length > 0;
  const isAmountsValid = !isCustomSplit || Math.abs(customTotal - amount) < 0.01;

  const updateAmount = (uid: string, value: string) => {
    setCustomSplitAmounts({ ...displayAmounts, [uid]: value });
  };

  const toggleSpecificMember = (uid: string, checked: boolean) => {
    setSpecificMemberIds((current) =>
      checked ? [...current, uid] : current.filter((id) => id !== uid),
    );
    setCustomSplitAmounts(null);
  };

  const handleTargetTypeChange = (value: string) => {
    setTargetType(value as ExpenseTargetType);
    setCustomSplitAmounts(null);
  };

  const handleSubmit = async () => {
    if (!expense) {
      return;
    }
    if (!isMemberSelectionValid) {
      setError('Select at least one member.');
      return;
    }
    if (!isAmountsValid) {
      setError('Split amounts must add up to the total amount.');
      return;
    }

    setError(null);
    const targetMemberIds =
      targetType === 'EVERYONE_INCLUDING_FUTURE' || targetType === 'JUST_ME'
        ? []
        : targetType === 'EVERYONE_CURRENT'
          ? memberIds
          : specificMemberIds;
    const splitAmounts = isCustomSplit
      ? Object.fromEntries(
          splitMemberIds.map((uid) => [uid, Number(displayAmounts[uid]) || 0]),
        )
      : null;

    try {
      await onSubmit({ targetType, targetMemberIds, splitAmounts });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to update this split.'));
    }
  };

  if (!expense) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Split'>
      <div className='space-y-4'>
        <div className='space-y-1.5'>
          <Label>Split with</Label>
          <Select
            options={targetTypeOptions}
            value={targetType}
            onChange={handleTargetTypeChange}
          />
        </div>
        {targetType === 'SPECIFIC_MEMBERS' && (
          <div className='space-y-1.5'>
            <Label>Members</Label>
            <div className='space-y-2'>
              {memberIds.map((uid) => (
                <label key={uid} className='flex items-center gap-2 text-sm'>
                  <Checkbox
                    checked={specificMemberIds.includes(uid)}
                    onCheckedChange={(checked) => toggleSpecificMember(uid, checked)}
                  />
                  {memberLabel(uid)}
                </label>
              ))}
            </div>
          </div>
        )}
        {splitMemberIds.length > 0 && (
          <div className='space-y-1.5'>
            <div className='flex items-center justify-between'>
              <Label>Split amounts</Label>
              {isCustomSplit && (
                <Button
                  type='button'
                  variant='link'
                  size='sm'
                  className='bg-transparent'
                  onClick={() => setCustomSplitAmounts(null)}
                >
                  Reset to even split
                </Button>
              )}
            </div>
            <div className='space-y-2'>
              {splitMemberIds.map((uid) => (
                <div key={uid} className='flex items-center gap-2'>
                  <span className='text-sm flex-1'>{memberLabel(uid)}</span>
                  <Input
                    type='number'
                    className='w-28'
                    value={displayAmounts[uid] ?? ''}
                    onChange={(event) => updateAmount(uid, event.target.value)}
                  />
                </div>
              ))}
            </div>
            {isCustomSplit && !isAmountsValid && (
              <p className='text-destructive text-sm'>
                Split amounts must add up to {amount}.
              </p>
            )}
          </div>
        )}
        <div className='flex justify-end gap-2'>
          <Button type='button' variant='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button
            type='button'
            loading={isSubmitting}
            disabled={isSubmitting || !isMemberSelectionValid || !isAmountsValid}
            onClick={() => void handleSubmit()}
          >
            {isSubmitting ? 'Saving…' : 'Save split'}
          </Button>
        </div>
        {error && <p className='text-destructive text-sm'>{error}</p>}
      </div>
    </Modal>
  );
}

export default ExpenseSplitModal;

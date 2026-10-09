import { useMemo, useState } from 'react';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  computeEvenSplit,
  getActiveSplitAmounts,
  getPerPersonMultiplier,
  getResolvedExpenseAmount,
  scaleAmount,
} from '@apps/waypoint/utils/splitCalculators';
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

const targetTypeOptions: { value: ExpenseTargetType; label: string; emoji: string }[] = [
  { value: 'EVERYONE_CURRENT', label: 'Everyone', emoji: '👥' },
  { value: 'SPECIFIC_MEMBERS', label: 'Pick people', emoji: '🎯' },
];

/** Older expenses may still say "just the payer"; the editor shows them as that person picked. */
function getInitialTargetType(expense: TripExpense | null): ExpenseTargetType {
  if (!expense || expense.targetType === 'EVERYONE_INCLUDING_FUTURE') {
    return 'EVERYONE_CURRENT';
  }
  return expense.targetType === 'JUST_ME' ? 'SPECIFIC_MEMBERS' : expense.targetType;
}

function getInitialSpecificMemberIds(expense: TripExpense | null): string[] {
  if (expense?.targetType === 'JUST_ME') {
    return expense.payerUid === null ? [] : [expense.payerUid];
  }
  return expense?.targetType === 'SPECIFIC_MEMBERS' ? expense.targetMemberIds : [];
}

const BASE_PERCENTS = [25, 50, 75, 100];

/** The usual quarter steps, plus an even share of the group when it isn't one of them (20% of five, 33.3% of three). */
function getPercentPresets(memberCount: number): number[] {
  const evenShare = memberCount > 0 ? 100 / memberCount : null;
  const isCovered = evenShare === null || BASE_PERCENTS.some((percent) => Math.abs(percent - evenShare) < 0.0001);
  return isCovered ? BASE_PERCENTS : [...BASE_PERCENTS, evenShare].sort((first, second) => first - second);
}

const formatPercent = (percent: number) => `${Number(percent.toFixed(1))}%`;

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
  const activeSplitAmounts = expense ? getActiveSplitAmounts(expense, memberIds) : null;
  const memberInfo = useUserInfo(memberIds);
  const memberLabel = (uid: string) =>
    memberInfo?.map[uid]?.displayName || memberInfo?.map[uid]?.email || uid;

  const [targetType, setTargetType] = useState<ExpenseTargetType>(() => getInitialTargetType(expense));
  const [specificMemberIds, setSpecificMemberIds] = useState<string[]>(() => getInitialSpecificMemberIds(expense));
  const [customSplitAmounts, setCustomSplitAmounts] = useState<Record<
    string,
    string
  > | null>(
    activeSplitAmounts
      ? Object.fromEntries(
          Object.entries(activeSplitAmounts).map(([uid, amount]) => [
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

    return targetType === 'EVERYONE_CURRENT' ? memberIds : specificMemberIds;
  }, [expense, targetType, specificMemberIds, memberIds]);

  const unitAmount = expense ? (getResolvedExpenseAmount(expense) ?? 0) : 0;
  const multiplier = expense ? getPerPersonMultiplier(expense, splitMemberIds) : 1;
  const amount = scaleAmount(unitAmount, multiplier);
  const formatAmount = (value: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: expense?.currency ?? 'USD',
    }).format(value);
  const evenSplit = computeEvenSplit(splitMemberIds, amount);
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
  const remainder = amount - customTotal;
  const isMemberSelectionValid =
    targetType !== 'SPECIFIC_MEMBERS' || specificMemberIds.length > 0;
  const isAmountsValid = !isCustomSplit || Math.abs(customTotal - amount) < 0.01;

  const updateAmount = (uid: string, value: string) => {
    setCustomSplitAmounts({ ...displayAmounts, [uid]: value });
  };

  const percentPresets = getPercentPresets(splitMemberIds.length);
  const setAmountToPercent = (uid: string, percent: number) => {
    updateAmount(uid, ((percent / 100) * amount).toFixed(2));
  };

  const handleSpecificMembersChange = (uids: string[]) => {
    setSpecificMemberIds(uids);
    setCustomSplitAmounts(null);
  };

  const handleTargetTypeChange = (value: ExpenseTargetType) => {
    setTargetType(value);
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
    const targetMemberIds = targetType === 'EVERYONE_CURRENT' ? memberIds : specificMemberIds;
    const splitAmounts =
      isCustomSplit
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
    <FormSheet isOpen={isOpen} onClose={onClose} title='Split'>
      <div className='space-y-4'>
        {expense.isPerPerson && (
          <p className='text-muted-foreground text-sm'>
            {formatAmount(unitAmount)} per person
            {splitMemberIds.length > 0 && (
              <>
                {' '}× {multiplier} {multiplier === 1 ? 'person' : 'people'} ={' '}
                <span className='text-foreground font-medium'>{formatAmount(amount)}</span>
              </>
            )}
          </p>
        )}
        <div className='space-y-1.5'>
          <Label>Split with</Label>
          <PillGroup
            label='Split with'
            options={targetTypeOptions}
            value={targetType}
            onChange={handleTargetTypeChange}
          />
        </div>
        {targetType === 'SPECIFIC_MEMBERS' && (
          <MultiPillGroup
            label='Members'
            options={memberIds.map((uid) => ({ value: uid, label: memberLabel(uid) }))}
            values={specificMemberIds}
            onChange={handleSpecificMembersChange}
          />
        )}
        {!isMemberSelectionValid && (
          <p className='text-muted-foreground text-sm'>Pick at least one person to share it.</p>
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
            <p className='text-muted-foreground text-xs'>Total {formatAmount(amount)}</p>
            <div className='space-y-3'>
              {splitMemberIds.map((uid) => (
                <div key={uid} className='space-y-1'>
                  <div className='flex items-center gap-2'>
                    <span className='text-sm flex-1'>{memberLabel(uid)}</span>
                    <span className='text-muted-foreground text-xs'>
                      even {formatAmount(evenSplit[uid] ?? 0)}
                    </span>
                    <Input
                      type='number'
                      className='w-28'
                      value={displayAmounts[uid] ?? ''}
                      onChange={(event) => updateAmount(uid, event.target.value)}
                    />
                  </div>
                  <div className='flex justify-end gap-1'>
                    {percentPresets.map((percent) => (
                      <Button
                        key={percent}
                        type='button'
                        variant='tertiary'
                        size='sm'
                        className='h-6 px-1.5 text-xs'
                        onClick={() => setAmountToPercent(uid, percent)}
                      >
                        {formatPercent(percent)}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {isCustomSplit && (
              <p
                className={join(
                  'text-sm',
                  isAmountsValid ? 'text-muted-foreground' : 'text-destructive',
                )}
              >
                {Math.abs(remainder) < 0.01
                  ? 'Fully allocated'
                  : remainder > 0
                    ? `${formatAmount(remainder)} remaining`
                    : `${formatAmount(Math.abs(remainder))} over`}
              </p>
            )}
          </div>
        )}
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          cancelAction={
              <Button type='button' variant='secondary' onClick={onClose}>
                Cancel
              </Button>
          }
          rightActions={
            <Button
                type='button'
                loading={isSubmitting}
                disabled={isSubmitting || !isMemberSelectionValid || !isAmountsValid}
                onClick={() => void handleSubmit()}
              >
                {isSubmitting ? 'Saving…' : 'Save'}
              </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default ExpenseSplitModal;

import { useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';

import ModalFooterActions from '@/components/ModalFooterActions';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch } from '@/store';
import FormSection from '@/ui/FormSection';
import {
  fromDateInputValue,
  toDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { createDateInputField } from '@/utils/formFactoryHelpers';
import MoneyInput from '@apps/a-list/components/shared/MoneyInput';
import { MAX_MONTHLY_GOAL, MAX_WEEKLY_GOAL } from '@apps/a-list/constants';
import {
  updateMembership,
  type MembershipEditableFields,
} from '@apps/a-list/store/actions/membershipActions';
import type { MembershipProfile } from '@apps/a-list/types';
import {
  evaluateCostStep,
  type CostStepValues,
} from '@apps/a-list/utils/costStep';
import { centsToInputValue } from '@apps/a-list/utils/money';
import { formatTaxRate } from '@apps/a-list/utils/tax';

interface GoalValues {
  weeklyGoal: string;
  monthlyGoal: string;
}

const { custom, input } = FormFactories;
const COST_GROUP = [
  'monthlyCostCents',
  'monthlyTotalCents',
  'taxRate',
] as const;

/** A blank goal is "no goal"; anything else must be a whole number in range. */
function parseGoal(
  value: string,
  max: number,
): { goal: number | null; isValid: boolean } {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { goal: null, isValid: true };
  }

  const goal = Number(trimmed);
  const isValid = Number.isInteger(goal) && goal >= 1 && goal <= max;
  return { goal: isValid ? goal : null, isValid };
}

interface MembershipSettingsModalProps {
  membership: MembershipProfile;
  onClose: () => void;
}

function MembershipSettingsModal({
  membership,
  onClose,
}: MembershipSettingsModalProps) {
  const dispatch = useAppDispatch();
  const now = useNow();
  // Only fields the member changed in this form are written, so a concurrent edit to another field survives.
  const [openedWith] = useState(membership);
  const [costValues, setCostValues] = useState<CostStepValues>({
    cost: centsToInputValue(membership.monthlyCostCents),
    billTotal:
      membership.taxRate === null
        ? ''
        : centsToInputValue(membership.monthlyTotalCents),
    startDate: toDateInputValue(membership.startDate),
    showBillTotal: membership.taxRate !== null,
  });
  const [goalValues, setGoalValues] = useState<GoalValues>({
    weeklyGoal: membership.weeklyGoal?.toString() ?? '',
    monthlyGoal: membership.monthlyGoal?.toString() ?? '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayDay = fromDateInputValue(toLocalDateInputValue(now)) ?? 0;
  const cost = evaluateCostStep(costValues, todayDay);
  const weekly = parseGoal(goalValues.weeklyGoal, MAX_WEEKLY_GOAL);
  const monthly = parseGoal(goalValues.monthlyGoal, MAX_MONTHLY_GOAL);
  const isValid = cost.isValid && weekly.isValid && monthly.isValid;

  const getChangedFields = (): Partial<MembershipEditableFields> => {
    if (!isValid || cost.costCents === null || cost.startDate === null) {
      return {};
    }

    const next: MembershipEditableFields = {
      monthlyCostCents: cost.costCents,
      monthlyTotalCents: cost.billTotalCents ?? cost.costCents,
      taxRate: cost.billTotalCents === null ? null : cost.taxRate,
      startDate: cost.startDate,
      weeklyGoal: weekly.goal,
      monthlyGoal: monthly.goal,
    };
    const changed = Object.fromEntries(
      Object.entries(next).filter(
        ([key, value]) =>
          openedWith[key as keyof MembershipEditableFields] !== value,
      ),
    ) as Partial<MembershipEditableFields>;
    // Cost, total and rate are derived from each other, so they're written as one group.
    const isCostGroupChanged = COST_GROUP.some((key) => key in changed);
    const result = isCostGroupChanged
      ? {
          ...changed,
          monthlyCostCents: next.monthlyCostCents,
          monthlyTotalCents: next.monthlyTotalCents,
          taxRate: next.taxRate,
        }
      : changed;
    return result;
  };

  const changedFields = getChangedFields();
  const hasChanges = Object.keys(changedFields).length > 0;

  const handleSave = async () => {
    if (!hasChanges) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await dispatch(
        updateMembership({ uid: membership.uid, fields: changedFields }),
      ).unwrap();
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save your membership.'));
      setIsSaving(false);
    }
  };

  const costError = cost.errors.cost;
  const billTotalError = cost.errors.billTotal;
  const costFields = [
    custom({
      name: 'cost',
      label: 'Monthly cost before tax',
      description: 'A new cost applies to every month so far, for now.',
      renderComponent: (props) => (
        <MoneyInput
          ariaLabel='Monthly cost before tax'
          placeholder={centsToInputValue(membership.monthlyCostCents)}
          value={(props.value as string | undefined) ?? ''}
          errorMessage={costError}
          onChange={(value) => props.onValueChange(value)}
        />
      ),
    }),
    ...(costValues.showBillTotal
      ? [
          custom({
            name: 'billTotal',
            label: 'Total on your bill, with tax',
            renderComponent: (props) => (
              <MoneyInput
                ariaLabel='Total on your bill, with tax'
                placeholder={centsToInputValue(membership.monthlyTotalCents)}
                value={(props.value as string | undefined) ?? ''}
                errorMessage={billTotalError}
                onChange={(value) => props.onValueChange(value)}
              />
            ),
          }),
        ]
      : []),
  ];

  const startDateFields = [
    createDateInputField({
      name: 'startDate',
      label: 'When did your membership start?',
      variant: 'outline',
    }),
  ];

  const goalFields = [
    input({
      name: 'weeklyGoal',
      label: 'Movies a week',
      type: 'number',
      placeholder: membership.weeklyGoal?.toString() ?? '2',
      variant: 'outline',
      isValid: (value) =>
        parseGoal(value, MAX_WEEKLY_GOAL).isValid
          ? { valid: true }
          : {
              valid: false,
              message: `A whole number from 1 to ${MAX_WEEKLY_GOAL}.`,
            },
    }),
    input({
      name: 'monthlyGoal',
      label: 'Movies a month',
      type: 'number',
      placeholder: membership.monthlyGoal?.toString() ?? '6',
      variant: 'outline',
      isValid: (value) =>
        parseGoal(value, MAX_MONTHLY_GOAL).isValid
          ? { valid: true }
          : {
              valid: false,
              message: `A whole number from 1 to ${MAX_MONTHLY_GOAL}.`,
            },
    }),
  ];

  return (
    <Modal isOpen onClose={onClose} title='Membership'>
      <div className='space-y-3'>
        <FormSection label='Cost & tax' defaultOpen>
          <div className='space-y-2'>
            <Form
              key={costValues.showBillTotal ? 'with-bill' : 'no-bill'}
              id='a-list-settings-cost'
              form={costFields}
              initialData={costValues}
              columns={1}
              spacing='normal'
              onDataChange={(data) =>
                setCostValues({
                  ...costValues,
                  ...(data as Partial<CostStepValues>),
                })
              }
            />
            {costValues.showBillTotal ? (
              <div className='flex items-start justify-between gap-3'>
                <p className='text-muted-foreground text-sm'>
                  {cost.taxRate !== null && !billTotalError
                    ? `That works out to about ${formatTaxRate(cost.taxRate)} tax.`
                    : 'Add the total from your bill and we’ll work out your tax rate.'}
                </p>
                <Button
                  type='button'
                  variant='link'
                  size='sm'
                  className='shrink-0'
                  onClick={() =>
                    setCostValues({
                      ...costValues,
                      billTotal: '',
                      showBillTotal: false,
                    })
                  }
                >
                  Remove total
                </Button>
              </div>
            ) : (
              <Button
                type='button'
                variant='link'
                size='sm'
                className='px-0'
                onClick={() =>
                  setCostValues({ ...costValues, showBillTotal: true })
                }
              >
                + Add the total on your bill
              </Button>
            )}
          </div>
        </FormSection>
        <FormSection label='Start date'>
          <Form
            id='a-list-settings-start'
            form={startDateFields}
            initialData={{ startDate: costValues.startDate }}
            columns={1}
            spacing='normal'
            onDataChange={(data) =>
              setCostValues({
                ...costValues,
                startDate: (data.startDate as string) ?? '',
              })
            }
          />
          {cost.errors.startDate && (
            <p className='text-destructive mt-2 text-sm'>
              {cost.errors.startDate}
            </p>
          )}
        </FormSection>
        <FormSection label='Goals'>
          <Form
            id='a-list-settings-goals'
            form={goalFields}
            initialData={goalValues}
            columns={2}
            spacing='normal'
            onDataChange={(data) => setGoalValues(data as GoalValues)}
          />
        </FormSection>
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          rightActions={
            <>
              <Button
                type='button'
                variant='secondary'
                disabled={isSaving}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type='button'
                loading={isSaving}
                disabled={!isValid || !hasChanges || isSaving}
                onClick={() => void handleSave()}
              >
                Save
              </Button>
            </>
          }
        />
      </div>
    </Modal>
  );
}

export default MembershipSettingsModal;

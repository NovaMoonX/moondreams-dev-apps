import { useState, type ReactNode } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Label,
} from '@moondreamsdev/dreamer-ui/components';

import DateInput from '@/components/DateInput';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import MoneyInput from '@/components/MoneyInput';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch } from '@/store';
import {
  fromDateInputValue,
  toDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { centsToInputValue } from '@/utils/moneyUtils';
import WeekResetHelp from '@apps/a-list/components/shared/WeekResetHelp';
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
import { formatTaxRate } from '@apps/a-list/utils/tax';

const { custom, input } = FormFactories;

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

interface SheetProps {
  membership: MembershipProfile;
  onClose: () => void;
}

interface SettingsSheetProps extends SheetProps {
  title: string;
  isDirty: boolean;
  isValid: boolean;
  fields: Partial<MembershipEditableFields>;
  children: ReactNode;
}

/** One group's sheet: writes only the fields it owns, and asks before closing over unsaved edits. */
function SettingsSheet({
  membership,
  onClose,
  title,
  isDirty,
  isValid,
  fields,
  children,
}: SettingsSheetProps) {
  const dispatch = useAppDispatch();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestClose = useDiscardGuard({
    isDirty,
    isBusy: isSaving,
    onClose,
    title: 'Discard your changes?',
    message: 'Your membership stays as it was.',
  });

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await dispatch(
        updateMembership({ uid: membership.uid, fields }),
      ).unwrap();
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save your membership.'));
      setIsSaving(false);
    }
  };

  return (
    <FormSheet isOpen onClose={requestClose} title={title}>
      <div className='space-y-3 pb-4'>{children}</div>
      <ModalFooterActions
        note={error}
        rightActions={
          <>
            <Button
              type='button'
              variant='secondary'
              rounded='full'
              disabled={isSaving}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button
              type='button'
              rounded='full'
              loading={isSaving}
              disabled={!isValid || !isDirty || isSaving}
              onClick={() => void save()}
            >
              Save
            </Button>
          </>
        }
      />
    </FormSheet>
  );
}

export function CostSheet({ membership, onClose }: SheetProps) {
  const now = useNow();
  const [start] = useState<CostStepValues>(() => ({
    cost: centsToInputValue(membership.monthlyCostCents),
    billTotal:
      membership.taxRate === null
        ? ''
        : centsToInputValue(membership.monthlyTotalCents),
    startDate: toDateInputValue(membership.startDate),
    showBillTotal: membership.taxRate !== null,
  }));
  const [openedWith] = useState(membership);
  const [values, setValues] = useState(start);
  const [formKey, setFormKey] = useState(0);
  const todayDay = fromDateInputValue(toLocalDateInputValue(now)) ?? 0;
  const cost = evaluateCostStep(values, todayDay);
  const billTotalError = cost.errors.billTotal;
  const isValid = cost.isValid && cost.costCents !== null;
  const next = {
    monthlyCostCents: cost.costCents ?? openedWith.monthlyCostCents,
    monthlyTotalCents:
      cost.billTotalCents ?? cost.costCents ?? openedWith.monthlyTotalCents,
    taxRate: cost.billTotalCents === null ? null : cost.taxRate,
  };
  const isDirty =
    next.monthlyCostCents !== openedWith.monthlyCostCents ||
    next.monthlyTotalCents !== openedWith.monthlyTotalCents ||
    next.taxRate !== openedWith.taxRate;
  // Cost, total and rate are derived from each other, so they're written as one group.
  const fields = isValid && isDirty ? next : {};

  const form = [
    custom({
      name: 'cost',
      label: 'Monthly cost before tax',
      description: 'A new cost applies to every month so far, for now.',
      renderComponent: (props) => (
        <MoneyInput
          ariaLabel='Monthly cost before tax'
          placeholder={centsToInputValue(membership.monthlyCostCents)}
          value={(props.value as string | undefined) ?? ''}
          errorMessage={cost.errors.cost}
          onChange={(value) => props.onValueChange(value)}
        />
      ),
    }),
    ...(values.showBillTotal
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

  return (
    <SettingsSheet
      membership={membership}
      onClose={onClose}
      title='Monthly cost'
      isDirty={isDirty}
      isValid={isValid}
      fields={fields}
    >
      <Form
        key={`${formKey}-${values.showBillTotal ? 'with-bill' : 'no-bill'}`}
        id='a-list-settings-cost'
        form={form}
        initialData={values}
        columns={1}
        spacing='normal'
        onDataChange={(data) =>
          setValues({ ...values, ...(data as Partial<CostStepValues>) })
        }
      />
      {values.showBillTotal ? (
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
            onClick={() => {
              setValues({ ...values, billTotal: '', showBillTotal: false });
              setFormKey((current) => current + 1);
            }}
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
          onClick={() => setValues({ ...values, showBillTotal: true })}
        >
          + Add the total on your bill
        </Button>
      )}
    </SettingsSheet>
  );
}

export function StartDateSheet({ membership, onClose }: SheetProps) {
  const now = useNow();
  const [start] = useState(() => toDateInputValue(membership.startDate));
  const [value, setValue] = useState(start);
  const todayDay = fromDateInputValue(toLocalDateInputValue(now)) ?? 0;
  const cost = evaluateCostStep(
    {
      cost: centsToInputValue(membership.monthlyCostCents),
      billTotal: '',
      startDate: value,
      showBillTotal: false,
    },
    todayDay,
  );
  const isValid =
    cost.errors.startDate === undefined && cost.startDate !== null;

  return (
    <SettingsSheet
      membership={membership}
      onClose={onClose}
      title='Start date'
      isDirty={value !== start}
      isValid={isValid}
      fields={cost.startDate === null ? {} : { startDate: cost.startDate }}
    >
      <div className='space-y-1.5'>
        <Label>When did your membership start?</Label>
        <DateInput
          variant='outline'
          rounded='full'
          aria-label='Membership start date'
          max={toDateInputValue(todayDay)}
          value={value}
          errorMessage={cost.errors.startDate}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
    </SettingsSheet>
  );
}

interface GoalValues {
  weeklyGoal: string;
  monthlyGoal: string;
}

export function GoalsSheet({ membership, onClose }: SheetProps) {
  const [start] = useState<GoalValues>(() => ({
    weeklyGoal: membership.weeklyGoal?.toString() ?? '',
    monthlyGoal: membership.monthlyGoal?.toString() ?? '',
  }));
  const [openedWith] = useState(membership);
  const [values, setValues] = useState(start);
  const weekly = parseGoal(values.weeklyGoal, MAX_WEEKLY_GOAL);
  const monthly = parseGoal(values.monthlyGoal, MAX_MONTHLY_GOAL);
  const isValid = weekly.isValid && monthly.isValid;
  const fields: Partial<MembershipEditableFields> = {
    ...(weekly.goal !== openedWith.weeklyGoal && { weeklyGoal: weekly.goal }),
    ...(monthly.goal !== openedWith.monthlyGoal && {
      monthlyGoal: monthly.goal,
    }),
  };

  const form = [
    input({
      name: 'weeklyGoal',
      label: 'Movies a week',
      description: 'Counted Friday to Friday, like AMC.',
      type: 'number',
      placeholder: membership.weeklyGoal?.toString() ?? '2',
      variant: 'outline',
      rounded: 'full',
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
      description: 'Counted by calendar month.',
      type: 'number',
      placeholder: membership.monthlyGoal?.toString() ?? '6',
      variant: 'outline',
      rounded: 'full',
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
    <SettingsSheet
      membership={membership}
      onClose={onClose}
      title='Goals'
      isDirty={Object.keys(fields).length > 0}
      isValid={isValid}
      fields={fields}
    >
      <div className='flex justify-end'>
        <WeekResetHelp />
      </div>
      <Form
        id='a-list-settings-goals'
        form={form}
        initialData={values}
        columns={2}
        spacing='normal'
        onDataChange={(data) => setValues(data as GoalValues)}
      />
    </SettingsSheet>
  );
}

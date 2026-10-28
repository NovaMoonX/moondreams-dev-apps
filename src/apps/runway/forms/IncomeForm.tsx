import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
} from '@moondreamsdev/dreamer-ui/components';

import AmountField from '@/components/AmountField';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { parseMoneyToCents } from '@/utils/moneyUtils';
import {
  DEFAULT_PAY_LINE_NAME,
  INCOME_ENDING_LABELS,
  INCOME_ENDINGS,
  INCOME_FREQUENCIES,
  MAX_ENDING_COUNT,
  MAX_NAME_LENGTH,
  SCHEDULE_LABELS,
} from '@apps/runway/constants';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  createIncome,
  type CreateIncomeInput,
} from '@apps/runway/store/actions/itemActions';
import { selectResolvedPlan } from '@apps/runway/store/selectors/runwaySelectors';
import type { Ending, Schedule } from '@apps/runway/types';

type Frequency = (typeof INCOME_FREQUENCIES)[number];
type EndKind = (typeof INCOME_ENDINGS)[number];

interface IncomeFormData {
  source: { choice: string; newText: string };
  payName: string;
  amount: string;
  frequency: Frequency | null;
  startDate: string;
  secondDay: string;
  endKind: EndKind;
  endDate: string;
  endCount: string;
}

interface IncomeFormProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** What the sheet starts on; the income form leaves it open and an expected income starts on once. */
  defaultFrequency: Frequency | null;
}

const { custom } = FormFactories;

const frequencyOptions = INCOME_FREQUENCIES.map((value) => ({
  value,
  label: SCHEDULE_LABELS[value],
}));
const endingOptions = INCOME_ENDINGS.map((value) => ({
  value,
  label: INCOME_ENDING_LABELS[value],
}));

const parseDay = (value: string) => {
  const day = Number(value);
  const result = Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
  return result;
};

const parseCount = (value: string) => {
  const count = Number(value);
  const result =
    Number.isInteger(count) && count >= 1 && count <= MAX_ENDING_COUNT
      ? count
      : null;
  return result;
};

const getSourceName = (data: IncomeFormData, names: Record<string, string>) =>
  data.source.choice === NEW_CHOICE || data.source.choice === ''
    ? data.source.newText.trim()
    : (names[data.source.choice] ?? '');

const buildSchedule = (data: IncomeFormData): Schedule | null => {
  const anchor = fromDateInputValue(data.startDate);
  if (anchor === undefined || data.frequency === null) return null;
  if (data.frequency === 'monthly') {
    return {
      kind: 'monthly',
      anchor,
      monthDays: [new Date(anchor).getUTCDate()],
    };
  }
  if (data.frequency === 'twiceMonthly') {
    const second = parseDay(data.secondDay);
    const first = new Date(anchor).getUTCDate();
    if (second === null || second === first) return null;
    return {
      kind: 'twiceMonthly',
      anchor,
      monthDays: [first, second].sort((a, b) => a - b),
    };
  }
  return { kind: data.frequency, anchor, monthDays: [] };
};

const buildEnding = (data: IncomeFormData): Ending | null => {
  if (data.frequency === 'once' || data.endKind === 'never') {
    return { onDate: null, afterCount: null };
  }
  if (data.endKind === 'date') {
    const onDate = fromDateInputValue(data.endDate);
    const start = fromDateInputValue(data.startDate);
    if (onDate === undefined || (start !== undefined && onDate < start))
      return null;
    return { onDate, afterCount: null };
  }
  const afterCount = parseCount(data.endCount);
  return afterCount === null ? null : { onDate: null, afterCount };
};

const getBlocker = (
  data: IncomeFormData,
  sourceName: string,
  amountCents: number | null,
) => {
  if (sourceName === '') return 'Choose or name where it comes from.';
  if (amountCents === null || amountCents <= 0)
    return 'Enter the amount that lands in your account.';
  if (data.frequency === null) return 'Pick how often it arrives.';
  if (fromDateInputValue(data.startDate) === undefined) return 'Pick the date.';
  if (data.frequency === 'twiceMonthly' && buildSchedule(data) === null) {
    return 'Enter a second payday that is a different day of the month.';
  }
  if (buildEnding(data) === null) return 'Finish when it ends.';
  return null;
};

function IncomeForm({
  isOpen,
  onClose,
  title,
  defaultFrequency,
}: IncomeFormProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const resolved = useAppSelector((state) => selectResolvedPlan(state, today));
  const [initialData] = useState<IncomeFormData>(() => ({
    source: { choice: '', newText: '' },
    payName: '',
    amount: '',
    frequency: defaultFrequency,
    startDate: toDateInputValue(today),
    secondDay: '',
    endKind: 'never',
    endDate: '',
    endCount: '',
  }));
  const [formData, setFormData] = useState<IncomeFormData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const sourceNames = Object.fromEntries(
    resolved.map((source) => [source.item.id, source.version.payload.name]),
  );
  const sourceOptions = resolved.map((source) => ({
    value: source.item.id,
    label: source.version.payload.name,
  }));
  const sourceName = getSourceName(formData, sourceNames);
  const amountCents = parseMoneyToCents(formData.amount);
  const blocker = getBlocker(formData, sourceName, amountCents);
  const isOnce = formData.frequency === 'once';

  const fields = useMemo(() => {
    const dateField = custom({
      name: 'startDate',
      label: '',
      renderComponent: (props) => (
        <div className='space-y-1.5'>
          <p className='text-muted-foreground text-xs'>
            {isOnce ? 'Arrives' : 'First payday'}
          </p>
          <Input
            type='date'
            variant='outline'
            aria-label={isOnce ? 'Arrives' : 'First payday'}
            value={props.value as string}
            onChange={(event) => props.onValueChange(event.target.value)}
          />
        </div>
      ),
    });
    const secondDayField = custom({
      name: 'secondDay',
      label: '',
      renderComponent: (props) => (
        <div className='space-y-1.5'>
          <p className='text-muted-foreground text-xs'>
            Other payday of the month
          </p>
          <Input
            type='number'
            inputMode='numeric'
            min={1}
            max={31}
            variant='outline'
            aria-label='Other payday of the month'
            placeholder='15'
            value={props.value as string}
            onChange={(event) => props.onValueChange(event.target.value)}
          />
        </div>
      ),
    });
    const endingField = custom({
      name: 'endKind',
      label: '',
      renderComponent: (props) => (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs'>Ends</p>
          <PillGroup
            label='Ends'
            options={endingOptions}
            value={props.value as EndKind}
            onChange={(value) => props.onValueChange(value)}
          />
        </div>
      ),
    });
    const endDateField = custom({
      name: 'endDate',
      label: '',
      renderComponent: (props) => (
        <Input
          type='date'
          variant='outline'
          aria-label='Last payday'
          min={formData.startDate || undefined}
          value={props.value as string}
          onChange={(event) => props.onValueChange(event.target.value)}
        />
      ),
    });
    const endCountField = custom({
      name: 'endCount',
      label: '',
      renderComponent: (props) => (
        <Input
          type='number'
          inputMode='numeric'
          min={1}
          max={MAX_ENDING_COUNT}
          variant='outline'
          aria-label='How many payments'
          placeholder='How many payments, like 6'
          value={props.value as string}
          onChange={(event) => props.onValueChange(event.target.value)}
        />
      ),
    });

    const result = [
      custom({
        name: 'source',
        label: '',
        renderComponent: (props) => {
          const value = props.value as IncomeFormData['source'];
          return (
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs'>
                Where it comes from
              </p>
              <PickOrCreate
                label='Where it comes from'
                options={sourceOptions}
                choice={value.choice}
                newText={value.newText}
                newPillLabel='New source'
                newPlaceholder='Employer or source'
                maxLength={MAX_NAME_LENGTH}
                onChange={(choice, newText) =>
                  props.onValueChange({ choice, newText })
                }
              />
            </div>
          );
        },
      }),
      custom({
        name: 'payName',
        label: '',
        renderComponent: (props) => (
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs'>
              What this pay is called
            </p>
            <Input
              variant='outline'
              aria-label='What this pay is called'
              placeholder={DEFAULT_PAY_LINE_NAME}
              maxLength={MAX_NAME_LENGTH}
              value={props.value as string}
              onChange={(event) => props.onValueChange(event.target.value)}
            />
          </div>
        ),
      }),
      custom({
        name: 'amount',
        label: '',
        renderComponent: (props) => (
          <AmountField
            label='Take-home pay'
            hint='What lands in your account each time.'
            value={props.value as string}
            onChange={(value) => props.onValueChange(value)}
          />
        ),
      }),
      custom({
        name: 'frequency',
        label: '',
        renderComponent: (props) => (
          <div className='space-y-2'>
            <p className='text-muted-foreground text-xs'>How often</p>
            <PillGroup
              label='How often'
              options={frequencyOptions}
              value={props.value as Frequency | null}
              onChange={(value) => props.onValueChange(value)}
            />
          </div>
        ),
      }),
      ...(formData.frequency === null ? [] : [dateField]),
      ...(formData.frequency === 'twiceMonthly' ? [secondDayField] : []),
      ...(formData.frequency === null || isOnce ? [] : [endingField]),
      ...(!isOnce && formData.frequency !== null && formData.endKind === 'date'
        ? [endDateField]
        : []),
      ...(!isOnce && formData.frequency !== null && formData.endKind === 'count'
        ? [endCountField]
        : []),
    ];
    return result;
  }, [
    sourceOptions,
    formData.frequency,
    formData.endKind,
    formData.startDate,
    isOnce,
  ]);

  const handleSubmit = async (data: IncomeFormData) => {
    const schedule = buildSchedule(data);
    const ending = buildEnding(data);
    const cents = parseMoneyToCents(data.amount);
    const startDate = fromDateInputValue(data.startDate);
    if (
      !user ||
      !schedule ||
      !ending ||
      cents === null ||
      startDate === undefined
    )
      return;

    const existingSource =
      data.source.choice !== NEW_CHOICE && data.source.choice !== '';
    const input: CreateIncomeInput = {
      sourceId: existingSource ? data.source.choice : null,
      sourceName: getSourceName(data, sourceNames),
      payLineName: data.payName.trim() || DEFAULT_PAY_LINE_NAME,
      amountCents: cents,
      schedule,
      ending,
      startDate,
    };

    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await createIncome(user.uid, encryption, input);
      onClose();
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          'This income did not save. Nothing was changed.',
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FormSheet isOpen={isOpen} onClose={onClose} title={title}>
      <Form
        id='runway-income'
        form={fields}
        initialData={initialData}
        columns={1}
        onDataChange={(data) => setFormData(data as IncomeFormData)}
        onSubmit={(data) => {
          void handleSubmit(data as IncomeFormData);
        }}
        submitButton={
          <ModalFooterActions
            note={error ?? blocker}
            cancelAction={
              <Button
                type='button'
                variant='secondary'
                onClick={onClose}
                disabled={isSaving}
              >
                Cancel
              </Button>
            }
            rightActions={
              <Button
                type='submit'
                loading={isSaving}
                disabled={isSaving || blocker !== null}
              >
                Add
              </Button>
            }
          />
        }
      />
    </FormSheet>
  );
}

export default IncomeForm;

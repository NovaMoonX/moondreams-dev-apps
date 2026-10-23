import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';

import {
  Button,
  Form,
  FormFactories,
  Input,
} from '@moondreamsdev/dreamer-ui/components';

import AmountField from '@/components/AmountField';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import RevealChip from '@/components/RevealChip';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { parseMoneyToCents } from '@/utils/moneyUtils';
import {
  BILL_FREQUENCIES,
  BILL_FREQUENCY_LABELS,
  BILL_FUNDING_LABELS,
  BILL_FUNDINGS,
  ENVELOPE_ORDER_STEP,
  INCOME_ENDING_LABELS,
  INCOME_ENDINGS,
  MAX_CHOSEN_DAYS,
  MAX_EMOJI_LENGTH,
  MAX_ENDING_COUNT,
  MAX_NAME_LENGTH,
  PRIORITIES,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { createBill } from '@apps/runway/store/actions/itemActions';
import {
  selectBills,
  selectComingDays,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { BillFundedBy, Ending, Priority } from '@apps/runway/types';

type Frequency = (typeof BILL_FREQUENCIES)[number];
type Funding = (typeof BILL_FUNDINGS)[number];
type EndKind = (typeof INCOME_ENDINGS)[number];

interface BillFormData {
  name: string;
  amount: string;
  priority: Priority;
  startDate: string;
  frequency: Frequency;
  endKind: EndKind;
  endDate: string;
  endCount: string;
  funding: Funding;
  dayKeys: string[];
  /** Null until the person adds one. */
  emoji: string | null;
}

interface BillFormProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
}

const { custom } = FormFactories;

const priorityOptions = PRIORITIES.map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));
const frequencyOptions = BILL_FREQUENCIES.map((value) => ({
  value,
  label: BILL_FREQUENCY_LABELS[value],
}));
const endingOptions = INCOME_ENDINGS.map((value) => ({
  value,
  label: INCOME_ENDING_LABELS[value],
}));
const fundingOptions = BILL_FUNDINGS.map((value) => ({
  value,
  label: BILL_FUNDING_LABELS[value],
}));

const parseCount = (value: string) => {
  const count = Number(value);
  const result =
    Number.isInteger(count) && count >= 1 && count <= MAX_ENDING_COUNT
      ? count
      : null;
  return result;
};

const buildEnding = (data: BillFormData): Ending | null => {
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
  data: BillFormData,
  amountCents: number | null,
  today: number,
  isChosen: boolean,
  pickedCount: number,
) => {
  if (data.name.trim() === '') return 'Name the bill.';
  if (amountCents === null || amountCents <= 0)
    return 'Enter how much the bill is.';
  const start = fromDateInputValue(data.startDate);
  if (start === undefined) return 'Pick when it is due.';
  if (start < today) return 'Pick today or a day to come.';
  if (buildEnding(data) === null) return 'Finish when it ends.';
  if (isChosen && pickedCount === 0)
    return 'Pick at least one income day.';
  return null;
};

function BillForm({ isOpen, onClose, title }: BillFormProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const [initialData] = useState<BillFormData>(() => ({
    name: '',
    amount: '',
    priority: 'should',
    startDate: toDateInputValue(today),
    frequency: 'once',
    endKind: 'never',
    endDate: '',
    endCount: '',
    funding: 'suggested',
    dayKeys: [],
    emoji: null,
  }));
  const [formData, setFormData] = useState<BillFormData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const amountCents = parseMoneyToCents(formData.amount);
  const isOnce = formData.frequency === 'once';
  const dueDate = fromDateInputValue(formData.startDate);
  const dueDays = comingDays.filter(
    (day) => dueDate !== undefined && day.on <= dueDate,
  );
  const canChoose = isOnce && dueDays.length > 0;
  const isChosen = canChoose && formData.funding === 'chosen';
  const pickedCount = dueDays.filter((day) =>
    formData.dayKeys.includes(day.dayKey),
  ).length;
  const blocker = getBlocker(
    formData,
    amountCents,
    today,
    isChosen,
    pickedCount,
  );

  const dayOptions = dueDays.map((day) => ({
    value: day.dayKey,
    label: `${formatDateUTC(day.on)} · ${day.sourceName ?? day.payLineName}`,
  }));

  const fields = useMemo(() => {
    const result = [
      custom({
        name: 'name',
        label: '',
        renderComponent: (props) => (
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs'>Name</p>
            <Input
              variant='outline'
              aria-label='Name'
              placeholder='Rent'
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
            label='Amount'
            hint='What you pay each time it is due.'
            value={props.value as string}
            onChange={(value) => props.onValueChange(value)}
          />
        ),
      }),
      custom({
        name: 'priority',
        label: '',
        renderComponent: (props) => (
          <div className='space-y-2'>
            <p className='text-muted-foreground text-xs'>How much it matters</p>
            <PillGroup
              label='How much it matters'
              options={priorityOptions}
              value={props.value as Priority}
              onChange={(value) => props.onValueChange(value)}
            />
          </div>
        ),
      }),
      custom({
        name: 'startDate',
        label: '',
        renderComponent: (props) => (
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs'>
              {isOnce ? 'Due' : 'Starts'}
            </p>
            <Input
              type='date'
              variant='outline'
              aria-label={isOnce ? 'Due' : 'Starts'}
              min={toDateInputValue(today)}
              value={props.value as string}
              onChange={(event) => props.onValueChange(event.target.value)}
            />
          </div>
        ),
      }),
      custom({
        name: 'frequency',
        label: '',
        renderComponent: (props) => (
          <div className='space-y-2'>
            <p className='text-muted-foreground text-xs'>Repeats</p>
            <PillGroup
              label='Repeats'
              options={frequencyOptions}
              value={props.value as Frequency}
              onChange={(value) => props.onValueChange(value)}
            />
          </div>
        ),
      }),
      ...(isOnce
        ? []
        : [
            custom({
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
            }),
          ]),
      ...(!isOnce && formData.endKind === 'date'
        ? [
            custom({
              name: 'endDate',
              label: '',
              renderComponent: (props) => (
                <Input
                  type='date'
                  variant='outline'
                  aria-label='Last payment'
                  min={formData.startDate || undefined}
                  value={props.value as string}
                  onChange={(event) => props.onValueChange(event.target.value)}
                />
              ),
            }),
          ]
        : []),
      ...(!isOnce && formData.endKind === 'count'
        ? [
            custom({
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
            }),
          ]
        : []),
      ...(canChoose
        ? [
            custom({
              name: 'funding',
              label: '',
              renderComponent: (props) => (
                <div className='space-y-2'>
                  <p className='text-muted-foreground text-xs'>Funded from</p>
                  <PillGroup
                    label='Funded from'
                    options={fundingOptions}
                    value={props.value as Funding}
                    onChange={(value) => props.onValueChange(value)}
                  />
                </div>
              ),
            }),
          ]
        : []),
      ...(isChosen
        ? [
            custom({
              name: 'dayKeys',
              label: '',
              renderComponent: (props) => (
                <div className='space-y-2'>
                  <p className='text-muted-foreground text-xs'>
                    Which income days
                  </p>
                  <MultiPillGroup
                    label='Which income days'
                    options={dayOptions}
                    values={props.value as string[]}
                    onChange={(values) =>
                      props.onValueChange(values.slice(0, MAX_CHOSEN_DAYS))
                    }
                  />
                </div>
              ),
            }),
          ]
        : []),
      custom({
        name: 'emoji',
        label: '',
        renderComponent: (props) => {
          const emoji = props.value as string | null;
          if (emoji === null) {
            return (
              <div>
                <RevealChip
                  icon={<Plus className='h-4 w-4' />}
                  onClick={() => props.onValueChange('')}
                >
                  Add emoji
                </RevealChip>
              </div>
            );
          }
          return (
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs'>Emoji</p>
              <div className='flex items-center gap-2'>
                <div className='w-24 shrink-0'>
                  <Input
                    variant='outline'
                    aria-label='Emoji'
                    placeholder='🏠'
                    maxLength={MAX_EMOJI_LENGTH}
                    value={emoji}
                    onChange={(event) =>
                      props.onValueChange(event.target.value)
                    }
                  />
                </div>
                <RevealChip
                  icon={<X className='h-4 w-4' />}
                  onClick={() => props.onValueChange(null)}
                >
                  Remove emoji
                </RevealChip>
              </div>
            </div>
          );
        },
      }),
    ];
    return result;
  }, [
    isOnce,
    isChosen,
    canChoose,
    formData.endKind,
    formData.startDate,
    dayOptions,
    today,
  ]);

  const handleSubmit = async (data: BillFormData) => {
    const cents = parseMoneyToCents(data.amount);
    const anchor = fromDateInputValue(data.startDate);
    const ending = buildEnding(data);
    if (!user || cents === null || anchor === undefined || !ending) return;

    const tier = bills.filter(
      (bill) => bill.version.payload.priority === data.priority,
    );
    const orderIndex =
      Math.max(0, ...tier.map((bill) => bill.version.payload.orderIndex)) +
      ENVELOPE_ORDER_STEP;
    const chosen = new Set(data.dayKeys);
    const fundedBy: BillFundedBy = isChosen
      ? {
          kind: 'chosen',
          dayKeys: dueDays
            .filter((day) => chosen.has(day.dayKey))
            .map((day) => day.dayKey),
        }
      : { kind: 'suggested' };

    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await createBill(user.uid, encryption, {
        startDate: today,
        bill: {
          name: data.name.trim(),
          emoji: data.emoji?.trim() || null,
          priority: data.priority,
          orderIndex,
          amount: { lowCents: cents, highCents: cents },
          timing: {
            kind: 'date',
            schedule: {
              kind: data.frequency,
              anchor,
              monthDays:
                data.frequency === 'monthly'
                  ? [new Date(anchor).getUTCDate()]
                  : [],
            },
          },
          ending,
          fundedBy,
        },
      });
      onClose();
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          'This bill did not save. Nothing was changed.',
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FormSheet isOpen={isOpen} onClose={onClose} title={title}>
      <Form
        id='runway-bill'
        form={fields}
        initialData={initialData}
        columns={1}
        onDataChange={(data) => setFormData(data as BillFormData)}
        onSubmit={(data) => {
          void handleSubmit(data as BillFormData);
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

export default BillForm;

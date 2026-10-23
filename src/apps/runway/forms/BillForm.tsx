import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';

import {
  Button,
  Form,
  FormFactories,
  Input,
} from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import RevealChip from '@/components/RevealChip';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import {
  BILL_FREQUENCIES,
  BILL_FREQUENCY_LABELS,
  BILL_FUNDING_LABELS,
  BILL_FUNDINGS,
  CHANGE_WORDS,
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
import RangeAmountField from '@apps/runway/forms/RangeAmountField';
import { createBill } from '@apps/runway/store/actions/itemActions';
import ChangeSteps from '@apps/runway/components/ChangeSteps';
import ChangeReason from '@apps/runway/components/ChangeReason';
import { changeField } from '@apps/runway/forms/changeField';
import { ChangeFlowContext } from '@apps/runway/forms/changeFlowContext';
import { useChangeFlow } from '@apps/runway/forms/useChangeFlow';
import {
  EMPTY_AMOUNT_DRAFT,
  getStanceOverride,
  parseAmountDraft,
  toAmountDraft,
  type AmountDraft,
} from '@apps/runway/utils/rangeInput';
import {
  selectBills,
  selectComingDays,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  BillFundedBy,
  BillSealed,
  Ending,
  Priority,
} from '@apps/runway/types';

type Frequency = (typeof BILL_FREQUENCIES)[number];
type Funding = (typeof BILL_FUNDINGS)[number];
type EndKind = (typeof INCOME_ENDINGS)[number];

interface BillFormData {
  name: string;
  amount: AmountDraft;
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
  /** The bill to change; its saved values start the form and a save adds a version from a date. */
  editing?: { itemId: string; payload: BillSealed };
}

const { custom } = FormFactories;

const EMPTY_BILL: BillSealed = {
  name: '',
  emoji: null,
  priority: 'should',
  orderIndex: 0,
  amount: { lowCents: 0, highCents: 0 },
  timing: {
    kind: 'date',
    schedule: { kind: 'once', anchor: null, monthDays: [] },
  },
  ending: { onDate: null, afterCount: null },
  fundedBy: { kind: 'suggested' },
  stanceOverride: null,
};

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
  hasAmount: boolean,
  today: number,
  isChosen: boolean,
  pickedCount: number,
  isEditing: boolean,
) => {
  if (data.name.trim() === '') return 'Name the bill.';
  if (!hasAmount) {
    return data.amount.mode === 'range'
      ? 'Enter a low amount and a higher top amount.'
      : 'Enter how much the bill is.';
  }
  const start = fromDateInputValue(data.startDate);
  if (start === undefined) return 'Pick when it is due.';
  if (!isEditing && start < today) return 'Pick today or a day to come.';
  if (buildEnding(data) === null) return 'Finish when it ends.';
  if (isChosen && pickedCount === 0) return 'Pick at least one income day.';
  return null;
};

const getEditingData = (payload: BillSealed): BillFormData => {
  const { schedule } = payload.timing;
  const frequency = BILL_FREQUENCIES.find((kind) => kind === schedule.kind);
  return {
    name: payload.name,
    amount: toAmountDraft(payload.amount, payload.stanceOverride),
    priority: payload.priority,
    startDate:
      schedule.anchor === null ? '' : toDateInputValue(schedule.anchor),
    frequency: frequency ?? 'once',
    endKind:
      payload.ending.onDate !== null
        ? 'date'
        : payload.ending.afterCount !== null
          ? 'count'
          : 'never',
    endDate:
      payload.ending.onDate === null
        ? ''
        : toDateInputValue(payload.ending.onDate),
    endCount:
      payload.ending.afterCount === null
        ? ''
        : String(payload.ending.afterCount),
    funding: payload.fundedBy.kind === 'chosen' ? 'chosen' : 'suggested',
    dayKeys: payload.fundedBy.kind === 'chosen' ? payload.fundedBy.dayKeys : [],
    emoji: payload.emoji,
  };
};

function BillForm({ isOpen, onClose, title, editing }: BillFormProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const [initialData] = useState<BillFormData>(() =>
    editing
      ? getEditingData(editing.payload)
      : {
          name: '',
          amount: EMPTY_AMOUNT_DRAFT,
          priority: 'should',
          startDate: toDateInputValue(today),
          frequency: 'once',
          endKind: 'never',
          endDate: '',
          endCount: '',
          funding: 'suggested',
          dayKeys: [],
          emoji: null,
        },
  );
  const [formData, setFormData] = useState<BillFormData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const planStance = useAppSelector(selectStance);
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
    parseAmountDraft(formData.amount) !== null,
    today,
    isChosen,
    pickedCount,
    editing !== undefined,
  );

  const startMin = editing ? undefined : toDateInputValue(today);

  const fields = useMemo(() => {
    const dayOptions = comingDays
      .filter((day) => dueDate !== undefined && day.on <= dueDate)
      .map((day) => ({
        value: day.dayKey,
        label: `${formatDateUTC(day.on)} · ${day.sourceName ?? day.payLineName}`,
      }));
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
          <RangeAmountField
            label='Amount'
            hint='What you pay each time it is due.'
            side='expense'
            planStance={planStance}
            value={props.value as AmountDraft}
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
              min={startMin}
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
    comingDays,
    dueDate,
    startMin,
    planStance,
  ]);

  const getChosenKeys = (picked: string[]) =>
    comingDays
      .filter(
        (day) =>
          dueDate !== undefined &&
          day.on <= dueDate &&
          picked.includes(day.dayKey),
      )
      .map((day) => day.dayKey);

  const buildBill = (data: BillFormData): BillSealed | null => {
    const amount = parseAmountDraft(data.amount);
    const anchor = fromDateInputValue(data.startDate);
    const ending = buildEnding(data);
    if (amount === null || anchor === undefined || !ending) return null;

    const tier = bills.filter(
      (bill) => bill.version.payload.priority === data.priority,
    );
    const orderIndex =
      editing && editing.payload.priority === data.priority
        ? editing.payload.orderIndex
        : Math.max(0, ...tier.map((bill) => bill.version.payload.orderIndex)) +
          ENVELOPE_ORDER_STEP;
    const fundedBy: BillFundedBy = isChosen
      ? { kind: 'chosen', dayKeys: getChosenKeys(data.dayKeys) }
      : { kind: 'suggested' };
    const result: BillSealed = {
      name: data.name.trim(),
      emoji: data.emoji?.trim() || null,
      priority: data.priority,
      orderIndex,
      amount,
      timing: {
        kind: 'date',
        schedule: {
          kind: data.frequency,
          anchor,
          monthDays:
            data.frequency === 'monthly' ? [new Date(anchor).getUTCDate()] : [],
        },
      },
      ending,
      fundedBy,
      stanceOverride: getStanceOverride(data.amount),
    };
    return result;
  };

  const candidate = blocker === null ? buildBill(formData) : null;
  const flow = useChangeFlow({
    itemId: editing?.itemId ?? '',
    kind: 'bill',
    current: editing?.payload ?? EMPTY_BILL,
    candidate,
    onDone: onClose,
  });
  const editBlocker = flow.getBlocker(blocker);

  const handleSubmit = async (data: BillFormData) => {
    const bill = buildBill(data);
    if (!user || !bill) return;

    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await createBill(user.uid, encryption, { startDate: today, bill });
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

  const flowValue = {
    flow,
    itemId: editing?.itemId ?? '',
    kind: 'bill' as const,
    candidate,
  };
  const formFields = editing ? [...fields, changeField] : fields;

  return (
    <FormSheet isOpen={isOpen} onClose={onClose} title={title}>
      <ChangeSteps
        isReason={flow.step === 'reason'}
        reason={<ChangeReason flow={flow} onClose={onClose} />}
      >
        <ChangeFlowContext value={flowValue}>
          <Form
            id='runway-bill'
            form={formFields}
            initialData={initialData}
            columns={1}
            onDataChange={(data) => setFormData(data as BillFormData)}
            onSubmit={(data) => {
              if (editing) {
                flow.setStep('reason');
                return;
              }
              void handleSubmit(data as BillFormData);
            }}
            submitButton={
              <ModalFooterActions
                note={error ?? (editing ? editBlocker : blocker)}
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
                    disabled={
                      isSaving || (editing ? editBlocker : blocker) !== null
                    }
                  >
                    {editing ? CHANGE_WORDS.review : 'Add'}
                  </Button>
                }
              />
            }
          />
        </ChangeFlowContext>
      </ChangeSteps>
    </FormSheet>
  );
}

export default BillForm;

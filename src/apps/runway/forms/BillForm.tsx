import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
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
  FORM_FLOW_WORDS,
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
import ChangeSection from '@apps/runway/components/ChangeSection';
import { ChangeFlowContext } from '@apps/runway/forms/changeFlowContext';
import { useChangeFlow } from '@apps/runway/forms/useChangeFlow';
import {
  describeAmountDraft,
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
  /** The income day whose screen opened the edit; "this income day" then means it. */
  presetDayKey?: string;
  /** What the form calls the thing it adds; an expense that is coming is not a bill. */
  noun?: 'bill' | 'expense';
  /** A question to open first when changing a bill ("amount"); every answer starts folded otherwise. */
  openStep?: BillStepId | null;
}

export type BillStepId =
  'name' | 'amount' | 'due' | 'ends' | 'funding' | 'priority' | 'emoji';

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

const describeEnding = (data: BillFormData) => {
  if (data.endKind === 'never') return INCOME_ENDING_LABELS.never;
  if (data.endKind === 'date') {
    const onDate = fromDateInputValue(data.endDate);
    return onDate === undefined ? '' : `After ${formatDateUTC(onDate)}`;
  }
  const count = parseCount(data.endCount);
  return count === null ? '' : `After ${count} payments`;
};

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
  noun: string,
) => {
  if (data.name.trim() === '') return `Name the ${noun}.`;
  if (!hasAmount) {
    return data.amount.mode === 'range'
      ? 'Enter a low amount and a higher top amount.'
      : `Enter how much the ${noun} is.`;
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

function BillForm({
  isOpen,
  onClose,
  title,
  editing,
  presetDayKey,
  noun = 'bill',
  openStep = null,
}: BillFormProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const [formData, setFormData] = useState<BillFormData>(() =>
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
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const set = (patch: Partial<BillFormData>) =>
    setFormData((current) => ({ ...current, ...patch }));

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
    noun,
  );

  const startMin = editing ? undefined : toDateInputValue(today);
  const dayOptions = dueDays.map((day) => ({
    value: day.dayKey,
    label: `${formatDateUTC(day.on)} · ${day.sourceName ?? day.payLineName}`,
  }));
  const isDueValid =
    dueDate !== undefined && (editing !== undefined || dueDate >= today);

  const steps: QuestionStep[] = [
    {
      id: 'name',
      title: FORM_FLOW_WORDS.nameTitle,
      summaryLabel: FORM_FLOW_WORDS.name,
      summaryValue: formData.name.trim(),
      isAnswered: formData.name.trim() !== '',
      render: () => (
        <Input
          variant='outline'
          aria-label={FORM_FLOW_WORDS.name}
          placeholder={noun === 'bill' ? 'Rent' : 'Vet visit'}
          maxLength={MAX_NAME_LENGTH}
          value={formData.name}
          onChange={(event) => set({ name: event.target.value })}
        />
      ),
    },
    {
      id: 'amount',
      title:
        noun === 'bill'
          ? FORM_FLOW_WORDS.billAmountTitle
          : FORM_FLOW_WORDS.expenseAmountTitle,
      summaryLabel: FORM_FLOW_WORDS.amount,
      summaryValue: describeAmountDraft(formData.amount),
      isAnswered: parseAmountDraft(formData.amount) !== null,
      render: () => (
        <RangeAmountField
          isHero
          label={FORM_FLOW_WORDS.amount}
          hint=''
          side='expense'
          planStance={planStance}
          value={formData.amount}
          onChange={(amount) => set({ amount })}
        />
      ),
    },
    {
      id: 'due',
      title: FORM_FLOW_WORDS.dueTitle,
      summaryLabel: FORM_FLOW_WORDS.due,
      summaryValue:
        dueDate === undefined
          ? ''
          : `${formatDateUTC(dueDate)} · ${BILL_FREQUENCY_LABELS[formData.frequency]}`,
      isAnswered: isDueValid,
      render: () => (
        <div className='space-y-4'>
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs'>
              {isOnce ? 'Due' : 'Starts'}
            </p>
            <Input
              type='date'
              variant='outline'
              aria-label={isOnce ? 'Due' : 'Starts'}
              min={startMin}
              value={formData.startDate}
              onChange={(event) => set({ startDate: event.target.value })}
            />
          </div>
          <div className='space-y-2'>
            <p className='text-muted-foreground text-xs'>Repeats</p>
            <PillGroup
              label='Repeats'
              options={frequencyOptions}
              value={formData.frequency}
              onChange={(frequency) => set({ frequency })}
            />
          </div>
        </div>
      ),
    },
    ...(isOnce
      ? []
      : [
          {
            id: 'ends',
            title: FORM_FLOW_WORDS.endsTitle,
            summaryLabel: FORM_FLOW_WORDS.ends,
            summaryValue: describeEnding(formData),
            isAnswered: buildEnding(formData) !== null,
            isPreAnswered: true,
            render: () => (
              <div className='space-y-3'>
                <PillGroup
                  label='Ends'
                  options={endingOptions}
                  value={formData.endKind}
                  onChange={(endKind) => set({ endKind })}
                />
                {formData.endKind === 'date' && (
                  <Input
                    type='date'
                    variant='outline'
                    aria-label='Last payment'
                    min={formData.startDate || undefined}
                    value={formData.endDate}
                    onChange={(event) => set({ endDate: event.target.value })}
                  />
                )}
                {formData.endKind === 'count' && (
                  <Input
                    type='number'
                    inputMode='numeric'
                    min={1}
                    max={MAX_ENDING_COUNT}
                    variant='outline'
                    aria-label='How many payments'
                    placeholder='How many payments, like 6'
                    value={formData.endCount}
                    onChange={(event) => set({ endCount: event.target.value })}
                  />
                )}
              </div>
            ),
          },
        ]),
    ...(canChoose
      ? [
          {
            id: 'funding',
            title: FORM_FLOW_WORDS.fundingTitle,
            summaryLabel: FORM_FLOW_WORDS.funding,
            summaryValue: isChosen
              ? `${BILL_FUNDING_LABELS.chosen} · ${pickedCount}`
              : BILL_FUNDING_LABELS.suggested,
            isAnswered: !isChosen || pickedCount > 0,
            isPreAnswered: true,
            render: () => (
              <div className='space-y-3'>
                <PillGroup
                  label='Funded from'
                  options={fundingOptions}
                  value={formData.funding}
                  onChange={(funding) => set({ funding })}
                />
                {isChosen && (
                  <div className='space-y-2'>
                    <p className='text-muted-foreground text-xs'>
                      Which income days
                    </p>
                    <MultiPillGroup
                      label='Which income days'
                      options={dayOptions}
                      values={formData.dayKeys}
                      onChange={(values) =>
                        set({ dayKeys: values.slice(0, MAX_CHOSEN_DAYS) })
                      }
                    />
                  </div>
                )}
              </div>
            ),
          },
        ]
      : []),
    {
      id: 'priority',
      title: FORM_FLOW_WORDS.priorityTitle,
      summaryLabel: FORM_FLOW_WORDS.priority,
      summaryValue: PRIORITY_LABELS[formData.priority],
      isAnswered: true,
      isPreAnswered: true,
      render: () => (
        <PillGroup
          label={FORM_FLOW_WORDS.priority}
          options={priorityOptions}
          value={formData.priority}
          onChange={(priority) => set({ priority })}
        />
      ),
    },
    {
      id: 'emoji',
      title: FORM_FLOW_WORDS.emojiTitle,
      summaryLabel: FORM_FLOW_WORDS.emoji,
      summaryValue: formData.emoji?.trim() || FORM_FLOW_WORDS.noEmoji,
      isAnswered: true,
      isPreAnswered: true,
      render: () => (
        <div className='w-24'>
          <Input
            variant='outline'
            aria-label={FORM_FLOW_WORDS.emoji}
            placeholder='🏠'
            maxLength={MAX_EMOJI_LENGTH}
            value={formData.emoji ?? ''}
            onChange={(event) => set({ emoji: event.target.value })}
          />
        </div>
      ),
    },
  ];
  const questions = useQuestionFlow({
    steps,
    startFolded: editing !== undefined,
    initialOpenId: editing ? openStep : null,
  });

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
    presetDayKey,
    onDone: onClose,
  });
  const editBlocker = flow.getBlocker(blocker);
  const shownBlocker = editing ? editBlocker : blocker;

  const handleSubmit = async () => {
    const bill = buildBill(formData);
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

  return (
    <FormSheet isOpen={isOpen} onClose={onClose} title={title}>
      <ChangeSteps
        isReason={flow.step === 'reason'}
        reason={<ChangeReason flow={flow} onClose={onClose} />}
      >
        <ChangeFlowContext value={flowValue}>
          <div className='space-y-5'>
            <QuestionFlow
              flow={questions}
              nextLabel={editing ? FORM_FLOW_WORDS.done : FORM_FLOW_WORDS.next}
            />
            {editing && questions.isReview && <ChangeSection />}
            <ModalFooterActions
              note={error ?? (questions.isReview ? shownBlocker : null)}
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
                  type='button'
                  loading={isSaving}
                  disabled={isSaving || shownBlocker !== null}
                  onClick={() => {
                    if (editing) {
                      flow.setStep('reason');
                      return;
                    }
                    void handleSubmit();
                  }}
                >
                  {editing ? CHANGE_WORDS.review : 'Add'}
                </Button>
              }
            />
          </div>
        </ChangeFlowContext>
      </ChangeSteps>
    </FormSheet>
  );
}

export default BillForm;

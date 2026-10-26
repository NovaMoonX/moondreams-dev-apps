import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import {
  CHANGE_WORDS,
  DEFAULT_PAY_LINE_NAME,
  FORM_FLOW_WORDS,
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
import ChangeSteps from '@apps/runway/components/ChangeSteps';
import ChangeReason from '@apps/runway/components/ChangeReason';
import ChangeSection from '@apps/runway/components/ChangeSection';
import { ChangeFlowContext } from '@apps/runway/forms/changeFlowContext';
import { useChangeFlow } from '@apps/runway/forms/useChangeFlow';
import RangeAmountField from '@apps/runway/forms/RangeAmountField';
import {
  describeAmountDraft,
  EMPTY_AMOUNT_DRAFT,
  getStanceOverride,
  parseAmountDraft,
  toAmountDraft,
  type AmountDraft,
} from '@apps/runway/utils/rangeInput';
import {
  selectResolvedPlan,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  Ending,
  PayLineSealed,
  Schedule,
  SourceSealed,
} from '@apps/runway/types';

type Frequency = (typeof INCOME_FREQUENCIES)[number];
type EndKind = (typeof INCOME_ENDINGS)[number];

interface IncomeFormData {
  source: { choice: string; newText: string };
  payName: string;
  amount: AmountDraft;
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
  /** A pay line or source to change; its saved values start the form and a save adds a version from a date. */
  editing?: EditingIncome;
  /** A question to open first when changing a pay line ("amount"); every answer starts folded otherwise. */
  openStep?: IncomeStepId | null;
}

export type IncomeStepId =
  'source' | 'amount' | 'schedule' | 'ends' | 'payName' | 'sourceName';

export type EditingIncome =
  | { itemId: string; kind: 'payLine'; payload: PayLineSealed }
  | { itemId: string; kind: 'source'; payload: SourceSealed };

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

const EMPTY_PAY_LINE: PayLineSealed = {
  name: '',
  schedule: { kind: 'once', anchor: null, monthDays: [] },
  amount: { lowCents: 0, highCents: 0 },
  ending: { onDate: null, afterCount: null },
  stanceOverride: null,
  pairings: [],
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
  hasAmount: boolean,
  isEditing: boolean,
) => {
  if (!isEditing && sourceName === '')
    return 'Choose or name where it comes from.';
  if (!hasAmount) {
    return data.amount.mode === 'range'
      ? 'Enter a low amount and a higher top amount.'
      : 'Enter the amount that lands in your account.';
  }
  if (data.frequency === null) return 'Pick how often it arrives.';
  if (fromDateInputValue(data.startDate) === undefined) return 'Pick the date.';
  if (data.frequency === 'twiceMonthly' && buildSchedule(data) === null) {
    return 'Enter a second payday that is a different day of the month.';
  }
  if (buildEnding(data) === null) return 'Finish when it ends.';
  return null;
};

const getEditingData = (editing: EditingIncome): IncomeFormData => {
  const blank: IncomeFormData = {
    source: { choice: '', newText: '' },
    payName: editing.payload.name,
    amount: EMPTY_AMOUNT_DRAFT,
    frequency: null,
    startDate: '',
    secondDay: '',
    endKind: 'never',
    endDate: '',
    endCount: '',
  };
  if (editing.kind === 'source') return blank;
  const { payload } = editing;
  const frequency = INCOME_FREQUENCIES.find(
    (kind) => kind === payload.schedule.kind,
  );
  return {
    ...blank,
    amount: toAmountDraft(payload.amount, payload.stanceOverride),
    frequency: frequency ?? null,
    startDate:
      payload.schedule.anchor === null
        ? ''
        : toDateInputValue(payload.schedule.anchor),
    secondDay:
      payload.schedule.kind === 'twiceMonthly'
        ? String(
            payload.schedule.monthDays.find(
              (day) =>
                day !== new Date(payload.schedule.anchor ?? 0).getUTCDate(),
            ) ?? '',
          )
        : '',
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
  };
};

function IncomeForm({
  isOpen,
  onClose,
  title,
  defaultFrequency,
  editing,
  openStep = null,
}: IncomeFormProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const resolved = useAppSelector((state) => selectResolvedPlan(state, today));
  const planStance = useAppSelector(selectStance);
  const [formData, setFormData] = useState<IncomeFormData>(() =>
    editing
      ? getEditingData(editing)
      : {
          source: { choice: '', newText: '' },
          payName: '',
          amount: EMPTY_AMOUNT_DRAFT,
          frequency: defaultFrequency,
          startDate: toDateInputValue(today),
          secondDay: '',
          endKind: 'never',
          endDate: '',
          endCount: '',
        },
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const set = (patch: Partial<IncomeFormData>) =>
    setFormData((current) => ({ ...current, ...patch }));

  const sourceNames = Object.fromEntries(
    resolved.map((source) => [source.item.id, source.version.payload.name]),
  );
  const sourceOptions = resolved.map((source) => ({
    value: source.item.id,
    label: source.version.payload.name,
  }));
  const sourceName = getSourceName(formData, sourceNames);
  const isEditing = editing !== undefined;
  const isEditingSource = editing?.kind === 'source';
  const blocker = isEditingSource
    ? formData.payName.trim() === ''
      ? 'Name the source.'
      : null
    : getBlocker(
        formData,
        sourceName,
        parseAmountDraft(formData.amount) !== null,
        isEditing,
      );
  const isOnce = formData.frequency === 'once';
  const startDate = fromDateInputValue(formData.startDate);
  const isScheduleAnswered =
    formData.frequency !== null && buildSchedule(formData) !== null;
  const scheduleText =
    formData.frequency === null || startDate === undefined
      ? ''
      : isOnce
        ? formatDateUTC(startDate)
        : `${SCHEDULE_LABELS[formData.frequency]} · next ${formatDateUTC(startDate)}`;
  const endingText =
    formData.endKind === 'never'
      ? INCOME_ENDING_LABELS.never
      : formData.endKind === 'date'
        ? formData.endDate === ''
          ? ''
          : `After ${formatDateUTC(fromDateInputValue(formData.endDate) ?? 0)}`
        : formData.endCount === ''
          ? ''
          : `After ${formData.endCount} payments`;

  const sourceNameStep: QuestionStep = {
    id: 'sourceName',
    title: FORM_FLOW_WORDS.sourceNameTitle,
    summaryLabel: FORM_FLOW_WORDS.name,
    summaryValue: formData.payName.trim(),
    isAnswered: formData.payName.trim() !== '',
    render: () => (
      <Input
        variant='outline'
        aria-label='Source name'
        placeholder='Employer or source'
        maxLength={MAX_NAME_LENGTH}
        value={formData.payName}
        onChange={(event) => set({ payName: event.target.value })}
      />
    ),
  };
  const payLineSteps: QuestionStep[] = [
    ...(isEditing
      ? []
      : [
          {
            id: 'source',
            title: FORM_FLOW_WORDS.sourceTitle,
            summaryLabel: FORM_FLOW_WORDS.source,
            summaryValue: sourceName,
            isAnswered: sourceName !== '',
            render: () => (
              <PickOrCreate
                label='Where it comes from'
                options={sourceOptions}
                choice={formData.source.choice}
                newText={formData.source.newText}
                newPillLabel='New source'
                newPlaceholder='Employer or source'
                maxLength={MAX_NAME_LENGTH}
                onChange={(choice, newText) =>
                  set({ source: { choice, newText } })
                }
              />
            ),
          },
        ]),
    {
      id: 'amount',
      title:
        defaultFrequency === 'once' && !isEditing
          ? FORM_FLOW_WORDS.expectedIncomeTitle
          : FORM_FLOW_WORDS.takeHomeTitle,
      summaryLabel: FORM_FLOW_WORDS.takeHome,
      summaryValue: describeAmountDraft(formData.amount),
      isAnswered: parseAmountDraft(formData.amount) !== null,
      render: () => (
        <RangeAmountField
          isHero
          label={FORM_FLOW_WORDS.takeHome}
          hint=''
          side='income'
          planStance={planStance}
          value={formData.amount}
          onChange={(amount) => set({ amount })}
        />
      ),
    },
    {
      id: 'schedule',
      title: FORM_FLOW_WORDS.scheduleTitle,
      summaryLabel: FORM_FLOW_WORDS.schedule,
      summaryValue: scheduleText,
      isAnswered: isScheduleAnswered,
      render: () => (
        <div className='space-y-4'>
          <PillGroup
            label='How often'
            options={frequencyOptions}
            value={formData.frequency}
            onChange={(frequency) => set({ frequency })}
          />
          {formData.frequency !== null && (
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs'>
                {isOnce ? 'Arrives' : 'Next payday'}
              </p>
              <Input
                type='date'
                variant='outline'
                aria-label={isOnce ? 'Arrives' : 'First payday'}
                value={formData.startDate}
                onChange={(event) => set({ startDate: event.target.value })}
              />
            </div>
          )}
          {formData.frequency === 'twiceMonthly' && (
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
                value={formData.secondDay}
                onChange={(event) => set({ secondDay: event.target.value })}
              />
            </div>
          )}
        </div>
      ),
    },
    ...(formData.frequency === null || isOnce
      ? []
      : [
          {
            id: 'ends',
            title: FORM_FLOW_WORDS.endsTitle,
            summaryLabel: FORM_FLOW_WORDS.ends,
            summaryValue: endingText,
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
                    aria-label='Last payday'
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
    {
      id: 'payName',
      title: FORM_FLOW_WORDS.payNameTitle,
      summaryLabel: FORM_FLOW_WORDS.payName,
      summaryValue: formData.payName.trim() || DEFAULT_PAY_LINE_NAME,
      isAnswered: true,
      isPreAnswered: true,
      render: () => (
        <Input
          variant='outline'
          aria-label='What this pay is called'
          placeholder={DEFAULT_PAY_LINE_NAME}
          maxLength={MAX_NAME_LENGTH}
          value={formData.payName}
          onChange={(event) => set({ payName: event.target.value })}
        />
      ),
    },
  ];
  const questions = useQuestionFlow({
    steps: isEditingSource ? [sourceNameStep] : payLineSteps,
    startFolded: isEditing,
    initialOpenId: isEditing ? openStep : null,
  });

  const buildPayLine = (data: IncomeFormData): PayLineSealed | null => {
    const schedule = buildSchedule(data);
    const ending = buildEnding(data);
    const amount = parseAmountDraft(data.amount);
    if (!editing || editing.kind !== 'payLine') return null;
    if (!schedule || !ending || amount === null) return null;
    const result: PayLineSealed = {
      ...editing.payload,
      name: data.payName.trim() || DEFAULT_PAY_LINE_NAME,
      schedule,
      amount,
      ending,
      stanceOverride: getStanceOverride(data.amount),
    };
    return result;
  };

  const candidate =
    blocker !== null || !editing
      ? null
      : editing.kind === 'source'
        ? { ...editing.payload, name: formData.payName.trim() }
        : buildPayLine(formData);
  const flow = useChangeFlow({
    itemId: editing?.itemId ?? '',
    kind: editing?.kind ?? 'payLine',
    current: editing?.payload ?? EMPTY_PAY_LINE,
    candidate,
    onDone: onClose,
  });
  const editBlocker = flow.getBlocker(blocker);
  const shownBlocker = editing ? editBlocker : blocker;

  const handleSubmit = async () => {
    const data = formData;
    const schedule = buildSchedule(data);
    const ending = buildEnding(data);
    const amount = parseAmountDraft(data.amount);
    const startDate = fromDateInputValue(data.startDate);
    if (
      !user ||
      !schedule ||
      !ending ||
      amount === null ||
      startDate === undefined
    )
      return;

    const existingSource =
      data.source.choice !== NEW_CHOICE && data.source.choice !== '';
    const input: CreateIncomeInput = {
      sourceId: existingSource ? data.source.choice : null,
      sourceName: getSourceName(data, sourceNames),
      payLineName: data.payName.trim() || DEFAULT_PAY_LINE_NAME,
      amount,
      stanceOverride: getStanceOverride(data.amount),
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

  const flowValue = {
    flow,
    itemId: editing?.itemId ?? '',
    kind: editing?.kind ?? 'payLine',
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

export default IncomeForm;

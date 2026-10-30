import { useMemo, useState } from 'react';

import { Button, Input, Select } from '@moondreamsdev/dreamer-ui/components';

import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import DraftRestoredNotice from '@/components/DraftRestoredNotice';
import FormSheet from '@/components/FormSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useFormDraft, useKeepFormDraft } from '@/hooks/useFormDraft';
import {
  useQuestionFlow,
  type QuestionControls,
  type QuestionStep,
} from '@/hooks/useQuestionFlow';
import { useAuth } from '@/hooks/useAuth';
import { clearFormDraft } from '@lib/app/formDrafts';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import {
  CHANGE_WORDS,
  DEFAULT_PAY_LINE_NAME,
  FORM_DRAFT_PREFIX,
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
import { LAST_DAY, toOrdinal } from '@apps/runway/utils/monthDays';
import {
  isAmountDraft,
  isNullableOneOf,
  isOneOf,
  isPickOrCreate,
  isText,
  readDraftFields,
  readKeptWithChange,
} from '@apps/runway/forms/draftParse';
import type { DraftSink } from '@apps/runway/forms/draftSink';
import {
  withStartOver,
  type StartOverProps,
} from '@apps/runway/forms/withStartOver';
import ChangeSteps from '@apps/runway/components/ChangeSteps';
import ChangeReason from '@apps/runway/components/ChangeReason';
import BackLink from '@/components/BackLink';
import QuickChange from '@apps/runway/components/QuickChange';
import ChangeSection from '@apps/runway/components/ChangeSection';
import { ChangeFlowContext } from '@apps/runway/forms/changeFlowContext';
import { useChangeFlow } from '@apps/runway/forms/useChangeFlow';
import { INITIAL_FROM_WHEN } from '@apps/runway/utils/fromWhen';
import RangeAmountField from '@apps/runway/forms/RangeAmountField';
import {
  describeAmountDraft,
  EMPTY_AMOUNT_DRAFT,
  getAmountDraftProblem,
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
import { maskSummaries } from '@apps/runway/utils/maskSummaries';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import DateInput from '@/components/DateInput';

type Frequency = (typeof INCOME_FREQUENCIES)[number];
type EndKind = (typeof INCOME_ENDINGS)[number];

interface IncomeFormData {
  source: { choice: string; newText: string };
  payName: string;
  amount: AmountDraft;
  frequency: Frequency | null;
  startDate: string;
  firstDay: string;
  secondDay: string;
  endKind: EndKind;
  endDate: string;
  endCount: string;
}

const parseIncomeDraftFields = (stored: unknown) =>
  readDraftFields<IncomeFormData>(stored, {
    source: isPickOrCreate,
    payName: isText,
    amount: isAmountDraft,
    frequency: isNullableOneOf(INCOME_FREQUENCIES),
    startDate: isText,
    firstDay: isText,
    secondDay: isText,
    endKind: isOneOf(INCOME_ENDINGS),
    endDate: isText,
    endCount: isText,
  });

const parseIncomeDraft = (stored: unknown) =>
  readKeptWithChange(stored, parseIncomeDraftFields);

interface IncomeFormProps {
  isOpen: boolean;
  onClose: () => void;
  /** Where Cancel and Discard go, when that is not where a save goes (back to the sheet the form came from). */
  onCancel?: () => void;
  title: string;
  /** What the sheet starts on; the income form leaves it open and an expected income starts on once. */
  defaultFrequency: Frequency | null;
  /** A pay line or source to change; its saved values start the form and a save adds a version from a date. */
  editing?: EditingIncome;
  /** A question to open first when changing a pay line ("amount"); every answer starts folded otherwise. */
  openStep?: IncomeStepId | null;
  /** Hands the built income over instead of writing it, for a person who has no plan yet. */
  draft?: DraftSink<CreateIncomeInput>;
}

export type IncomeStepId =
  | 'source'
  | 'amount'
  | 'often'
  | 'schedule'
  | 'ends'
  | 'payName'
  | 'sourceName';

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

/** A short month's end stands in for the 30th, as the schedule already clamps any day past a month's length. */
const DEFAULT_PAYDAYS = ['15', '30'] as const;

const dayOptions = Array.from({ length: LAST_DAY }, (_, index) => ({
  value: String(index + 1),
  text: toOrdinal(index + 1),
}));

/** The first day on or after `from` that falls on one of the days of the month, with the last day standing for a short month's end. */
const getNextPayday = (from: number, days: number[]) => {
  const start = new Date(from);
  const dates = [0, 1].flatMap((offset) =>
    days.map((day) => {
      const year = start.getUTCFullYear();
      const month = start.getUTCMonth() + offset;
      const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      return Date.UTC(year, month, Math.min(day, length));
    }),
  );
  return Math.min(...dates.filter((date) => date >= from));
};

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
    const first = parseDay(data.firstDay);
    if (first === null || second === null || second === first) return null;
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
    return 'Pick two different days of the month.';
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
    firstDay: '',
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
    firstDay:
      payload.schedule.kind === 'twiceMonthly'
        ? String(payload.schedule.monthDays[0] ?? '')
        : '',
    secondDay:
      payload.schedule.kind === 'twiceMonthly'
        ? String(payload.schedule.monthDays[1] ?? '')
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

const getDraftData = (input: CreateIncomeInput): IncomeFormData => {
  const { schedule } = input;
  const frequency = INCOME_FREQUENCIES.find((kind) => kind === schedule.kind);
  const ending = input.ending;
  return {
    source: { choice: NEW_CHOICE, newText: input.sourceName },
    payName:
      input.payLineName === DEFAULT_PAY_LINE_NAME ? '' : input.payLineName,
    amount: toAmountDraft(input.amount, input.stanceOverride),
    frequency: frequency ?? null,
    startDate:
      schedule.anchor === null ? '' : toDateInputValue(schedule.anchor),
    firstDay:
      schedule.kind === 'twiceMonthly'
        ? String(schedule.monthDays[0] ?? '')
        : '',
    secondDay:
      schedule.kind === 'twiceMonthly'
        ? String(schedule.monthDays[1] ?? '')
        : '',
    endKind:
      ending.onDate !== null
        ? 'date'
        : ending.afterCount !== null
          ? 'count'
          : 'never',
    endDate: ending.onDate === null ? '' : toDateInputValue(ending.onDate),
    endCount: ending.afterCount === null ? '' : String(ending.afterCount),
  };
};

function IncomeFormBody({
  onStartOver,
  isOpen,
  onClose,
  onCancel,
  title,
  defaultFrequency,
  editing,
  openStep = null,
  draft,
}: IncomeFormProps & StartOverProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const resolved = useAppSelector((state) => selectResolvedPlan(state, today));
  const planStance = useAppSelector(selectStance);
  const [startData] = useState<IncomeFormData>(() =>
    editing
      ? getEditingData(editing)
      : draft?.initial
        ? getDraftData(draft.initial)
        : {
            source: { choice: '', newText: '' },
            payName: '',
            amount: EMPTY_AMOUNT_DRAFT,
            frequency: defaultFrequency,
            startDate: toDateInputValue(today),
            firstDay: '',
            secondDay: '',
            endKind: 'never',
            endDate: '',
            endCount: '',
          },
  );
  const draftKey = draft
    ? null
    : `${FORM_DRAFT_PREFIX}income:${editing?.itemId ?? `new:${defaultFrequency ?? 'any'}`}`;
  // A new form's draft doesn't depend on the day or the door it was opened from; an edit's is tied to the record.
  const draftBase = editing ? startData : null;
  const kept = useFormDraft({
    key: draftKey,
    base: draftBase,
    parse: parseIncomeDraft,
  });
  const [formData, setFormData] = useState<IncomeFormData>(
    kept.restored?.formData ?? startData,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const set = (patch: Partial<IncomeFormData>) =>
    setFormData((current) => ({ ...current, ...patch }));

  const setPaydays = (patch: Partial<IncomeFormData>) =>
    setFormData((current) => {
      const next = { ...current, ...patch };
      const days = [parseDay(next.firstDay), parseDay(next.secondDay)];
      const [first, second] = days;
      return first === null || second === null || first === second
        ? next
        : {
            ...next,
            startDate: toDateInputValue(getNextPayday(today, [first, second])),
          };
    });

  const applyFrequency = (
    frequency: NonNullable<IncomeFormData['frequency']>,
  ) =>
    frequency === 'twiceMonthly' &&
    formData.firstDay === '' &&
    formData.secondDay === ''
      ? setPaydays({
          frequency,
          firstDay: DEFAULT_PAYDAYS[0],
          secondDay: DEFAULT_PAYDAYS[1],
        })
      : set({ frequency });

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
    formData.frequency === 'twiceMonthly' && isScheduleAnswered
      ? `Twice a month · ${toOrdinal(Number(formData.firstDay))} and ${toOrdinal(Number(formData.secondDay))}`
      : formData.frequency === null || startDate === undefined
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
            render: ({ moveOn }: QuestionControls) => (
              <PickOrCreate
                label='Where it comes from'
                options={sourceOptions}
                choice={formData.source.choice}
                newText={formData.source.newText}
                newPillLabel='New source'
                hasPlus={false}
                newPlaceholder='Employer or source'
                maxLength={MAX_NAME_LENGTH}
                onChange={(choice, newText) => {
                  set({ source: { choice, newText } });
                  if (choice !== '' && choice !== NEW_CHOICE) moveOn();
                }}
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
      blocker: getAmountDraftProblem(formData.amount),
      render: () => (
        <RangeAmountField
          isHero
          label={FORM_FLOW_WORDS.takeHome}
          hint={FORM_FLOW_WORDS.howOftenNext}
          side='income'
          planStance={planStance}
          value={formData.amount}
          onChange={(amount) => set({ amount })}
        />
      ),
    },
    {
      id: 'often',
      title: FORM_FLOW_WORDS.oftenTitle,
      summaryLabel: FORM_FLOW_WORDS.often,
      summaryValue:
        formData.frequency === null ? '' : SCHEDULE_LABELS[formData.frequency],
      isAnswered: formData.frequency !== null,
      render: ({ moveOn }: QuestionControls) => (
        <PillGroup
          label='How often'
          options={frequencyOptions}
          value={formData.frequency}
          onChange={(frequency) => {
            applyFrequency(frequency);
            moveOn();
          }}
        />
      ),
    },
    {
      id: 'schedule',
      title:
        formData.frequency === 'twiceMonthly'
          ? FORM_FLOW_WORDS.scheduleTwiceTitle
          : FORM_FLOW_WORDS.scheduleTitle,
      summaryLabel: FORM_FLOW_WORDS.schedule,
      summaryValue: scheduleText,
      isAnswered: isScheduleAnswered,
      blocker:
        formData.frequency === 'twiceMonthly'
          ? FORM_FLOW_WORDS.otherPayday
          : null,
      render: () => (
        <div className='space-y-4'>
          {formData.frequency !== null &&
            formData.frequency !== 'twiceMonthly' && (
              <div className='space-y-1.5'>
                <p className='text-muted-foreground text-xs'>
                  {isOnce ? 'Arrives' : 'Next payday'}
                </p>
                <DateInput
                  variant='outline'
                  aria-label={isOnce ? 'Arrives' : 'First payday'}
                  value={formData.startDate}
                  onChange={(event) => set({ startDate: event.target.value })}
                />
              </div>
            )}
          {formData.frequency === 'twiceMonthly' && (
            <div className='grid grid-cols-2 items-start gap-3'>
              {(['firstDay', 'secondDay'] as const).map((key) => (
                <div
                  key={key}
                  role='group'
                  aria-label={
                    key === 'firstDay' ? 'First payday' : 'Second payday'
                  }
                  className='space-y-1.5'
                >
                  <p className='text-muted-foreground text-xs'>
                    {key === 'firstDay' ? 'First' : 'Second'}
                  </p>
                  <Select
                    options={dayOptions}
                    value={formData[key]}
                    placeholder='Pick a day'
                    dropdownClassName='top-auto! bottom-full! mt-0! mb-1 max-h-48! [&_[data-scroll-area-viewport]]:max-h-48!'
                    onChange={(value) => setPaydays({ [key]: value })}
                  />
                </div>
              ))}
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
            blocker: FORM_FLOW_WORDS.finishEnding,
            isPreAnswered: true,
            render: ({ moveOn }: QuestionControls) => (
              <div className='space-y-3'>
                <PillGroup
                  label='Ends'
                  options={endingOptions}
                  value={formData.endKind}
                  onChange={(endKind) => {
                    set({ endKind });
                    if (buildEnding({ ...formData, endKind }) !== null)
                      moveOn();
                  }}
                />
                {formData.endKind === 'date' && (
                  <DateInput
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
  const [isAll, setIsAll] = useState(false);
  const { isHidden } = useValuesHidden();
  const mask = useMaskedText();
  const maskNote = (note: string | null | undefined) =>
    note ? mask(note) : null;
  const questions = useQuestionFlow({
    steps: maskSummaries(
      isEditingSource ? [sourceNameStep] : payLineSteps,
      isHidden,
    ),
    startFolded: isEditing || !!draft?.initial,
    foldAnswered: kept.restored !== null,
    initialOpenId: draft?.openStep ?? null,
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
    initialNote: kept.restored?.note,
    initialFrom: kept.restored?.from,
  });
  const editBlocker = flow.getBlocker(blocker);
  const isChangeDirty =
    flow.note.trim() !== '' ||
    JSON.stringify(flow.from) !== JSON.stringify(INITIAL_FROM_WHEN);
  const isDirty =
    JSON.stringify(formData) !== JSON.stringify(startData) || isChangeDirty;
  const keptValue = useMemo(
    () => ({ formData, note: flow.note, from: flow.from }),
    [formData, flow.note, flow.from],
  );
  useKeepFormDraft({
    isRestored: kept.restored !== null,
    key: draftKey,
    base: draftBase,
    value: keptValue,
    isDirty:
      JSON.stringify(formData) !== JSON.stringify(startData) || isChangeDirty,
  });
  const startOver = () => {
    if (user && draftKey) clearFormDraft(user.uid, draftKey);
    onStartOver();
  };
  const requestClose = useDiscardGuard({
    isDirty,
    onClose: onCancel ?? onClose,
    isBusy: isSaving || flow.isSaving,
    title: editing
      ? FORM_FLOW_WORDS.discardChange
      : FORM_FLOW_WORDS.discardNew('income'),
  });
  const quickStep =
    questions.steps.find((step) => step.id === openStep) ?? null;
  const isQuick = !!isEditing && openStep !== null && !isAll;
  const isAsking = !questions.hasReviewed;
  const shownBlocker = editing ? editBlocker : blocker;

  const handleSubmit = async () => {
    const data = formData;
    const schedule = buildSchedule(data);
    const ending = buildEnding(data);
    const amount = parseAmountDraft(data.amount);
    const startDate = fromDateInputValue(data.startDate);
    if (
      (!draft && !user) ||
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

    if (draft) {
      draft.onSave(input);
      onClose();
      return;
    }
    if (!user) return;
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
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={title}
      actions={<ValuesEyeButton />}
    >
      <ChangeSteps
        isReason={flow.step === 'reason'}
        reason={<ChangeReason flow={flow} onClose={requestClose} />}
      >
        <ChangeFlowContext value={flowValue}>
          <div className='space-y-5'>
            {kept.isNoticeShown && (
              <DraftRestoredNotice
                onStartOver={startOver}
                onDismiss={kept.hideNotice}
              />
            )}
            {isQuick && quickStep ? (
              <QuickChange step={quickStep} onAll={() => setIsAll(true)} />
            ) : (
              <>
                {openStep !== null && isEditing && (
                  <BackLink onBack={() => setIsAll(false)} />
                )}
                <QuestionFlow flow={questions} />
              </>
            )}
            {editing && !isEditingSource && questions.hasReviewed && (
              <ChangeSection />
            )}
            <ModalFooterActions
              note={
                error ?? maskNote(isAsking ? questions.blocker : shownBlocker)
              }
              cancelAction={
                <Button
                  type='button'
                  variant='secondary'
                  onClick={requestClose}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              }
              rightActions={
                isAsking ? (
                  <Button
                    type='button'
                    disabled={!questions.open?.isAnswered}
                    onClick={questions.advance}
                  >
                    {FORM_FLOW_WORDS.next}
                  </Button>
                ) : (
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
                    {editing
                      ? CHANGE_WORDS.review
                      : draft?.initial
                        ? 'Save'
                        : 'Add'}
                  </Button>
                )
              }
            />
          </div>
        </ChangeFlowContext>
      </ChangeSteps>
    </FormSheet>
  );
}

const IncomeForm = withStartOver(IncomeFormBody);

export default IncomeForm;

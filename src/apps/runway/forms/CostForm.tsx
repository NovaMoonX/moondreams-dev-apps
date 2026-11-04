import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import AmountField from '@/components/AmountField';
import DateInput from '@/components/DateInput';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import SuggestionChips from '@/components/SuggestionChips';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { generateUuid } from '@/utils/idUtils';
import {
  FORM_FLOW_WORDS,
  HORIZON_COST_SUGGESTIONS,
  HORIZON_WORDS,
  LOOKAHEAD_MONTHS,
  MAX_NAME_LENGTH,
} from '@apps/runway/constants';
import { addUtcMonths, todayAsUtcDate } from '@apps/runway/engine/dates';
import RepeatFields from '@apps/runway/forms/RepeatFields';
import type { HorizonCost } from '@apps/runway/types';
import { describeCostTiming } from '@apps/runway/utils/horizonText';
import { maskSummaries } from '@apps/runway/utils/maskSummaries';
import {
  buildEnding,
  buildSchedule,
  isRepeatAnswered,
  ONCE_REPEAT_DRAFT,
  toRepeatDraft,
  type RepeatDraft,
} from '@apps/runway/utils/repeatDraft';
import {
  describeAmountDraft,
  EMPTY_AMOUNT_DRAFT,
  getAmountDraftProblem,
  parseAmountDraft,
  toAmountDraft,
  type AmountDraft,
} from '@apps/runway/utils/rangeInput';

interface CostFormData {
  amount: AmountDraft;
  name: string;
  date: string;
  repeat: RepeatDraft;
  isOutside: boolean;
}

const MODE_OPTIONS = [
  {
    value: 'exact' as const,
    label: 'Exact',
    linkLabel: FORM_FLOW_WORDS.oneAmount,
  },
  {
    value: 'range' as const,
    label: 'A range',
    linkLabel: FORM_FLOW_WORDS.itVaries,
  },
];

/** The cost names Runway knows for an event, found by the simple words in the event's name. */
const getSuggestions = (itemName: string) => {
  const words = itemName.toLowerCase().split(/[^\p{L}]+/u);
  return (
    HORIZON_COST_SUGGESTIONS.find((group) =>
      group.words.some((word) => words.includes(word)),
    )?.suggestions ?? []
  );
};

interface CostFormProps {
  /** The event the cost belongs to, which decides the names offered. */
  itemName: string;
  /** The event's day: a new cost starts due then, while that day is still valid for a cost. */
  happensOn: number;
  /** The cost being changed; saving keeps its id. Absent when adding. */
  cost?: HorizonCost;
  onSave: (cost: HorizonCost) => void;
  /** Offered only when changing a cost. */
  onRemove?: () => void;
  onClose: () => void;
}

const toDraftData = (
  cost: HorizonCost | undefined,
  happensOn: number,
  today: number,
  lastDate: number,
): CostFormData => {
  if (cost) {
    return {
      amount: toAmountDraft(cost.amount, null),
      name: cost.name,
      date:
        cost.schedule.anchor === null
          ? ''
          : toDateInputValue(cost.schedule.anchor),
      repeat: toRepeatDraft(cost.schedule, cost.ending),
      isOutside: cost.isOutside,
    };
  }
  return {
    amount: EMPTY_AMOUNT_DRAFT,
    name: '',
    date:
      happensOn >= today && happensOn <= lastDate
        ? toDateInputValue(happensOn)
        : '',
    repeat: ONCE_REPEAT_DRAFT,
    isOutside: false,
  };
};

/** Add a cost, or change one: the amount first, what it is, then when it is due. */
function CostForm({
  itemName,
  happensOn,
  cost,
  onSave,
  onRemove,
  onClose,
}: CostFormProps) {
  const today = todayAsUtcDate();
  const lastDate = addUtcMonths(today, LOOKAHEAD_MONTHS);
  const [initialData] = useState(() =>
    toDraftData(cost, happensOn, today, lastDate),
  );
  const [formData, setFormData] = useState<CostFormData>(initialData);
  const set = (patch: Partial<CostFormData>) =>
    setFormData((current) => ({ ...current, ...patch }));

  const range = parseAmountDraft(formData.amount);
  const name = formData.name.trim();
  const date = fromDateInputValue(formData.date);
  const isDateValid = date !== undefined && date >= today && date <= lastDate;
  const schedule = isDateValid ? buildSchedule(formData.repeat, date) : null;
  const ending = buildEnding(formData.repeat, date);
  const isWhenAnswered =
    isDateValid && isRepeatAnswered(formData.repeat) && ending !== null;
  const whenBlocker = !isDateValid
    ? HORIZON_WORDS.needsCostDate
    : !isRepeatAnswered(formData.repeat)
      ? FORM_FLOW_WORDS.pickEvery(formData.repeat.everyUnit)
      : ending === null
        ? HORIZON_WORDS.needsCostEnding
        : null;
  const blocker =
    range === null
      ? FORM_FLOW_WORDS.badAmount
      : name === ''
        ? HORIZON_WORDS.needsCostName
        : whenBlocker;
  const suggestions = getSuggestions(itemName);

  const steps: QuestionStep[] = [
    {
      id: 'amount',
      title: HORIZON_WORDS.costAmountTitle,
      summaryLabel: HORIZON_WORDS.costAmount,
      summaryValue: describeAmountDraft(formData.amount),
      isAnswered: range !== null,
      blocker: getAmountDraftProblem(formData.amount),
      render: () => (
        <AmountField
          isHero
          autoFocus
          label={HORIZON_WORDS.costAmount}
          modes={MODE_OPTIONS}
          mode={formData.amount.mode}
          onModeChange={(mode) =>
            set({
              amount: {
                ...formData.amount,
                mode: mode === 'range' ? 'range' : 'exact',
              },
            })
          }
          value={formData.amount.low}
          onChange={(low) => set({ amount: { ...formData.amount, low } })}
          highValue={formData.amount.high}
          onHighChange={(high) => set({ amount: { ...formData.amount, high } })}
        />
      ),
    },
    {
      id: 'name',
      title: HORIZON_WORDS.costNameTitle,
      summaryLabel: HORIZON_WORDS.costName,
      summaryValue: name,
      isAnswered: name !== '',
      render: ({ moveOn }) => (
        <div className='space-y-4'>
          <Input
            variant='outline'
            aria-label={HORIZON_WORDS.costName}
            placeholder={HORIZON_WORDS.costNamePlaceholder}
            maxLength={MAX_NAME_LENGTH}
            value={formData.name}
            onChange={(event) => set({ name: event.target.value })}
          />
          {suggestions.length > 0 && (
            <SuggestionChips
              label={HORIZON_WORDS.costSuggestions}
              suggestions={suggestions}
              onPick={(suggestion) => {
                set({ name: suggestion });
                moveOn();
              }}
            />
          )}
        </div>
      ),
    },
    {
      id: 'date',
      title: HORIZON_WORDS.costWhenTitle,
      summaryLabel: HORIZON_WORDS.costWhen,
      summaryValue:
        schedule && ending
          ? describeCostTiming(schedule, ending, true)
          : isDateValid
            ? formatDateOrdinalUTC(date)
            : '',
      isAnswered: isWhenAnswered,
      blocker: formData.date === '' ? null : whenBlocker,
      render: () => (
        <div className='space-y-3'>
          <DateInput
            variant='outline'
            aria-label={HORIZON_WORDS.costWhen}
            min={toDateInputValue(today)}
            max={toDateInputValue(lastDate)}
            value={formData.date}
            onChange={(event) => set({ date: event.target.value })}
          />
          <p className='text-muted-foreground text-sm'>
            {HORIZON_WORDS.costDateHint}
          </p>
          <RepeatFields
            draft={formData.repeat}
            startDate={formData.date}
            onChange={(patch) =>
              set({ repeat: { ...formData.repeat, ...patch } })
            }
          />
        </div>
      ),
    },
    {
      id: 'paid',
      title: HORIZON_WORDS.costPaidTitle,
      summaryLabel: HORIZON_WORDS.costPaidLabel,
      summaryValue: formData.isOutside
        ? HORIZON_WORDS.costOutside
        : HORIZON_WORDS.costPaidLike(itemName),
      isAnswered: true,
      isPreAnswered: true,
      render: ({ moveOn }) => (
        <div className='space-y-2'>
          <PillGroup
            label={HORIZON_WORDS.costPaidLabel}
            options={[
              {
                value: 'like' as const,
                label: HORIZON_WORDS.costPaidLike(itemName),
              },
              { value: 'outside' as const, label: HORIZON_WORDS.costOutside },
            ]}
            value={formData.isOutside ? 'outside' : 'like'}
            onChange={(value) => {
              set({ isOutside: value === 'outside' });
              moveOn();
            }}
          />
          {formData.isOutside && (
            <p className='text-muted-foreground text-sm'>
              {HORIZON_WORDS.costOutsideHint}
            </p>
          )}
        </div>
      ),
    },
  ];
  const { isHidden } = useValuesHidden();
  const questions = useQuestionFlow({
    steps: maskSummaries(steps, isHidden),
    startFolded: cost !== undefined,
  });

  const requestClose = useDiscardGuard({
    isDirty: JSON.stringify(formData) !== JSON.stringify(initialData),
    onClose,
    title: cost
      ? FORM_FLOW_WORDS.discardChange
      : FORM_FLOW_WORDS.discardNew(HORIZON_WORDS.discardCostNoun),
  });

  const save = () => {
    if (range === null || !isDateValid || !schedule || !ending) return;
    onSave({
      id: cost?.id ?? generateUuid(),
      name,
      amount: range,
      schedule,
      ending,
      isOutside: formData.isOutside,
      note: cost?.note ?? null,
    });
  };

  return (
    <FormSheet
      isOpen
      onClose={requestClose}
      title={cost ? HORIZON_WORDS.costChangeTitle : HORIZON_WORDS.costFormTitle}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-5'>
        <QuestionFlow flow={questions} />
        <ModalFooterActions
          leftActions={
            onRemove && (
              <DeleteIconButton
                onClick={onRemove}
                label={HORIZON_WORDS.removeThisCost}
              />
            )
          }
          note={questions.hasReviewed ? blocker : questions.blocker}
          cancelAction={
            <Button type='button' variant='secondary' onClick={requestClose}>
              Cancel
            </Button>
          }
          rightActions={
            questions.hasReviewed ? (
              <Button type='button' disabled={blocker !== null} onClick={save}>
                {cost
                  ? HORIZON_WORDS.saveCost
                  : HORIZON_WORDS.addCostNamed(name)}
              </Button>
            ) : (
              <Button
                type='button'
                disabled={!questions.open?.isAnswered}
                onClick={questions.advance}
              >
                {FORM_FLOW_WORDS.next}
              </Button>
            )
          }
        />
      </div>
    </FormSheet>
  );
}

export default CostForm;

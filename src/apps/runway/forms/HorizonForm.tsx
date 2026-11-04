import { useState } from 'react';
import { Plus } from 'lucide-react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import DateInput from '@/components/DateInput';
import DeleteIconButton from '@/components/DeleteIconButton';
import EmojiField from '@/components/EmojiField';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import RevealChip from '@/components/RevealChip';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import {
  FORM_FLOW_WORDS,
  HORIZON_WORDS,
  LOOKAHEAD_MONTHS,
  MAX_EMOJI_LENGTH,
  MAX_HORIZON_COSTS,
  MAX_NAME_LENGTH,
  PRIORITIES,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import CostRow from '@apps/runway/components/CostRow';
import { addUtcMonths, todayAsUtcDate } from '@apps/runway/engine/dates';
import { getNextTierRank } from '@apps/runway/engine/priorities';
import CostForm from '@apps/runway/forms/CostForm';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { addHorizon } from '@apps/runway/store/actions/horizonActions';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectHorizonItems,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { HorizonCost, HorizonSealed, Priority } from '@apps/runway/types';
import { maskSummaries } from '@apps/runway/utils/maskSummaries';

interface HorizonFormData {
  name: string;
  /** Null until the person adds one. */
  emoji: string | null;
  date: string;
  isFewDays: boolean;
  endDate: string;
  costs: HorizonCost[];
  priority: Priority;
}

const INITIAL_DATA: HorizonFormData = {
  name: '',
  emoji: null,
  date: '',
  isFewDays: false,
  endDate: '',
  costs: [],
  priority: 'should',
};

const priorityOptions = PRIORITIES.map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));

interface HorizonFormProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
}

/** Add to your horizon: an event, when it happens and what it will cost. */
function HorizonForm({ isOpen, onClose, title }: HorizonFormProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const lastDate = addUtcMonths(today, LOOKAHEAD_MONTHS);
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const horizons = useAppSelector((state) => selectHorizonItems(state, today));
  const { isHidden } = useValuesHidden();
  const [formData, setFormData] = useState<HorizonFormData>(INITIAL_DATA);
  const [isAddingCost, setIsAddingCost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const set = (patch: Partial<HorizonFormData>) =>
    setFormData((current) => ({ ...current, ...patch }));

  const name = formData.name.trim();
  const date = fromDateInputValue(formData.date);
  const endDate = fromDateInputValue(formData.endDate);
  const isDateValid = date !== undefined && date >= today && date <= lastDate;
  const isEndValid =
    !formData.isFewDays ||
    (endDate !== undefined && date !== undefined && endDate > date);
  const getDateBlocker = () => {
    if (formData.date !== '' && !isDateValid) return FORM_FLOW_WORDS.pastDay;
    if (formData.isFewDays && formData.endDate !== '' && !isEndValid)
      return HORIZON_WORDS.endBeforeStart;
    return null;
  };
  const dateBlocker = getDateBlocker();
  const blocker =
    name === ''
      ? HORIZON_WORDS.needsName
      : !isDateValid || !isEndValid
        ? (dateBlocker ?? FORM_FLOW_WORDS.pastDay)
        : formData.costs.length === 0
          ? HORIZON_WORDS.needsCost
          : null;

  const steps: QuestionStep[] = [
    {
      id: 'name',
      title: HORIZON_WORDS.nameTitle,
      summaryLabel: HORIZON_WORDS.name,
      summaryValue: `${formData.emoji?.trim() ?? ''} ${name}`.trim(),
      isAnswered: name !== '',
      render: () => (
        <div className='space-y-4'>
          <Input
            variant='outline'
            aria-label={HORIZON_WORDS.name}
            placeholder={HORIZON_WORDS.namePlaceholder}
            maxLength={MAX_NAME_LENGTH}
            value={formData.name}
            onChange={(event) => set({ name: event.target.value })}
          />
          {formData.emoji === null ? (
            <div>
              <RevealChip
                icon={<Plus className='h-4 w-4' aria-hidden='true' />}
                onClick={() => set({ emoji: '' })}
              >
                {HORIZON_WORDS.addEmoji}
              </RevealChip>
            </div>
          ) : (
            <EmojiField
              value={formData.emoji}
              onChange={(emoji) => set({ emoji })}
              ariaLabel={FORM_FLOW_WORDS.emoji}
              placeholder='📦'
              maxLength={MAX_EMOJI_LENGTH}
            />
          )}
        </div>
      ),
    },
    {
      id: 'when',
      title: HORIZON_WORDS.whenTitle,
      summaryLabel: HORIZON_WORDS.when,
      summaryValue:
        !isDateValid || !isEndValid
          ? ''
          : formData.isFewDays && endDate !== undefined
            ? HORIZON_WORDS.aroundRange(
                formatDateOrdinalUTC(date),
                formatDateOrdinalUTC(endDate),
              )
            : HORIZON_WORDS.around(formatDateOrdinalUTC(date)),
      isAnswered: isDateValid && isEndValid,
      blocker: dateBlocker,
      render: () => (
        <div className='space-y-3'>
          <DateInput
            variant='outline'
            aria-label={HORIZON_WORDS.when}
            min={toDateInputValue(today)}
            max={toDateInputValue(lastDate)}
            value={formData.date}
            onChange={(event) => set({ date: event.target.value })}
          />
          {formData.isFewDays ? (
            <>
              <DateInput
                variant='outline'
                aria-label={HORIZON_WORDS.endLabel}
                min={formData.date}
                max={toDateInputValue(lastDate)}
                value={formData.endDate}
                onChange={(event) => set({ endDate: event.target.value })}
              />
              <div>
                <RevealChip
                  onClick={() => set({ isFewDays: false, endDate: '' })}
                >
                  {HORIZON_WORDS.oneDay}
                </RevealChip>
              </div>
            </>
          ) : (
            <div>
              <RevealChip onClick={() => set({ isFewDays: true })}>
                {HORIZON_WORDS.fewDays}
              </RevealChip>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'costs',
      title: HORIZON_WORDS.costsTitle,
      summaryLabel: HORIZON_WORDS.costs,
      summaryValue:
        formData.costs.length === 0
          ? ''
          : HORIZON_WORDS.plannedFact(formData.costs.length),
      isAnswered: formData.costs.length > 0,
      render: () => (
        <div className='space-y-3'>
          {formData.costs.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {HORIZON_WORDS.noCosts}
            </p>
          ) : (
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {formData.costs.map((cost) => (
                <CostRow
                  key={cost.id}
                  cost={cost}
                  action={
                    <DeleteIconButton
                      label={HORIZON_WORDS.removeCost(cost.name)}
                      onClick={() =>
                        set({
                          costs: formData.costs.filter(
                            ({ id }) => id !== cost.id,
                          ),
                        })
                      }
                    />
                  }
                />
              ))}
            </ul>
          )}
          <Button
            type='button'
            variant='secondary'
            disabled={formData.costs.length >= MAX_HORIZON_COSTS}
            onClick={() => setIsAddingCost(true)}
          >
            <Plus className='h-4 w-4' aria-hidden='true' />
            {HORIZON_WORDS.addCost}
          </Button>
          {formData.costs.length >= MAX_HORIZON_COSTS && (
            <p className='text-muted-foreground text-sm'>
              {HORIZON_WORDS.maxCosts(MAX_HORIZON_COSTS)}
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'priority',
      title: FORM_FLOW_WORDS.priorityTitle,
      summaryLabel: HORIZON_WORDS.priority,
      summaryValue: PRIORITY_LABELS[formData.priority],
      isAnswered: true,
      isPreAnswered: true,
      render: ({ moveOn }) => (
        <PillGroup
          label={FORM_FLOW_WORDS.priority}
          options={priorityOptions}
          value={formData.priority}
          onChange={(priority) => {
            set({ priority });
            moveOn();
          }}
        />
      ),
    },
  ];
  const questions = useQuestionFlow({ steps: maskSummaries(steps, isHidden) });

  const requestClose = useDiscardGuard({
    isDirty: JSON.stringify(formData) !== JSON.stringify(INITIAL_DATA),
    onClose,
    isBusy: isSaving,
    title: FORM_FLOW_WORDS.discardNew(HORIZON_WORDS.discardNoun),
  });

  const handleSubmit = async () => {
    if (!user || blocker !== null || date === undefined) return;
    const horizon: HorizonSealed = {
      name,
      emoji: formData.emoji?.trim() || null,
      happensOn: date,
      happensUntil:
        formData.isFewDays && endDate !== undefined ? endDate : null,
      priority: formData.priority,
      orderIndex: getNextTierRank(
        [...bills, ...envelopes, ...goals, ...horizons],
        formData.priority,
      ),
      note: null,
      costs: formData.costs,
    };
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await addHorizon(user.uid, encryption, { horizon, startDate: today });
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError, HORIZON_WORDS.addFailed));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={title}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-5'>
        <QuestionFlow flow={questions} />
        <ModalFooterActions
          note={error ?? (questions.hasReviewed ? blocker : questions.blocker)}
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
            questions.hasReviewed ? (
              <Button
                type='button'
                loading={isSaving}
                disabled={isSaving || blocker !== null}
                onClick={() => void handleSubmit()}
              >
                {HORIZON_WORDS.add(name)}
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
      {isAddingCost && (
        <CostForm
          itemName={name}
          onAdd={(cost) => {
            set({ costs: [...formData.costs, cost] });
            setIsAddingCost(false);
          }}
          onClose={() => setIsAddingCost(false)}
        />
      )}
    </FormSheet>
  );
}

export default HorizonForm;

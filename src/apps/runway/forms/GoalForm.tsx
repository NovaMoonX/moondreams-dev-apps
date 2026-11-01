import { useMemo, useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import AmountField from '@/components/AmountField';
import DraftRestoredNotice from '@/components/DraftRestoredNotice';
import FormSheet from '@/components/FormSheet';
import SuggestionChips from '@/components/SuggestionChips';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import RevealChip from '@/components/RevealChip';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useFormDraft, useKeepFormDraft } from '@/hooks/useFormDraft';
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
import { useAuth } from '@/hooks/useAuth';
import { clearFormDraft } from '@lib/app/formDrafts';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import {
  CHANGE_WORDS,
  FORM_DRAFT_PREFIX,
  FORM_FLOW_WORDS,
  CALENDAR_PERIOD_UNITS,
  HOW_OFTEN_WORDS,
  LOOKAHEAD_MONTHS,
  MAX_EMOJI_LENGTH,
  GOAL_QUICK_PICKS,
  MAX_NAME_LENGTH,
  PRIORITIES,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import { addUtcMonths, todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { createGoal } from '@apps/runway/store/actions/itemActions';
import {
  fundingFieldChecks,
  isNullableOneOf,
  isNullableText,
  isText,
  readDraftFields,
  readKeptWithChange,
} from '@apps/runway/forms/draftParse';
import type { DraftSink } from '@apps/runway/forms/draftSink';
import {
  withStartOver,
  type StartOverProps,
} from '@apps/runway/forms/withStartOver';
import EmojiField from '@/components/EmojiField';
import { recordHolding } from '@apps/runway/store/actions/moveActions';
import { getPeriodIndex } from '@apps/runway/engine/calendar';
import { getNextTierRank } from '@apps/runway/engine/priorities';
import ChangeSteps from '@apps/runway/components/ChangeSteps';
import ChangeReason from '@apps/runway/components/ChangeReason';
import BackLink from '@/components/BackLink';
import QuickChange from '@apps/runway/components/QuickChange';
import ChangeSection from '@apps/runway/components/ChangeSection';
import { ChangeFlowContext } from '@apps/runway/forms/changeFlowContext';
import { useChangeFlow } from '@apps/runway/forms/useChangeFlow';
import { INITIAL_FROM_WHEN } from '@apps/runway/utils/fromWhen';
import {
  buildFundingRule,
  buildFundingSteps,
  getFundingBlocker,
  INITIAL_FUNDING_FORM,
  toFundingForm,
  type FundingFormData,
} from '@apps/runway/forms/fundingFlow';
import {
  selectComingDays,
  selectEnvelopes,
  selectBills,
  selectGoals,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { GoalSealed, Priority } from '@apps/runway/types';
import { maskSummaries } from '@apps/runway/utils/maskSummaries';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import DateInput from '@/components/DateInput';

interface GoalFormData extends FundingFormData {
  name: string;
  priority: Priority | null;
  target: string;
  /** Null until the person adds a date. */
  date: string | null;
  /** What is in it now, as typed; empty is $0. */
  current: string;
  /** Null until the person adds one. */
  emoji: string | null;
}

const parseGoalDraftFields = (stored: unknown) =>
  readDraftFields<GoalFormData>(stored, {
    ...fundingFieldChecks,
    name: isText,
    priority: isNullableOneOf(PRIORITIES),
    target: isText,
    date: isNullableText,
    current: isText,
    emoji: isNullableText,
  });

const parseGoalDraft = (stored: unknown) =>
  readKeptWithChange(stored, parseGoalDraftFields);

interface GoalFormProps {
  isOpen: boolean;
  onClose: () => void;
  /** Where Cancel and Discard go, when that is not where a save goes (back to the sheet the form came from). */
  onCancel?: () => void;
  title: string;
  /** The goal to change; its saved values start the form and a save adds a version from a date. */
  editing?: { itemId: string; payload: GoalSealed };
  /** The income day whose screen opened the edit; "this income day" then means it. */
  presetDayKey?: string;
  /** A question to open first when changing a goal ("target", "amount"); every answer starts folded otherwise. */
  openStep?: GoalStepId | null;
  /** Hands the built goal over instead of writing it, for a person who has no plan yet. */
  draft?: DraftSink<GoalSealed>;
}

export type GoalStepId =
  | 'name'
  | 'target'
  | 'current'
  | 'byWhen'
  | 'often'
  | 'amount'
  | 'cadence'
  | 'priority'
  | 'emoji';

const priorityOptions = PRIORITIES.map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));

const EMPTY_GOAL: GoalSealed = {
  name: '',
  emoji: null,
  priority: 'should',
  orderIndex: 0,
  targetCents: 0,
  targetDate: null,
  funding: {
    amount: { kind: 'exact', cents: 0 },
    cadence: { kind: 'everyIncomeDay' },
  },
  state: 'active',
};

const getEditingData = (payload: GoalSealed): GoalFormData => ({
  ...toFundingForm(payload.funding),
  name: payload.name,
  priority: payload.priority,
  target: centsToInputValue(payload.targetCents),
  date:
    payload.targetDate === null ? null : toDateInputValue(payload.targetDate),
  current: '',
  emoji: payload.emoji,
});

const INITIAL_DATA: GoalFormData = {
  ...INITIAL_FUNDING_FORM,
  name: '',
  priority: 'should',
  target: '',
  date: null,
  current: '',
  emoji: null,
};

const getBlocker = (
  data: GoalFormData,
  targetCents: number | null,
  hasDays: boolean,
  today: number,
) => {
  const lastDate = addUtcMonths(today, LOOKAHEAD_MONTHS);
  if (data.name.trim() === '') return 'Name the goal.';
  if (data.priority === null) return 'Pick how much it matters.';
  if (targetCents === null || targetCents <= 0)
    return 'Enter how much you are saving toward.';
  if (data.current.trim() !== '' && parseMoneyToCents(data.current) === null)
    return FORM_FLOW_WORDS.badAmount;
  if (data.date !== null) {
    const date = fromDateInputValue(data.date);
    if (date === undefined || date < today)
      return 'Pick a date that has not passed, or remove it.';
    if (date > lastDate)
      return `Pick a date within the next ${LOOKAHEAD_MONTHS} months, which is as far as the income days are planned, or remove it.`;
  }
  return getFundingBlocker(data, hasDays);
};

function GoalFormBody({
  onStartOver,
  isOpen,
  onClose,
  onCancel,
  title,
  editing,
  presetDayKey,
  openStep = null,
  draft,
}: GoalFormProps & StartOverProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const plan = useAppSelector((state) => state.runway.plan);
  const [startData] = useState<GoalFormData>(() =>
    editing
      ? getEditingData(editing.payload)
      : draft?.initial
        ? {
            ...getEditingData(draft.initial),
            current:
              draft.initial.startingCents === undefined
                ? ''
                : centsToInputValue(draft.initial.startingCents),
          }
        : INITIAL_DATA,
  );
  const draftKey = draft
    ? null
    : `${FORM_DRAFT_PREFIX}goal:${editing?.itemId ?? 'new'}`;
  // A new form's draft doesn't depend on the day or the door it was opened from; an edit's is tied to the record.
  const draftBase = editing ? startData : null;
  const kept = useFormDraft({
    key: draftKey,
    base: draftBase,
    parse: parseGoalDraft,
  });
  const [formData, setFormData] = useState<GoalFormData>(
    kept.restored?.formData ?? startData,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const set = (patch: Partial<GoalFormData>) =>
    setFormData((current) => ({ ...current, ...patch }));

  const targetCents = parseMoneyToCents(formData.target);
  const hasDays = comingDays.length > 0 || !!draft;
  const blocker = getBlocker(formData, targetCents, hasDays, today);
  const currentCents = parseMoneyToCents(formData.current) ?? 0;

  const lastDate = addUtcMonths(today, LOOKAHEAD_MONTHS);
  const date =
    formData.date === null ? null : (fromDateInputValue(formData.date) ?? null);
  const isDateAnswered =
    formData.date === null ||
    (date !== null && date >= today && date <= lastDate);
  const leftCents = Math.max(0, (targetCents ?? 0) - currentCents);
  const getSuggestion = (data: FundingFormData) => {
    if (date === null || leftCents === 0) return null;
    if (data.often === 'none') return null;
    if (data.often === 'paycheck') {
      const count = comingDays.filter(
        (day) => day.on >= today && day.on <= date,
      ).length;
      return data.mode === 'exact' && count > 0
        ? {
            cents: Math.ceil(leftCents / count),
            text: FORM_FLOW_WORDS.suggestion,
          }
        : null;
    }
    const count =
      getPeriodIndex(data.often, date) - getPeriodIndex(data.often, today) + 1;
    return {
      cents: Math.ceil(leftCents / count),
      text: (amount: string, by: string) =>
        `${amount} ${CALENDAR_PERIOD_UNITS[data.often as keyof typeof CALENDAR_PERIOD_UNITS]} reaches it by ${by}.`,
    };
  };
  const getAmountHint = (data: FundingFormData) => {
    const suggestion = getSuggestion(data);
    return suggestion === null || date === null
      ? null
      : suggestion.text(formatCents(suggestion.cents), formatDateUTC(date));
  };
  const fundingSteps = buildFundingSteps({
    data: formData,
    set,
    comingDays,
    allowNone: true,
    isDraft: !!draft,
    draftSources: draft?.sources,
    getAmountTitle: (unit) => `How much goes in ${unit}?`,
    getAmountHint,
  });

  const steps: QuestionStep[] = [
    {
      id: 'name',
      title: FORM_FLOW_WORDS.nameTitle,
      summaryLabel: FORM_FLOW_WORDS.name,
      summaryValue: formData.name.trim(),
      isAnswered: formData.name.trim() !== '',
      render: () => (
        <div className='space-y-4'>
          <Input
            variant='outline'
            aria-label={FORM_FLOW_WORDS.name}
            placeholder='Vacation fund'
            maxLength={MAX_NAME_LENGTH}
            value={formData.name}
            onChange={(event) => set({ name: event.target.value })}
          />
          <SuggestionChips
            label={FORM_FLOW_WORDS.commonGoals}
            suggestions={GOAL_QUICK_PICKS.map(
              (pick) => `${pick.emoji} ${pick.name}`,
            )}
            onPick={(label) => {
              const found = GOAL_QUICK_PICKS.find(
                (pick) => `${pick.emoji} ${pick.name}` === label,
              );
              if (found) set({ name: found.name, emoji: found.emoji });
            }}
          />
        </div>
      ),
    },
    {
      id: 'target',
      title: FORM_FLOW_WORDS.targetTitle,
      summaryLabel: FORM_FLOW_WORDS.target,
      summaryValue:
        targetCents !== null && targetCents > 0 ? formatCents(targetCents) : '',
      isAnswered: targetCents !== null && targetCents > 0,
      blocker: formData.target.trim() === '' ? null : FORM_FLOW_WORDS.badAmount,
      render: () => (
        <AmountField
          isHero
          label={FORM_FLOW_WORDS.target}
          value={formData.target}
          onChange={(target) => set({ target })}
        />
      ),
    },
    ...(editing
      ? []
      : [
          {
            id: 'current',
            title: HOW_OFTEN_WORDS.currentTitle,
            summaryLabel: HOW_OFTEN_WORDS.current,
            summaryValue: formatCents(currentCents),
            isAnswered:
              formData.current.trim() === '' ||
              parseMoneyToCents(formData.current) !== null,
            blocker: FORM_FLOW_WORDS.badAmount,
            render: () => (
              <AmountField
                isHero
                label={HOW_OFTEN_WORDS.current}
                value={formData.current}
                onChange={(current) => set({ current })}
                hint={HOW_OFTEN_WORDS.currentHint}
              />
            ),
          } satisfies QuestionStep,
        ]),
    {
      id: 'byWhen',
      title: FORM_FLOW_WORDS.byWhenTitle,
      summaryLabel: FORM_FLOW_WORDS.byWhen,
      summaryValue:
        formData.date === null
          ? FORM_FLOW_WORDS.noDate
          : date === null
            ? ''
            : formatDateUTC(date),
      isAnswered: isDateAnswered,
      blocker:
        date !== null && date > lastDate
          ? `Pick a date within the next ${LOOKAHEAD_MONTHS} months, which is as far as the income days are planned, or remove it.`
          : date !== null && date < today
            ? FORM_FLOW_WORDS.pastDay
            : null,
      render: () => (
        <div className='space-y-3'>
          <DateInput
            variant='outline'
            aria-label={FORM_FLOW_WORDS.byWhen}
            min={toDateInputValue(today)}
            max={toDateInputValue(lastDate)}
            value={formData.date ?? ''}
            onChange={(event) => set({ date: event.target.value })}
          />
          {formData.date === null ? (
            <p className='text-muted-foreground text-sm'>
              {FORM_FLOW_WORDS.noDateHint}
            </p>
          ) : (
            <div>
              <RevealChip onClick={() => set({ date: null })}>
                {FORM_FLOW_WORDS.noDate}
              </RevealChip>
            </div>
          )}
        </div>
      ),
    },
    ...fundingSteps,
    {
      id: 'priority',
      title: FORM_FLOW_WORDS.priorityTitle,
      summaryLabel: FORM_FLOW_WORDS.priority,
      summaryValue:
        formData.priority === null ? '' : PRIORITY_LABELS[formData.priority],
      isAnswered: formData.priority !== null,
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
    {
      id: 'emoji',
      title: FORM_FLOW_WORDS.emojiTitle,
      summaryLabel: FORM_FLOW_WORDS.emoji,
      summaryValue: formData.emoji?.trim() || FORM_FLOW_WORDS.noEmoji,
      isAnswered: true,
      isPreAnswered: true,
      render: () => (
        <EmojiField
          value={formData.emoji ?? ''}
          onChange={(emoji) => set({ emoji })}
          ariaLabel={FORM_FLOW_WORDS.emoji}
          placeholder='🏖️'
          maxLength={MAX_EMOJI_LENGTH}
        />
      ),
    },
  ];
  const { addToast } = useToast();
  const [isAll, setIsAll] = useState(false);
  const { isHidden } = useValuesHidden();
  const mask = useMaskedText();
  const maskNote = (note: string | null | undefined) =>
    note ? mask(note) : null;
  const questions = useQuestionFlow({
    steps: maskSummaries(steps, isHidden),
    startFolded: editing !== undefined || !!draft?.initial,
    foldAnswered: kept.restored !== null,
    initialOpenId: draft?.openStep ?? null,
    onAdvance: (fromId) => {
      const suggestion = getSuggestion(formData);
      if (
        fromId === 'byWhen' &&
        formData.amount === '' &&
        formData.often !== 'none' &&
        suggestion !== null
      )
        set({ amount: centsToInputValue(suggestion.cents) });
    },
  });

  const buildGoal = (data: GoalFormData): GoalSealed | null => {
    const funding = buildFundingRule(data, {
      comingDays,
      saved: editing?.payload.funding,
      today,
    });
    const target = parseMoneyToCents(data.target);
    if (data.priority === null || funding === null || target === null)
      return null;

    const orderIndex =
      editing && editing.payload.priority === data.priority
        ? editing.payload.orderIndex
        : getNextTierRank([...bills, ...envelopes, ...goals], data.priority);
    const result: GoalSealed = {
      name: data.name.trim(),
      emoji: data.emoji?.trim() || null,
      priority: data.priority,
      orderIndex,
      targetCents: target,
      targetDate:
        data.date === null ? null : (fromDateInputValue(data.date) ?? null),
      funding,
      ...(editing
        ? editing.payload.startingCents === undefined
          ? {}
          : { startingCents: editing.payload.startingCents }
        : plan?.startDate != null || currentCents === 0
          ? {}
          : { startingCents: currentCents }),
      state: editing?.payload.state ?? 'active',
    };
    return result;
  };

  const candidate = blocker === null ? buildGoal(formData) : null;
  const flow = useChangeFlow({
    itemId: editing?.itemId ?? '',
    kind: 'goal',
    current: editing
      ? { ...editing.payload, state: editing.payload.state ?? 'active' }
      : EMPTY_GOAL,
    candidate,
    presetDayKey,
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
      : FORM_FLOW_WORDS.discardNew('goal'),
  });
  const quickStep = steps.find((step) => step.id === openStep) ?? null;
  const isQuick = !!editing && openStep !== null && !isAll;
  const isAsking = !questions.hasReviewed;
  const changeSection =
    editing && questions.hasReviewed ? <ChangeSection /> : null;
  const shownBlocker = editing ? editBlocker : blocker;

  const handleSubmit = async () => {
    const goal = buildGoal(formData);
    if (!goal) return;
    if (draft) {
      draft.onSave(goal);
      onClose();
      return;
    }
    if (!user) return;

    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const { goalId } = await createGoal(user.uid, encryption, {
        startDate: today,
        goal,
      });
      if (plan?.startDate != null && currentCents > 0) {
        const isRecorded = await recordHolding(
          user.uid,
          encryption,
          plan.startDate,
          {
            holding: 'goal',
            refId: goalId,
            amountCents: currentCents,
          },
        ).catch((holdingError) => {
          console.error(holdingError);
          return false;
        });
        if (!isRecorded)
          addToast({
            title: HOW_OFTEN_WORDS.holdingNotRecorded(goal.name),
            type: 'warning',
          });
      }
      onClose();
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          'This goal did not save. Nothing was changed.',
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const flowValue = {
    flow,
    itemId: editing?.itemId ?? '',
    kind: 'goal' as const,
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
              <QuickChange
                step={quickStep}
                flow={questions}
                rowIds={['name', 'often', 'byWhen']}
                after={changeSection}
                onAll={() => setIsAll(true)}
              />
            ) : (
              <>
                {openStep !== null && editing && (
                  <BackLink onBack={() => setIsAll(false)} />
                )}
                <QuestionFlow flow={questions} />
              </>
            )}
            {!(isQuick && quickStep) && changeSection}
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
                        if (flow.isMoneyless) void flow.save(null);
                        else flow.setStep('reason');
                        return;
                      }
                      void handleSubmit();
                    }}
                  >
                    {editing
                      ? flow.isMoneyless
                        ? 'Save'
                        : CHANGE_WORDS.review
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

const GoalForm = withStartOver(GoalFormBody);

export default GoalForm;

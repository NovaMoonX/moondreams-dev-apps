import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import AmountField, { type AmountMode } from '@/components/AmountField';
import { AmountHeroLink } from '@/components/AmountHero';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { parseMoneyToCents, parsePercentToBps } from '@/utils/moneyUtils';
import {
  CHANGE_WORDS,
  ENVELOPE_ORDER_STEP,
  FORM_FLOW_WORDS,
  FUNDING_CADENCE_LABELS,
  FUNDING_CADENCES,
  MAX_CHOSEN_DAYS,
  MAX_EMOJI_LENGTH,
  MAX_NAME_LENGTH,
  PRIORITIES,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { createEnvelope } from '@apps/runway/store/actions/itemActions';
import ChangeSteps from '@apps/runway/components/ChangeSteps';
import ChangeReason from '@apps/runway/components/ChangeReason';
import ChangeSection from '@apps/runway/components/ChangeSection';
import { ChangeFlowContext } from '@apps/runway/forms/changeFlowContext';
import { useChangeFlow } from '@apps/runway/forms/useChangeFlow';
import { INITIAL_FROM_WHEN } from '@apps/runway/utils/fromWhen';
import { toFundingInput } from '@apps/runway/utils/fundingInput';
import { describeAmount } from '@apps/runway/utils/fundingText';
import {
  selectComingDays,
  selectEnvelopes,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  FundingAmount,
  FundingRule,
  EnvelopeSealed,
  Priority,
} from '@apps/runway/types';

type Cadence = (typeof FUNDING_CADENCES)[number];

interface EnvelopeFormData {
  name: string;
  priority: Priority | null;
  amount: string;
  cadence: Cadence;
  dayKeys: string[];
  /** Null until the person adds one. */
  emoji: string | null;
}

interface EnvelopeFormProps {
  isOpen: boolean;
  onClose: () => void;
  /** Where Cancel and Discard go, when that is not where a save goes (back to the sheet the form came from). */
  onCancel?: () => void;
  title: string;
  /** The envelope to change; its saved values start the form and a save adds a version from a date. */
  editing?: { itemId: string; payload: EnvelopeSealed };
  /** The income day whose screen opened the edit; "this income day" then means it. */
  presetDayKey?: string;
  /** A question to open first when changing an envelope ("amount"); every answer starts folded otherwise. */
  openStep?: EnvelopeStepId | null;
}

export type EnvelopeStepId =
  'name' | 'amount' | 'cadence' | 'priority' | 'emoji';

const AMOUNT_MODES = [
  {
    value: 'exact',
    label: 'Exact amount',
    linkLabel: FORM_FLOW_WORDS.exactLink,
  },
  {
    value: 'percent',
    label: "% of the day's money",
    linkLabel: FORM_FLOW_WORDS.percentLink,
  },
  { value: 'rest', label: 'The rest', linkLabel: FORM_FLOW_WORDS.restLink },
] as const;

const getFundingAmount = (
  mode: AmountMode,
  text: string,
): FundingAmount | null => {
  if (mode === 'rest') return { kind: 'rest' };
  if (mode === 'percent') {
    const bps = parsePercentToBps(text);
    return bps === null ? null : { kind: 'percent', bps, of: 'dayMoney' };
  }
  const cents = parseMoneyToCents(text);
  return cents === null || cents <= 0 ? null : { kind: 'exact', cents };
};

const priorityOptions = PRIORITIES.map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));
const cadenceOptions = FUNDING_CADENCES.map((value) => ({
  value,
  label: FUNDING_CADENCE_LABELS[value],
}));

const EMPTY_ENVELOPE: EnvelopeSealed = {
  name: '',
  emoji: null,
  priority: 'should',
  orderIndex: 0,
  funding: {
    amount: { kind: 'exact', cents: 0 },
    cadence: { kind: 'everyIncomeDay' },
  },
};

const getEditingData = (payload: EnvelopeSealed): EnvelopeFormData => {
  const { amount, cadence, dayKeys } = toFundingInput(payload.funding);
  return {
    name: payload.name,
    priority: payload.priority,
    amount,
    cadence,
    dayKeys,
    emoji: payload.emoji,
  };
};

const INITIAL_DATA: EnvelopeFormData = {
  name: '',
  priority: 'should',
  amount: '',
  cadence: 'everyIncomeDay',
  dayKeys: [],
  emoji: null,
};

const getBlocker = (
  data: EnvelopeFormData,
  amount: FundingAmount | null,
  mode: AmountMode,
  hasDays: boolean,
) => {
  if (data.name.trim() === '') return 'Name the envelope.';
  if (data.priority === null) return 'Pick how much it matters.';
  if (amount === null)
    return mode === 'percent'
      ? 'Enter a whole or half percent, up to 100.'
      : 'Enter how much it gets each time.';
  if (data.cadence !== 'everyIncomeDay' && !hasDays)
    return 'Add an income source first, so there are days to count.';
  if (data.cadence === 'chosen' && data.dayKeys.length === 0)
    return 'Pick at least one day.';
  return null;
};

function EnvelopeForm({
  isOpen,
  onClose,
  onCancel,
  title,
  editing,
  presetDayKey,
  openStep = null,
}: EnvelopeFormProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const [formData, setFormData] = useState<EnvelopeFormData>(() =>
    editing ? getEditingData(editing.payload) : INITIAL_DATA,
  );
  const [startData] = useState(formData);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const set = (patch: Partial<EnvelopeFormData>) =>
    setFormData((current) => ({ ...current, ...patch }));

  const [amountMode, setAmountMode] = useState<AmountMode>(
    editing ? toFundingInput(editing.payload.funding).mode : 'exact',
  );
  const [startMode] = useState(amountMode);
  const amount = getFundingAmount(amountMode, formData.amount);
  const blocker = getBlocker(
    formData,
    amount,
    amountMode,
    comingDays.length > 0,
  );

  const dayOptions = comingDays.map((day) => ({
    value: day.dayKey,
    label: `${formatDateUTC(day.on)} · ${day.sourceName ?? day.payLineName}`,
  }));
  const hasDays = comingDays.length > 0;
  const isCadenceAnswered =
    (formData.cadence === 'everyIncomeDay' || hasDays) &&
    (formData.cadence !== 'chosen' || formData.dayKeys.length > 0);
  const cadenceText =
    formData.cadence === 'chosen'
      ? `${FUNDING_CADENCE_LABELS.chosen} · ${formData.dayKeys.length}`
      : FUNDING_CADENCE_LABELS[formData.cadence];

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
          placeholder='Groceries'
          maxLength={MAX_NAME_LENGTH}
          value={formData.name}
          onChange={(event) => set({ name: event.target.value })}
        />
      ),
    },
    {
      id: 'amount',
      title: FORM_FLOW_WORDS.envelopeAmountTitle,
      summaryLabel: FORM_FLOW_WORDS.eachTime,
      summaryValue: amount === null ? '' : describeAmount(amount),
      isAnswered: amount !== null,
      blocker:
        formData.amount.trim() === ''
          ? null
          : amountMode === 'percent'
            ? FORM_FLOW_WORDS.badPercent
            : FORM_FLOW_WORDS.badAmount,
      render: () => (
        <AmountField
          isHero
          label={FORM_FLOW_WORDS.eachTime}
          mode={amountMode}
          modes={AMOUNT_MODES}
          onModeChange={(mode) => {
            setAmountMode(mode);
            set({ amount: '' });
          }}
          percentOfLabel="of the day's money"
          restHint='Whatever is left of the day after the lines above it.'
          value={formData.amount}
          onChange={(value) => set({ amount: value })}
          suffix={
            questions.hasReviewed ? undefined : (
              <AmountHeroLink onClick={() => questions.reopen('cadence')}>
                {cadenceText} ›
              </AmountHeroLink>
            )
          }
        />
      ),
    },
    {
      id: 'cadence',
      title: FORM_FLOW_WORDS.cadenceTitle,
      summaryLabel: FORM_FLOW_WORDS.cadence,
      summaryValue: cadenceText,
      isAnswered: isCadenceAnswered,
      blocker: !hasDays
        ? 'Add an income source first, so there are days to count.'
        : FORM_FLOW_WORDS.pickDays,
      isPreAnswered: true,
      render: ({ moveOn }) => (
        <div className='space-y-3'>
          <PillGroup
            label={FORM_FLOW_WORDS.cadence}
            options={cadenceOptions}
            value={formData.cadence}
            onChange={(cadence) => {
              set({ cadence });
              if (
                (cadence === 'everyIncomeDay' || hasDays) &&
                (cadence !== 'chosen' || formData.dayKeys.length > 0)
              )
                moveOn();
            }}
          />
          {formData.cadence === 'chosen' && dayOptions.length > 0 && (
            <div className='space-y-2'>
              <p className='text-muted-foreground text-xs'>Which income days</p>
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
        <div className='w-24'>
          <Input
            variant='outline'
            aria-label={FORM_FLOW_WORDS.emoji}
            placeholder='🛒'
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

  const buildFunding = (data: EnvelopeFormData, amount: FundingAmount) => {
    const saved = editing?.payload.funding.cadence;
    if (data.cadence === 'every2' || data.cadence === 'every3') {
      const n = data.cadence === 'every2' ? 2 : 3;
      const funding: FundingRule = {
        amount,
        cadence: {
          kind: 'everyNth',
          n,
          anchorDayKey:
            saved?.kind === 'everyNth' && saved.n === n
              ? saved.anchorDayKey
              : (comingDays[0]?.dayKey ?? ''),
        },
      };
      return funding;
    }
    if (data.cadence === 'chosen') {
      const chosen = new Set(data.dayKeys);
      const funding: FundingRule = {
        amount,
        cadence: {
          kind: 'chosen',
          dayKeys: comingDays
            .filter((day) => chosen.has(day.dayKey))
            .map((day) => day.dayKey),
        },
      };
      return funding;
    }
    const funding: FundingRule = {
      amount,
      cadence: { kind: 'everyIncomeDay' },
    };
    return funding;
  };

  const buildEnvelope = (data: EnvelopeFormData): EnvelopeSealed | null => {
    const amount = getFundingAmount(amountMode, data.amount);
    if (data.priority === null || amount === null) return null;

    const tier = envelopes.filter(
      (envelope) => envelope.version.payload.priority === data.priority,
    );
    const orderIndex =
      editing && editing.payload.priority === data.priority
        ? editing.payload.orderIndex
        : Math.max(
            0,
            ...tier.map((envelope) => envelope.version.payload.orderIndex),
          ) + ENVELOPE_ORDER_STEP;
    const result: EnvelopeSealed = {
      name: data.name.trim(),
      emoji: data.emoji?.trim() || null,
      priority: data.priority,
      orderIndex,
      funding: buildFunding(data, amount),
    };
    return result;
  };

  const candidate = blocker === null ? buildEnvelope(formData) : null;
  const flow = useChangeFlow({
    itemId: editing?.itemId ?? '',
    kind: 'envelope',
    current: editing?.payload ?? EMPTY_ENVELOPE,
    candidate,
    presetDayKey,
    onDone: onClose,
  });
  const editBlocker = flow.getBlocker(blocker);
  const isDirty =
    JSON.stringify(formData) !== JSON.stringify(startData) ||
    amountMode !== startMode ||
    flow.note.trim() !== '' ||
    JSON.stringify(flow.from) !== JSON.stringify(INITIAL_FROM_WHEN);
  const requestClose = useDiscardGuard({
    isDirty,
    onClose: onCancel ?? onClose,
    isBusy: isSaving || flow.isSaving,
    title: editing
      ? FORM_FLOW_WORDS.discardChange
      : FORM_FLOW_WORDS.discardNew('envelope'),
  });
  const isAsking = !questions.hasReviewed;
  const shownBlocker = editing ? editBlocker : blocker;

  const handleSubmit = async () => {
    const envelope = buildEnvelope(formData);
    if (!user || !envelope) return;

    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await createEnvelope(user.uid, encryption, {
        startDate: today,
        envelope,
      });
      onClose();
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          'This envelope did not save. Nothing was changed.',
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const flowValue = {
    flow,
    itemId: editing?.itemId ?? '',
    kind: 'envelope' as const,
    candidate,
  };

  return (
    <FormSheet isOpen={isOpen} onClose={requestClose} title={title}>
      <ChangeSteps
        isReason={flow.step === 'reason'}
        reason={<ChangeReason flow={flow} onClose={requestClose} />}
      >
        <ChangeFlowContext value={flowValue}>
          <div className='space-y-5'>
            <QuestionFlow flow={questions} />
            {editing && questions.hasReviewed && <ChangeSection />}
            <ModalFooterActions
              note={error ?? (isAsking ? questions.blocker : shownBlocker)}
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
                    {editing ? CHANGE_WORDS.review : 'Add'}
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

export default EnvelopeForm;

import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  CHANGE_WORDS,
  ENVELOPE_ORDER_STEP,
  FORM_FLOW_WORDS,
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
} from '@apps/runway/store/selectors/runwaySelectors';
import type { EnvelopeSealed, Priority } from '@apps/runway/types';

interface EnvelopeFormData extends FundingFormData {
  name: string;
  priority: Priority | null;
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
  'name' | 'often' | 'amount' | 'cadence' | 'priority' | 'emoji';

const priorityOptions = PRIORITIES.map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
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

const getEditingData = (payload: EnvelopeSealed): EnvelopeFormData => ({
  ...toFundingForm(payload.funding),
  name: payload.name,
  priority: payload.priority,
  emoji: payload.emoji,
});

const INITIAL_DATA: EnvelopeFormData = {
  ...INITIAL_FUNDING_FORM,
  name: '',
  priority: 'should',
  emoji: null,
};

const getBlocker = (data: EnvelopeFormData, hasDays: boolean) => {
  if (data.name.trim() === '') return 'Name the envelope.';
  if (data.priority === null) return 'Pick how much it matters.';
  return getFundingBlocker(data, hasDays);
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

  const hasDays = comingDays.length > 0;
  const blocker = getBlocker(formData, hasDays);

  const fundingSteps = buildFundingSteps({
    data: formData,
    set,
    comingDays,
    allowNone: false,
    getAmountTitle: (unit) => `How much does it get ${unit}?`,
  });
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

  const buildEnvelope = (data: EnvelopeFormData): EnvelopeSealed | null => {
    const funding = buildFundingRule(data, {
      comingDays,
      saved: editing?.payload.funding,
      today,
    });
    if (data.priority === null || funding === null) return null;

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
      funding,
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

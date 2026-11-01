import { useMemo, useState } from 'react';

import EmojiField from '@/components/EmojiField';
import SuggestionChips from '@/components/SuggestionChips';
import AmountField from '@/components/AmountField';
import RevealChip from '@/components/RevealChip';
import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import DraftRestoredNotice from '@/components/DraftRestoredNotice';
import FormSheet from '@/components/FormSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import HelpTip from '@/components/HelpTip';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
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
import { getErrorMessage } from '@/utils/errorUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import {
  CHANGE_WORDS,
  ENVELOPE_QUICK_PICKS,
  FORM_DRAFT_PREFIX,
  FORM_FLOW_WORDS,
  MAX_EMOJI_LENGTH,
  MAX_NAME_LENGTH,
  PRIORITIES,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getNextTierRank } from '@apps/runway/engine/priorities';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { createEnvelope } from '@apps/runway/store/actions/itemActions';
import {
  fundingFieldChecks,
  isNullableOneOf,
  isNullableText,
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
import {
  NEW_GROUP_ID,
  getGroupChoices,
  resolveGroupChoice,
  toGroupAnswer,
} from '@apps/runway/utils/groupChoice';
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
  selectGoals,
  selectBills,
  selectEnvelopes,
  selectGroups,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { EnvelopeSealed, Priority } from '@apps/runway/types';
import { maskSummaries } from '@apps/runway/utils/maskSummaries';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { useValuesHidden } from '@/hooks/useValuesHidden';

interface EnvelopeFormData extends FundingFormData {
  name: string;
  priority: Priority | null;
  /** Null until the person adds one. */
  emoji: string | null;
  /** An existing group's id, `NEW_CHOICE` while naming one, or '' for none. */
  group: { choice: string; newText: string };
  /** Dollars as typed; empty for no limit. */
  max: string;
}

const parseEnvelopeDraftFields = (stored: unknown) =>
  readDraftFields<EnvelopeFormData>(stored, {
    ...fundingFieldChecks,
    name: isText,
    priority: isNullableOneOf(PRIORITIES),
    emoji: isNullableText,
    group: isPickOrCreate,
    max: isText,
  });

const parseEnvelopeDraft = (stored: unknown) =>
  readKeptWithChange(stored, parseEnvelopeDraftFields);

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
  /** Hands the built envelope over instead of writing it, for a person who has no plan yet. */
  draft?: DraftSink<EnvelopeSealed>;
  /** A group the new envelope starts in, already answered (the add action on a group's sheet). */
  presetGroupId?: string;
}

export type EnvelopeStepId =
  | 'name'
  | 'often'
  | 'amount'
  | 'cadence'
  | 'group'
  | 'priority'
  | 'emoji'
  | 'max';

const priorityOptions = PRIORITIES.map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));

const EMPTY_ENVELOPE: EnvelopeSealed = {
  name: '',
  emoji: null,
  priority: 'should',
  orderIndex: 0,
  groupId: null,
  maxCents: null,
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
  group: { choice: payload.groupId ?? '', newText: '' },
  max: centsToInputValue(payload.maxCents),
});

const INITIAL_DATA: EnvelopeFormData = {
  ...INITIAL_FUNDING_FORM,
  name: '',
  priority: 'should',
  emoji: null,
  group: { choice: '', newText: '' },
  max: '',
};

const getBlocker = (data: EnvelopeFormData, hasDays: boolean) => {
  if (data.group.choice === NEW_CHOICE && data.group.newText.trim() === '')
    return FORM_FLOW_WORDS.nameGroup;
  if (data.name.trim() === '') return 'Name the envelope.';
  if (data.priority === null) return 'Pick how much it matters.';
  if (data.max.trim() !== '' && !(parseMoneyToCents(data.max) ?? 0))
    return FORM_FLOW_WORDS.badAmount;
  return getFundingBlocker(data, hasDays);
};

function EnvelopeFormBody({
  onStartOver,
  isOpen,
  onClose,
  onCancel,
  title,
  editing,
  presetDayKey,
  openStep = null,
  draft,
  presetGroupId,
}: EnvelopeFormProps & StartOverProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const groups = useAppSelector((state) => selectGroups(state, today));
  const groupChoices = getGroupChoices(
    groups.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
    })),
    draft?.forName,
  );
  const groupOptions = groupChoices.map(({ id, name }) => ({
    value: id,
    label: name,
  }));
  const [startData] = useState<EnvelopeFormData>(() =>
    editing
      ? getEditingData(editing.payload)
      : draft?.initial
        ? {
            ...getEditingData(draft.initial),
            ...(draft.forName
              ? { group: toGroupAnswer(draft.forName.current, groupChoices) }
              : {}),
          }
        : {
            ...INITIAL_DATA,
            group: { choice: presetGroupId ?? '', newText: '' },
          },
  );
  const [isPriorityChosen, setIsPriorityChosen] = useState(
    editing !== undefined || draft !== undefined,
  );
  const draftKey = draft
    ? null
    : `${FORM_DRAFT_PREFIX}envelope:${editing?.itemId ?? 'new'}`;
  // A new form's draft doesn't depend on the day or the door it was opened from; an edit's is tied to the record.
  const draftBase = editing ? startData : null;
  const kept = useFormDraft({
    key: draftKey,
    base: draftBase,
    parse: parseEnvelopeDraft,
  });
  const [formData, setFormData] = useState<EnvelopeFormData>(
    kept.restored?.formData ?? startData,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const set = (patch: Partial<EnvelopeFormData>) =>
    setFormData((current) => ({ ...current, ...patch }));

  const resolveGroup = (data: EnvelopeFormData) =>
    resolveGroupChoice(data.group.choice, data.group.newText, groupChoices);
  /** The priority the person chose, else the starting priority of the group the envelope joins. */
  const getPriority = (data: EnvelopeFormData): Priority | null => {
    if (isPriorityChosen) return data.priority;
    const { groupId } = resolveGroup(data);
    const startsWith = groups.find(({ item }) => item.id === groupId)?.version
      .payload.startingPriority;
    return startsWith ?? data.priority;
  };

  const hasDays = comingDays.length > 0 || !!draft;
  const blocker = getBlocker(formData, hasDays);

  const fundingSteps = buildFundingSteps({
    data: formData,
    set,
    comingDays,
    allowNone: false,
    isDraft: !!draft,
    draftSources: draft?.sources,
    getAmountTitle: (unit) => `How much does it get ${unit}?`,
  });
  const maxCents = parseMoneyToCents(formData.max);
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
            placeholder='Groceries'
            maxLength={MAX_NAME_LENGTH}
            value={formData.name}
            onChange={(event) => set({ name: event.target.value })}
          />
          <SuggestionChips
            label={FORM_FLOW_WORDS.commonEnvelopes}
            suggestions={ENVELOPE_QUICK_PICKS.map(
              (pick) => `${pick.emoji} ${pick.name}`,
            )}
            onPick={(label) => {
              const found = ENVELOPE_QUICK_PICKS.find(
                (pick) => `${pick.emoji} ${pick.name}` === label,
              );
              if (found) set({ name: found.name, emoji: found.emoji });
            }}
          />
        </div>
      ),
    },
    ...fundingSteps,
    ...(draft && !draft.forName
      ? []
      : [
          {
            id: 'group',
            title: FORM_FLOW_WORDS.groupTitle,
            summaryLabel: FORM_FLOW_WORDS.group,
            summaryValue:
              resolveGroup(formData).name || FORM_FLOW_WORDS.noGroup,
            isAnswered:
              formData.group.choice !== NEW_CHOICE ||
              formData.group.newText.trim() !== '',
            blocker: FORM_FLOW_WORDS.nameGroup,
            isPreAnswered: true,
            titleHelp: (
              <HelpTip title={FORM_FLOW_WORDS.groupTitle}>
                <p>{FORM_FLOW_WORDS.groupHelp}</p>
              </HelpTip>
            ),
            render: ({ moveOn }: QuestionControls) => (
              <PickOrCreate
                label={FORM_FLOW_WORDS.group}
                options={groupOptions}
                choice={formData.group.choice}
                newText={formData.group.newText}
                newPillLabel={FORM_FLOW_WORDS.newGroup}
                newPlaceholder={FORM_FLOW_WORDS.newGroupPlaceholder}
                hasPlus={false}
                maxLength={MAX_NAME_LENGTH}
                clearLabel={FORM_FLOW_WORDS.clearGroup}
                onChange={(choice, newText) => {
                  set({ group: { choice, newText } });
                  if (choice !== '' && choice !== NEW_CHOICE) moveOn();
                }}
              />
            ),
          },
        ]),
    {
      id: 'priority',
      title: FORM_FLOW_WORDS.priorityTitle,
      summaryLabel: FORM_FLOW_WORDS.priority,
      summaryValue:
        getPriority(formData) === null
          ? ''
          : PRIORITY_LABELS[getPriority(formData) as Priority],
      isAnswered: formData.priority !== null,
      isPreAnswered: true,
      render: ({ moveOn }) => (
        <PillGroup
          label={FORM_FLOW_WORDS.priority}
          options={priorityOptions}
          value={getPriority(formData)}
          onChange={(priority) => {
            setIsPriorityChosen(true);
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
          placeholder='🛒'
          maxLength={MAX_EMOJI_LENGTH}
        />
      ),
    },
    {
      id: 'max',
      title: FORM_FLOW_WORDS.maxTitle,
      summaryLabel: FORM_FLOW_WORDS.max,
      summaryValue:
        maxCents === null ? FORM_FLOW_WORDS.noMax : formatCents(maxCents),
      isAnswered: true,
      isPreAnswered: true,
      render: () => (
        <div className='space-y-3'>
          <AmountField
            isHero
            emptyText={FORM_FLOW_WORDS.noMax}
            label={FORM_FLOW_WORDS.max}
            value={formData.max}
            onChange={(max) => set({ max })}
            hint={FORM_FLOW_WORDS.maxHint}
          />
          {formData.max !== '' && (
            <RevealChip onClick={() => set({ max: '' })}>
              {FORM_FLOW_WORDS.clearMax}
            </RevealChip>
          )}
        </div>
      ),
    },
  ];
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
  });

  const buildEnvelope = (data: EnvelopeFormData): EnvelopeSealed | null => {
    const funding = buildFundingRule(data, {
      comingDays,
      saved: editing?.payload.funding,
      today,
    });
    const priority = getPriority(data);
    if (priority === null || funding === null) return null;

    const orderIndex =
      editing && editing.payload.priority === priority
        ? editing.payload.orderIndex
        : getNextTierRank([...bills, ...envelopes, ...goals], priority);
    const { groupId, newGroup } = resolveGroup(data);
    const result: EnvelopeSealed = {
      name: data.name.trim(),
      emoji: data.emoji?.trim() || null,
      priority,
      orderIndex,
      groupId: draft ? null : (groupId ?? (newGroup ? NEW_GROUP_ID : null)),
      maxCents: parseMoneyToCents(data.max) || null,
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
    newGroup: resolveGroup(formData).newGroup,
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
      : FORM_FLOW_WORDS.discardNew('envelope'),
  });
  const quickStep = steps.find((step) => step.id === openStep) ?? null;
  const isQuick = !!editing && openStep !== null && !isAll;
  const isAsking = !questions.hasReviewed;
  const shownBlocker = editing ? editBlocker : blocker;

  const handleSubmit = async () => {
    const envelope = buildEnvelope(formData);
    if (!envelope) return;
    if (draft) {
      draft.onSave(envelope, resolveGroup(formData).name || null);
      onClose();
      return;
    }
    if (!user) return;

    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await createEnvelope(user.uid, encryption, {
        startDate: today,
        envelope,
        newGroup: resolveGroup(formData).newGroup,
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
                rowIds={['name', 'often', 'max']}
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
            {editing && questions.hasReviewed && <ChangeSection />}
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

const EnvelopeForm = withStartOver(EnvelopeFormBody);

export default EnvelopeForm;

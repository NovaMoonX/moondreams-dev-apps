import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import RevealChip from '@/components/RevealChip';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import HelpTip from '@/components/HelpTip';
import FormSheet from '@/components/FormSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import {
  useQuestionFlow,
  type QuestionControls,
  type QuestionStep,
} from '@/hooks/useQuestionFlow';
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
  BILL_QUICK_PICKS,
  CARD_WORDS,
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
import { getNextTierRank } from '@apps/runway/engine/priorities';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import RangeAmountField from '@apps/runway/forms/RangeAmountField';
import { createBill } from '@apps/runway/store/actions/itemActions';
import type { DraftSink } from '@apps/runway/forms/draftSink';
import EmojiField from '@/components/EmojiField';
import SuggestionChips from '@/components/SuggestionChips';
import { MaskedText } from '@apps/runway/components/MaskedText';
import ChangeSteps from '@apps/runway/components/ChangeSteps';
import ChangeReason from '@apps/runway/components/ChangeReason';
import BackLink from '@/components/BackLink';
import QuickChange from '@apps/runway/components/QuickChange';
import ChangeSection from '@apps/runway/components/ChangeSection';
import { ChangeFlowContext } from '@apps/runway/forms/changeFlowContext';
import { useChangeFlow } from '@apps/runway/forms/useChangeFlow';
import { INITIAL_FROM_WHEN } from '@apps/runway/utils/fromWhen';
import {
  describeAmountDraft,
  EMPTY_AMOUNT_DRAFT,
  getAmountDraftProblem,
  getStanceOverride,
  parseAmountDraft,
  toAmountDraft,
  type AmountDraft,
} from '@apps/runway/utils/rangeInput';
import { getCardName } from '@apps/runway/utils/cardText';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectAllCards,
  selectBills,
  selectComingDays,
  selectGoals,
  selectEnvelopes,
  selectGroups,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  BillFundedBy,
  BillSealed,
  Ending,
  Priority,
} from '@apps/runway/types';
import { maskSummaries } from '@apps/runway/utils/maskSummaries';
import {
  NEW_GROUP_ID,
  getGroupChoices,
  resolveGroupChoice,
  toGroupAnswer,
} from '@apps/runway/utils/groupChoice';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { useValuesHidden } from '@/hooks/useValuesHidden';

const CASH_VALUE = 'cash';

type Frequency = (typeof BILL_FREQUENCIES)[number];
type Funding = (typeof BILL_FUNDINGS)[number];
type EndKind = (typeof INCOME_ENDINGS)[number];

interface BillFormData {
  name: string;
  amount: AmountDraft;
  priority: Priority;
  startDate: string;
  /** The due date is left for later; the bill is saved with no date. */
  isLater: boolean;
  /** Null until a due date is picked on a new bill. */
  frequency: Frequency | null;
  endKind: EndKind;
  endDate: string;
  endCount: string;
  funding: Funding;
  dayKeys: string[];
  /** Null until the person adds one. */
  emoji: string | null;
  /** An existing group's id, `NEW_CHOICE` while naming one, or '' for none. */
  group: { choice: string; newText: string };
  /** The card it is usually charged to; null for cash or debit. */
  paidByCardId: string | null;
}

interface BillFormProps {
  isOpen: boolean;
  onClose: () => void;
  /** Where Cancel and Discard go, when that is not where a save goes (back to the sheet the form came from). */
  onCancel?: () => void;
  title: string;
  /** The bill to change; its saved values start the form and a save adds a version from a date. */
  editing?: { itemId: string; payload: BillSealed };
  /** The income day whose screen opened the edit; "this income day" then means it. */
  presetDayKey?: string;
  /** What the form calls the thing it adds; an expense that is coming is not a bill. */
  noun?: 'bill' | 'expense';
  /** A question to open first when changing a bill ("amount"); every answer starts folded otherwise. */
  openStep?: BillStepId | null;
  /** Hands the built bill over instead of writing it, for a person who has no plan yet. */
  draft?: DraftSink<BillSealed>;
  /** A group the new bill starts in, already answered (the add action on a group's sheet). */
  presetGroupId?: string;
}

export type BillStepId =
  | 'name'
  | 'amount'
  | 'due'
  | 'repeats'
  | 'ends'
  | 'funding'
  | 'priority'
  | 'group'
  | 'paidBy'
  | 'emoji';

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
  groupId: null,
  paidByCardId: null,
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

const toPickLabel = (pick: { name: string; emoji: string }) =>
  `${pick.emoji} ${pick.name}`;

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
  if (data.group.choice === NEW_CHOICE && data.group.newText.trim() === '')
    return FORM_FLOW_WORDS.nameGroup;
  if (data.name.trim() === '') return `Name the ${noun}.`;
  if (!hasAmount) {
    return data.amount.mode === 'range'
      ? 'Enter a low amount and a higher top amount.'
      : `Enter how much the ${noun} is.`;
  }
  const start = fromDateInputValue(data.startDate);
  if (start === undefined && !data.isLater) return 'Pick when it is due.';
  if (data.frequency === null) return 'Pick how often it repeats.';
  if (!isEditing && start !== undefined && start < today)
    return 'Pick today or a day to come.';
  if (buildEnding(data) === null) return 'Finish when it ends.';
  if (isChosen && pickedCount === 0) return 'Pick at least one income day.';
  return null;
};

const getEditingData = (
  payload: BillSealed,
  isDraft: boolean,
): BillFormData => {
  const { schedule } = payload.timing;
  const frequency = BILL_FREQUENCIES.find((kind) => kind === schedule.kind);
  return {
    name: payload.name,
    amount: toAmountDraft(payload.amount, payload.stanceOverride),
    priority: payload.priority,
    startDate:
      schedule.anchor === null ? '' : toDateInputValue(schedule.anchor),
    isLater: schedule.anchor === null,
    frequency: frequency ?? (isDraft ? null : 'once'),
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
    group: { choice: payload.groupId ?? '', newText: '' },
    paidByCardId: payload.paidByCardId ?? null,
  };
};

function BillForm({
  isOpen,
  onClose,
  onCancel,
  title,
  editing,
  presetDayKey,
  noun = 'bill',
  openStep = null,
  draft,
  presetGroupId,
}: BillFormProps) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
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
  const allCards = useAppSelector(selectAllCards);
  const isTracking = useAppSelector(selectLevel) === 'track';
  const [formData, setFormData] = useState<BillFormData>(() =>
    editing || draft?.initial
      ? {
          ...getEditingData(
            (editing?.payload ?? draft?.initial) as BillSealed,
            editing === undefined,
          ),
          ...(draft?.forName
            ? { group: toGroupAnswer(draft.forName.current, groupChoices) }
            : {}),
        }
      : {
          name: '',
          amount: EMPTY_AMOUNT_DRAFT,
          priority: 'should',
          startDate: '',
          isLater: false,
          frequency: null,
          endKind: 'never',
          endDate: '',
          endCount: '',
          funding: 'suggested',
          dayKeys: [],
          emoji: null,
          group: { choice: presetGroupId ?? '', newText: '' },
          paidByCardId: null,
        },
  );
  const [isPriorityChosen, setIsPriorityChosen] = useState(
    editing !== undefined || draft !== undefined,
  );
  const [startData] = useState(formData);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const set = (patch: Partial<BillFormData>) =>
    setFormData((current) => ({ ...current, ...patch }));

  const planStance = useAppSelector(selectStance);
  const isOnce = formData.frequency === 'once';
  const isDueWord = isOnce || formData.frequency === null;
  const dueDate = formData.isLater
    ? undefined
    : fromDateInputValue(formData.startDate);
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

  const savedCardId = editing?.payload.paidByCardId ?? null;
  const cardOptions = allCards.filter(
    (card) =>
      card.archivedAt === null ||
      card.id === savedCardId ||
      card.id === formData.paidByCardId,
  );
  const nameOfCard = (id: string | null) => {
    const found = allCards.find((card) => card.id === id);
    return found ? getCardName(found, allCards) : CARD_WORDS.cashOrDebit;
  };

  const startMin = editing ? undefined : toDateInputValue(today);
  const dayOptions = dueDays.map((day) => ({
    value: day.dayKey,
    label: `${formatDateUTC(day.on)} · ${day.sourceName ?? day.payLineName}`,
  }));
  const isDueValid =
    formData.isLater ||
    (dueDate !== undefined && (editing !== undefined || dueDate >= today));
  const canLater =
    editing === undefined || editing.payload.timing.schedule.anchor === null;

  const resolveGroup = (data: BillFormData) =>
    resolveGroupChoice(data.group.choice, data.group.newText, groupChoices);
  /** The priority the person chose, else the starting priority of the group the bill joins, else the default. */
  const getPriority = (data: BillFormData): Priority => {
    if (isPriorityChosen) return data.priority;
    const { groupId } = resolveGroup(data);
    const startsWith = groups.find(({ item }) => item.id === groupId)?.version
      .payload.startingPriority;
    return startsWith ?? data.priority;
  };
  const getGroupName = (data: BillFormData) =>
    resolveGroup(data).name || FORM_FLOW_WORDS.noGroup;

  const steps: QuestionStep[] = [
    {
      id: 'name',
      title: FORM_FLOW_WORDS.nameTitle,
      summaryLabel: FORM_FLOW_WORDS.name,
      summaryValue: formData.name.trim(),
      isAnswered: formData.name.trim() !== '',
      render: ({ moveOn }) => (
        <div className='space-y-4'>
          <Input
            variant='outline'
            aria-label={FORM_FLOW_WORDS.name}
            placeholder={noun === 'bill' ? 'Rent' : 'Vet visit'}
            maxLength={MAX_NAME_LENGTH}
            value={formData.name}
            onChange={(event) => set({ name: event.target.value })}
          />
          {noun === 'bill' && (
            <SuggestionChips
              label={FORM_FLOW_WORDS.commonBills}
              suggestions={BILL_QUICK_PICKS.map(toPickLabel)}
              onPick={(pick) => {
                const found = BILL_QUICK_PICKS.find(
                  (entry) => toPickLabel(entry) === pick,
                );
                if (!found) return;
                if ('priority' in found) setIsPriorityChosen(true);
                set({
                  name: found.name,
                  emoji: found.emoji,
                  ...('priority' in found ? { priority: found.priority } : {}),
                });
                moveOn();
              }}
            />
          )}
        </div>
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
      blocker: getAmountDraftProblem(formData.amount),
      render: () => (
        <div className='space-y-2'>
          <RangeAmountField
            isHero
            label={FORM_FLOW_WORDS.amount}
            hint=''
            side='expense'
            planStance={planStance}
            value={formData.amount}
            onChange={(amount) => set({ amount })}
          />
          {draft?.repeatNote && (
            <p className='text-muted-foreground text-sm text-pretty'>
              <MaskedText>{draft.repeatNote}</MaskedText>
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'due',
      title: FORM_FLOW_WORDS.dueTitle,
      summaryLabel: FORM_FLOW_WORDS.due,
      summaryValue: formData.isLater
        ? FORM_FLOW_WORDS.dueLaterSummary
        : dueDate === undefined
          ? ''
          : formatDateUTC(dueDate),
      isAnswered: isDueValid,
      blocker:
        dueDate !== undefined && !isDueValid ? FORM_FLOW_WORDS.pastDay : null,
      render: ({ moveOn }) => (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs'>
            {isDueWord ? 'Due' : 'Starts'}
          </p>
          <Input
            type='date'
            variant='outline'
            aria-label={isDueWord ? 'Due' : 'Starts'}
            min={startMin}
            value={formData.startDate}
            onChange={(event) =>
              set({
                startDate: event.target.value,
                isLater: false,
                frequency:
                  formData.frequency ?? (noun === 'bill' ? 'monthly' : 'once'),
              })
            }
          />
          {canLater && !formData.isLater && (
            <RevealChip
              onClick={() => {
                set({
                  startDate: '',
                  isLater: true,
                  frequency:
                    formData.frequency ??
                    (noun === 'bill' ? 'monthly' : 'once'),
                });
                moveOn();
              }}
            >
              {FORM_FLOW_WORDS.dueLater}
            </RevealChip>
          )}
        </div>
      ),
    },
    {
      id: 'repeats',
      title: FORM_FLOW_WORDS.repeatsTitle,
      summaryLabel: FORM_FLOW_WORDS.repeats,
      summaryValue:
        formData.frequency === null
          ? ''
          : BILL_FREQUENCY_LABELS[formData.frequency],
      isAnswered: formData.frequency !== null,
      blocker: FORM_FLOW_WORDS.pickRepeat,
      render: ({ moveOn }) => (
        <div className='space-y-2'>
          <PillGroup
            label='Repeats'
            options={frequencyOptions}
            value={formData.frequency}
            onChange={(frequency) => {
              set({ frequency });
              moveOn();
            }}
          />
          {draft?.repeatNote && (
            <p className='text-muted-foreground text-sm text-pretty'>
              <MaskedText>{draft.repeatNote}</MaskedText>
            </p>
          )}
        </div>
      ),
    },
    ...(isOnce || formData.frequency === null
      ? []
      : [
          {
            id: 'ends',
            title: FORM_FLOW_WORDS.endsTitle,
            summaryLabel: FORM_FLOW_WORDS.ends,
            summaryValue: describeEnding(formData),
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
            blocker: FORM_FLOW_WORDS.pickDays,
            isPreAnswered: true,
            render: ({ moveOn }: QuestionControls) => (
              <div className='space-y-3'>
                <PillGroup
                  label='Funded from'
                  options={fundingOptions}
                  value={formData.funding}
                  onChange={(funding) => {
                    set({ funding });
                    if (funding !== 'chosen' || pickedCount > 0) moveOn();
                  }}
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
    ...(draft && !draft.forName
      ? []
      : [
          {
            id: 'group',
            title: FORM_FLOW_WORDS.groupTitle,
            summaryLabel: FORM_FLOW_WORDS.group,
            summaryValue: getGroupName(formData),
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
      summaryValue: PRIORITY_LABELS[getPriority(formData)],
      isAnswered: true,
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
    ...(isTracking && cardOptions.length > 0
      ? [
          {
            id: 'paidBy',
            title: CARD_WORDS.paidByTitle,
            summaryLabel: CARD_WORDS.paidBy,
            summaryValue: nameOfCard(formData.paidByCardId),
            isAnswered: true,
            isPreAnswered: true,
            render: ({ moveOn }: QuestionControls) => (
              <PillGroup
                label={CARD_WORDS.paidBy}
                options={[
                  { value: CASH_VALUE, label: CARD_WORDS.cashOrDebit },
                  ...cardOptions.map((card) => ({
                    value: card.id,
                    label: getCardName(card, allCards),
                  })),
                ]}
                value={formData.paidByCardId ?? CASH_VALUE}
                onChange={(value) => {
                  set({ paidByCardId: value === CASH_VALUE ? null : value });
                  moveOn();
                }}
              />
            ),
          },
        ]
      : []),
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
          placeholder='🏠'
          maxLength={MAX_EMOJI_LENGTH}
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
    steps: maskSummaries(steps, isHidden),
    startFolded: editing !== undefined || !!draft?.initial,
    initialOpenId: draft?.openStep ?? null,
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
    const anchor = data.isLater ? null : fromDateInputValue(data.startDate);
    const ending = buildEnding(data);
    if (
      amount === null ||
      anchor === undefined ||
      !ending ||
      data.frequency === null
    )
      return null;

    const priority = getPriority(data);
    const orderIndex =
      editing && editing.payload.priority === priority
        ? editing.payload.orderIndex
        : getNextTierRank([...bills, ...envelopes, ...goals], priority);
    const { groupId, newGroup } = resolveGroup(data);
    const fundedBy: BillFundedBy = isChosen
      ? { kind: 'chosen', dayKeys: getChosenKeys(data.dayKeys) }
      : { kind: 'suggested' };
    const result: BillSealed = {
      name: data.name.trim(),
      emoji: data.emoji?.trim() || null,
      priority,
      orderIndex,
      amount,
      timing: {
        kind: 'date',
        schedule: {
          kind: data.frequency,
          anchor,
          monthDays:
            data.frequency === 'monthly' && anchor !== null
              ? [new Date(anchor).getUTCDate()]
              : [],
        },
      },
      ending,
      fundedBy,
      stanceOverride: getStanceOverride(data.amount),
      groupId: draft ? null : (groupId ?? (newGroup ? NEW_GROUP_ID : null)),
      paidByCardId: data.paidByCardId,
    };
    return result;
  };

  const candidate = blocker === null ? buildBill(formData) : null;
  const flow = useChangeFlow({
    itemId: editing?.itemId ?? '',
    kind: 'bill',
    current: editing
      ? {
          ...editing.payload,
          paidByCardId: editing.payload.paidByCardId ?? null,
        }
      : EMPTY_BILL,
    candidate,
    presetDayKey,
    newGroup: resolveGroup(formData).newGroup,
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
      : FORM_FLOW_WORDS.discardNew(noun),
  });
  const quickStep = steps.find((step) => step.id === openStep) ?? null;
  const isQuick = !!editing && openStep !== null && !isAll;
  const isAsking = !questions.hasReviewed;
  const shownBlocker = editing ? editBlocker : blocker;

  const handleSubmit = async () => {
    const bill = buildBill(formData);
    if (!bill) return;
    if (draft) {
      draft.onSave(bill, resolveGroup(formData).name || null);
      onClose();
      return;
    }
    if (!user) return;

    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await createBill(user.uid, encryption, {
        startDate: today,
        bill,
        newGroup: resolveGroup(formData).newGroup,
      });
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
            {isQuick && quickStep ? (
              <QuickChange step={quickStep} onAll={() => setIsAll(true)} />
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

export default BillForm;

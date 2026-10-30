import { useEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  CircleHelp,
  Eye,
  Loader,
  Pencil,
  Repeat,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { PillGroup } from '@/components/PillGroup';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import Field from '@/components/forms/Field';
import HelpTip from '@/components/HelpTip';
import InlineNotice from '@/components/InlineNotice';
import ModalFooterActions from '@/components/ModalFooterActions';
import RevealChip from '@/components/RevealChip';
import SectionDivider from '@/components/SectionDivider';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useBackStep } from '@/hooks/useBackHistory';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { getAiReadFailureMessage } from '@/lib/firebase/aiFailure';
import { formatFileSize } from '@/utils/fileUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import {
  BILL_FREQUENCY_LABELS,
  BUDGET_ACCEPT,
  BUDGET_LIMITS,
  BUDGET_WORDS,
  CALENDAR_PERIOD_UNITS,
  FORM_FLOW_WORDS,
  GROUP_WORDS,
  SCHEDULE_LABELS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import BillForm from '@apps/runway/forms/BillForm';
import EnvelopeForm from '@apps/runway/forms/EnvelopeForm';
import GoalForm from '@apps/runway/forms/GoalForm';
import IncomeForm from '@apps/runway/forms/IncomeForm';
import type { DraftSink } from '@apps/runway/forms/draftSink';
import { toDraftSourceId } from '@apps/runway/forms/fundingFlow';
import {
  chooseVersion,
  getMissingSteps,
  toBillProposal,
  toMonthlyBillValue,
  toPerMonthCents,
  toEnvelopeProposal,
  toGoalValue,
  toIncomeValue,
  type BudgetKind,
  type BudgetValues,
} from '@apps/runway/lib/budgetDraft';
import {
  EMPTY_BUDGET_READING,
  type BillValues,
  type BudgetReading,
  type BudgetVersion,
  type EnvelopeValues,
  type GoalValues,
  type IncomeValues,
} from '@apps/runway/lib/normalizeBudgetReading';
import { nameDocuments } from '@apps/runway/lib/nameDocuments';
import { isBudgetFile, readBudget } from '@apps/runway/lib/readBudget';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { toOrdinal } from '@apps/runway/utils/monthDays';
import SheetHead from '@apps/runway/components/SheetHead';
import ForRenameSheet from '@apps/runway/screens/start/ForRenameSheet';
import StartRowList from '@apps/runway/screens/start/StartRowList';
import {
  toBillRow,
  toEnvelopeRow,
  toGoalRow,
  toIncomeRow,
  formatRowRange,
  type StartRow,
} from '@apps/runway/screens/start/startRows';
import {
  DraftPartialWrite,
  DraftPlanNotReady,
} from '@apps/runway/store/actions/draftActions';
import type { DraftKind, StartDraft } from '@apps/runway/utils/startDraft';

const KINDS: { kind: BudgetKind; label: string; search: string }[] = [
  { kind: 'income', label: BUDGET_WORDS.income, search: 'Search your income' },
  { kind: 'bill', label: BUDGET_WORDS.bills, search: 'Search your bills' },
  {
    kind: 'envelope',
    label: BUDGET_WORDS.envelopes,
    search: 'Search your envelopes',
  },
  { kind: 'goal', label: BUDGET_WORDS.goals, search: 'Search your goals' },
];

interface ProposalVersion {
  sourceFile: string;
  says: string;
  value: BudgetValues[BudgetKind];
}

/** A choice the person made, with how many versions the files gave when they made it: a later file that adds one reopens it. */
interface Decision {
  value: BudgetValues[BudgetKind];
  versionCount: number;
}

interface Proposal {
  key: string;
  kind: BudgetKind;
  name: string;
  sourceFile: string;
  /** What each file said when the files disagree; empty otherwise. */
  versions: ProposalVersion[];
  /** The files disagree and the person has not chosen among the versions they gave. */
  isUndecided: boolean;
  /** The person had chosen, and a file added since disagrees. */
  isReopened: boolean;
  /** What a bill or envelope is for, by name; null for the rest and for ones that are for nothing. */
  forName: string | null;
  /** What a goal's document says goes toward it each month. */
  monthlyCents: number | null;
  /** What a bill's document wrote for a repeat Runway has none for ("yearly"), with the figure it gave and what that comes to a month. */
  cadence: {
    words: string;
    writtenCents: number | null;
    perMonthCents: number | null;
    monthly: BudgetValues['bill'];
  } | null;
  value: BudgetValues[BudgetKind];
}

interface ReadItem<V> {
  name: string;
  sourceFile: string;
  versions: BudgetVersion<V>[];
}

interface KindReading<K extends BudgetKind, V, T extends ReadItem<V>> {
  make: (item: T) => BudgetValues[K];
  forName?: (item: T) => string | null;
  choose: (item: T, version: BudgetVersion<V>) => T;
  say: (values: V) => string;
  cadence?: (item: T) => Proposal['cadence'];
  monthly?: (item: T) => number | null;
}

const KEY_SEPARATOR = ':';

const SHORT_FOOTER_MAX_HEIGHT = 500;

const toFileKey = (file: File) => `${file.name}${KEY_SEPARATOR}${file.size}`;

const sayAmount = (low: number | null, high: number | null) =>
  low === null
    ? null
    : high === null
      ? formatCents(low)
      : `${formatCents(low)}–${formatCents(high)}`;

const sayDays = (days: number[]) =>
  days.length === 0
    ? null
    : `on the ${days.map((day) => (day === 31 ? 'last day' : toOrdinal(day))).join(' and ')}`;

const sayParts = (parts: (string | null)[]) =>
  parts.filter((part) => part !== null).join(' ') || 'nothing else';

const sayIncome = (values: IncomeValues) =>
  sayParts([
    sayAmount(values.amountCents, null),
    values.scheduleKind && SCHEDULE_LABELS[values.scheduleKind].toLowerCase(),
    sayDays(values.monthDays) ??
      (values.nextOn === null ? null : `from ${formatDateUTC(values.nextOn)}`),
  ]);

const sayBill = (values: BillValues) =>
  values.writtenCadence !== null
    ? sayParts([sayAmount(values.writtenCents, null), values.writtenCadence])
    : sayParts([
        sayAmount(values.amountCents, values.highCents),
        values.repeats && BILL_FREQUENCY_LABELS[values.repeats].toLowerCase(),
        sayDays(values.dayOfMonth === null ? [] : [values.dayOfMonth]) ??
          (values.dueOn === null ? null : `due ${formatDateUTC(values.dueOn)}`),
      ]);

const sayEnvelope = (values: EnvelopeValues) =>
  sayParts([
    sayAmount(values.amountCents, null),
    values.period === null
      ? null
      : values.period === 'perPay'
        ? 'each pay'
        : CALENDAR_PERIOD_UNITS[values.period],
  ]);

const sayGoal = (values: GoalValues) =>
  sayParts([
    values.targetCents === null
      ? null
      : `${formatCents(values.targetCents)} target`,
    values.currentCents === null
      ? null
      : `${formatCents(values.currentCents)} saved`,
    values.targetDate === null
      ? null
      : `by ${formatDateUTC(values.targetDate)}`,
  ]);

const getKindReadings = (today: number) => ({
  income: {
    make: (item) => toIncomeValue(item, today),
    choose: chooseVersion.income,
    say: sayIncome,
  } satisfies KindReading<
    'income',
    IncomeValues,
    BudgetReading['incomes'][number]
  >,
  bill: {
    make: (item) => toBillProposal(item, today).value,
    forName: (item) => toBillProposal(item, today).forName,
    choose: chooseVersion.bill,
    say: sayBill,
    cadence: (item) =>
      item.writtenCadence === null
        ? null
        : {
            words: item.writtenCadence,
            writtenCents: item.writtenCents,
            perMonthCents: toPerMonthCents(item),
            monthly: toMonthlyBillValue(item, today),
          },
  } satisfies KindReading<'bill', BillValues, BudgetReading['bills'][number]>,
  envelope: {
    make: (item) => toEnvelopeProposal(item, today).value,
    forName: (item) => toEnvelopeProposal(item, today).forName,
    choose: chooseVersion.envelope,
    say: sayEnvelope,
  } satisfies KindReading<
    'envelope',
    EnvelopeValues,
    BudgetReading['envelopes'][number]
  >,
  goal: {
    make: (item) => toGoalValue(item, today),
    choose: chooseVersion.goal,
    say: sayGoal,
    monthly: (item) => item.monthlyCents,
  } satisfies KindReading<'goal', GoalValues, BudgetReading['goals'][number]>,
});

const toKey = (name: string) => name.trim().toLowerCase();

const toForName = (name: string | null | undefined) => name?.trim() || null;

const toProposals = <K extends BudgetKind, V, T extends ReadItem<V>>(
  kind: K,
  items: T[],
  reading: KindReading<K, V, T>,
  edited: Record<string, Decision>,
  removed: ReadonlySet<string>,
  forNames: Record<string, string | null>,
): Proposal[] =>
  items.flatMap((item, index) => {
    const key = `${kind}${KEY_SEPARATOR}${index}`;
    if (removed.has(key)) return [];
    const decision = edited[key];
    const value = decision?.value ?? reading.make(item);
    const isUndecided =
      item.versions.length > 0 &&
      decision?.versionCount !== item.versions.length;
    return [
      {
        key,
        kind,
        name:
          kind === 'income'
            ? (value as BudgetValues['income']).sourceName
            : (value as BudgetValues['bill']).name,
        sourceFile: item.sourceFile,
        forName: toForName(
          key in forNames ? forNames[key] : (reading.forName?.(item) ?? null),
        ),
        isUndecided,
        isReopened: isUndecided && decision !== undefined,
        monthlyCents: reading.monthly?.(item) ?? null,
        versions: item.versions.map((version) => ({
          sourceFile: version.sourceFile,
          says: BUDGET_WORDS.versionSays(
            version.sourceFile,
            reading.say(version.values),
          ),
          value: reading.make(reading.choose(item, version)),
        })),
        cadence: reading.cadence?.(item) ?? null,
        value,
      },
    ];
  });

const toGoalLine = (goal: BudgetValues['goal']) =>
  goal.targetDate !== null
    ? null
    : !goal.startingCents
      ? 'No date set'
      : `${formatCentsShort(goal.startingCents)} saved so far`;

const toCadenceNote = ({ cadence }: Proposal) =>
  cadence === null
    ? null
    : cadence.writtenCents === null
      ? BUDGET_WORDS.documentSays(cadence.words)
      : BUDGET_WORDS.documentSaysAmount(
          formatCents(cadence.writtenCents),
          cadence.words,
        );

const toValueAmount = ({ kind, value }: Proposal) => {
  const range =
    kind === 'income'
      ? (value as BudgetValues['income']).amount
      : kind === 'bill'
        ? (value as BudgetValues['bill']).amount
        : null;
  return range !== null && range.lowCents > 0 ? formatRowRange(range) : null;
};

/** The figure the document gave when the value has none yet: a yearly bill's, or a goal's monthly amount. */
const toDocumentAmount = ({ kind, cadence, monthlyCents }: Proposal) => {
  if (cadence?.writtenCents)
    return BUDGET_WORDS.amountPerCadence(
      formatCentsShort(cadence.writtenCents),
      cadence.words,
    );
  return kind === 'goal' && monthlyCents
    ? BUDGET_WORDS.amountAMonth(formatCentsShort(monthlyCents))
    : null;
};

/** What the row still needs, worded for the step that opens: a figure the document gave for a yearly bill is converted, not missing. */
const toNeeds = ({ cadence }: Proposal, missing: string[]) =>
  BUDGET_WORDS.needs(
    (cadence?.writtenCents ? missing.slice(0, 1) : missing).map((step) =>
      cadence?.writtenCents && step === 'amount'
        ? BUDGET_WORDS.needsMonthlyAmount
        : (BUDGET_WORDS.needsParts[step] ?? step),
    ),
  );

const toBaseRow = (proposal: Proposal, missing: string[]): StartRow => {
  const { key, kind, value } = proposal;
  if (missing.length > 0)
    return {
      id: key,
      name: proposal.name,
      emoji: null,
      line:
        proposal.cadence !== null &&
        !proposal.cadence.writtenCents &&
        missing.includes('repeats')
          ? BUDGET_WORDS.cadenceRow(
              proposal.cadence.words,
              toNeeds(proposal, missing),
            )
          : toNeeds(proposal, missing),
      amount: toValueAmount(proposal) ?? toDocumentAmount(proposal),
      isAmountMuted: toValueAmount(proposal) === null,
    };
  if (kind === 'income') {
    const income = value as BudgetValues['income'];
    return toIncomeRow(key, income.sourceName, income.amount, income.schedule);
  }
  if (kind === 'bill') return toBillRow(key, value as BudgetValues['bill']);
  if (kind === 'envelope')
    return toEnvelopeRow(key, value as BudgetValues['envelope']);
  const goal = value as BudgetValues['goal'];
  const row = toGoalRow(key, goal);
  const line = toGoalLine(goal);
  return line === null || !goal.startingCents
    ? { ...row, line: line ?? row.line }
    : {
        ...row,
        line,
        amount: BUDGET_WORDS.goalOf(formatCentsShort(goal.targetCents)),
      };
};

const toRow = (proposal: Proposal, isHidden: boolean): StartRow =>
  proposal.isUndecided
    ? {
        id: proposal.key,
        name: proposal.name,
        emoji: null,
        line: isHidden
          ? BUDGET_WORDS.needsLook
          : proposal.isReopened
            ? BUDGET_WORDS.disagreeAgain
            : BUDGET_WORDS.disagree,
        amount: null,
      }
    : toBaseRow(proposal, getMissingSteps(proposal.kind, proposal.value));

/** Bills or envelopes under what they are for in the order first seen, the ones for nothing last under their own heading once any has one. */
const toForRows = (
  list: Proposal[],
  other: string,
  toProposalRow: (proposal: Proposal) => StartRow,
  getEmoji: (name: string) => string | null,
): StartRow[] => {
  const names = list.reduce<string[]>(
    (acc, { forName }) =>
      forName === null ||
      toKey(forName) === toKey(other) ||
      acc.some((name) => toKey(name) === toKey(forName))
        ? acc
        : [...acc, forName],
    [],
  );
  if (names.length === 0) return list.map(toProposalRow);
  const headingOf = ({ forName }: Proposal) =>
    names.find((name) => forName !== null && toKey(name) === toKey(forName)) ??
    other;
  return [...names, other].flatMap((heading) =>
    list
      .filter((proposal) => headingOf(proposal) === heading)
      .map((proposal) => {
        const row = toProposalRow(proposal);
        return {
          ...row,
          group: heading,
          emoji: row.emoji ?? (heading === other ? null : getEmoji(heading)),
        };
      }),
  );
};

/** Pay lines of a payer that has several sit under its name, after the payers that have one. */
const toPayerRows = (
  list: Proposal[],
  toProposalRow: (proposal: Proposal) => StartRow,
): StartRow[] => {
  const incomeOf = ({ value }: Proposal) => value as BudgetValues['income'];
  const payers = list.reduce<string[]>(
    (acc, proposal) =>
      acc.some((name) => toKey(name) === toKey(incomeOf(proposal).sourceName))
        ? acc
        : [...acc, incomeOf(proposal).sourceName],
    [],
  );
  const sizeOf = (name: string) =>
    list.filter(
      (proposal) => toKey(incomeOf(proposal).sourceName) === toKey(name),
    ).length;
  const rows = payers.flatMap((payer) =>
    list
      .filter(
        (proposal) => toKey(incomeOf(proposal).sourceName) === toKey(payer),
      )
      .map((proposal) =>
        sizeOf(payer) > 1
          ? {
              ...toProposalRow(proposal),
              name: incomeOf(proposal).payLineName,
              group: payer,
            }
          : { ...toProposalRow(proposal) },
      ),
  );
  return [
    ...rows.filter((row) => row.group === undefined),
    ...rows.filter((row) => row.group !== undefined),
  ];
};

const countReading = (reading: BudgetReading) =>
  reading.incomes.length +
  reading.bills.length +
  reading.envelopes.length +
  reading.goals.length;

interface BudgetStartProps {
  /** Adds what was reviewed; a rejection is shown here and the review stays open. */
  onAdd: (draft: Pick<StartDraft, DraftKind>) => Promise<void>;
  /** Leaves for the choice of how to start. */
  onBack: () => void;
  /** Leaves Starting out altogether. */
  onExit: () => void;
  /** Goes on to the steps without a budget. */
  onStartFresh: () => void;
  /** Hands over the ways out that ask first once there is work, for the header's back and close. */
  onGuards: (guards: BudgetGuards) => void;
}

export interface BudgetGuards {
  back: () => void;
  close: () => void;
}

/** "Start from your budget": pick files or paste text, have an AI read them in one go, then review what it found in the same forms Starting out uses. Nothing is saved until the person adds it. */
function BudgetStart({
  onAdd,
  onBack,
  onExit,
  onStartFresh,
  onGuards,
}: BudgetStartProps) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pasted, setPasted] = useState('');
  const [reading, setReading] = useState<BudgetReading | null>(null);
  const [readFiles, setReadFiles] = useState<string[]>([]);
  const [readNames, setReadNames] = useState<string[]>([]);
  const [phase, setPhase] = useState<'input' | 'review'>('input');
  const noticeRef = useRef<HTMLDivElement>(null);
  const mask = useMaskedText();
  const { isHidden, toggle: toggleHidden } = useValuesHidden();
  const [isReading, setIsReading] = useState(false);
  const [canStartFresh, setCanStartFresh] = useState(false);
  const [isNotReadOpen, setIsNotReadOpen] = useState(false);
  const runRef = useRef(0);
  const isShort = useIsShortScreen(SHORT_FOOTER_MAX_HEIGHT);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState<Record<string, Decision>>({});
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [forNames, setForNames] = useState<Record<string, string | null>>({});
  const [forEmojis, setForEmojis] = useState<Record<string, string | null>>({});
  const [renaming, setRenaming] = useState<{
    name: string;
    kind: BudgetKind;
  } | null>(null);
  const [form, setForm] = useState<{
    key: string;
    token: number;
    step: string | null;
  } | null>(null);
  const { addToast } = useToast();
  const today = todayAsUtcDate();

  const slotsLeft = BUDGET_LIMITS.files - readFiles.length - files.length;
  const hasInput = files.length > 0 || pasted.trim() !== '';
  const stopRead = () => {
    runRef.current += 1;
    setIsReading(false);
  };
  const goTo = (next: 'input' | 'review') => {
    setError(null);
    setCanStartFresh(false);
    setPhase(next);
  };
  const dropReading = () => {
    setReading(null);
    setReadFiles([]);
    setReadNames([]);
    setEdited({});
    setForNames({});
    setForEmojis({});
    setRenaming(null);
    setRemoved(new Set());
    setSelected(null);
    setForm(null);
    goTo('input');
  };
  const askStop = useDiscardGuard({
    isDirty: true,
    title: BUDGET_WORDS.stopTitle,
    message: BUDGET_WORDS.stopMessage,
    confirmText: BUDGET_WORDS.stopConfirm,
    cancelText: BUDGET_WORDS.stopCancel,
    onClose: stopRead,
  });
  const askStopExit = useDiscardGuard({
    isDirty: true,
    title: BUDGET_WORDS.stopTitle,
    message: BUDGET_WORDS.stopMessage,
    confirmText: BUDGET_WORDS.stopConfirm,
    cancelText: BUDGET_WORDS.stopCancel,
    onClose: () => {
      stopRead();
      onExit();
    },
  });
  const askDrop = useDiscardGuard({
    isDirty: true,
    isBusy: isAdding,
    title: BUDGET_WORDS.leaveTitle,
    message: BUDGET_WORDS.leaveMessage,
    onClose: dropReading,
  });
  const askExit = useDiscardGuard({
    isDirty: reading !== null,
    isBusy: isAdding,
    title: BUDGET_WORDS.leaveTitle,
    message: BUDGET_WORDS.leaveMessage,
    onClose: onExit,
  });
  // One step back from wherever the person is, for the header, the footer and the back gesture alike.
  const stepBack = () => {
    if (isAdding) return;
    if (isReading) return askStop();
    if (reading === null) return onBack();
    if (phase === 'review') return askDrop();
    goTo('review');
  };
  const stepClose = () => {
    if (isAdding) return;
    if (isReading) return askStopExit();
    askExit();
  };
  useBackStep(true, stepBack);
  useBackStep(reading !== null, stepBack);
  useBackStep(reading !== null && phase === 'input', stepBack);
  useEffect(() => {
    onGuards({ back: stepBack, close: stepClose });
  });
  useEffect(
    () => () => {
      runRef.current += 1;
    },
    [],
  );
  useEffect(() => {
    if (error) noticeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);
  const data = reading ?? EMPTY_BUDGET_READING;
  const readings = getKindReadings(today);

  const proposals: Proposal[] = [
    ...toProposals(
      'income',
      data.incomes,
      readings.income,
      edited,
      removed,
      forNames,
    ),
    ...toProposals(
      'bill',
      data.bills,
      readings.bill,
      edited,
      removed,
      forNames,
    ),
    ...toProposals(
      'envelope',
      data.envelopes,
      readings.envelope,
      edited,
      removed,
      forNames,
    ),
    ...toProposals(
      'goal',
      data.goals,
      readings.goal,
      edited,
      removed,
      forNames,
    ),
  ];
  const ofKind = (kind: BudgetKind) =>
    proposals.filter((proposal) => proposal.kind === kind);
  const needing = proposals.filter(
    (proposal) =>
      proposal.isUndecided ||
      getMissingSteps(proposal.kind, proposal.value).length > 0,
  ).length;
  const undated = ofKind('bill').filter(
    (proposal) =>
      !proposal.isUndecided &&
      (proposal.value as BudgetValues['bill']).timing.schedule.anchor === null,
  ).length;
  const toProposalRow = (proposal: Proposal) => toRow(proposal, isHidden);
  const forNameList = [...ofKind('bill'), ...ofKind('envelope')].reduce<
    string[]
  >(
    (acc, { forName }) =>
      forName === null || acc.some((name) => toKey(name) === toKey(forName))
        ? acc
        : [...acc, forName],
    [],
  );
  const readEmojis = [...data.bills, ...data.envelopes].reduce<
    Map<string, string>
  >(
    (acc, { forName, forEmoji }) =>
      forName === null || forEmoji === null || acc.has(toKey(forName))
        ? acc
        : acc.set(toKey(forName), forEmoji),
    new Map(),
  );
  const emojiOf = (name: string) =>
    toKey(name) in forEmojis
      ? forEmojis[toKey(name)]
      : (readEmojis.get(toKey(name)) ?? null);
  const setFor = (
    keys: string[],
    next: (current: string | null) => string | null,
  ) =>
    setForNames((current) => ({
      ...current,
      ...Object.fromEntries(
        keys.map((key) => [
          key,
          next(
            toForName(
              proposals.find((proposal) => proposal.key === key)?.forName,
            ),
          ),
        ]),
      ),
    }));
  const keysFor = (name: string, kind?: BudgetKind) =>
    proposals
      .filter(
        (proposal) =>
          (kind === undefined
            ? proposal.kind === 'bill' || proposal.kind === 'envelope'
            : proposal.kind === kind) &&
          proposal.forName !== null &&
          toKey(proposal.forName) === toKey(name),
      )
      .map((proposal) => proposal.key);
  const takeOut = (kind: BudgetKind, name: string) => {
    const keys = keysFor(name, kind);
    const before = Object.fromEntries(keys.map((key) => [key, name] as const));
    setFor(keys, () => null);
    addToast({
      title: BUDGET_WORDS.tookOut(keys.length, name),
      type: 'success',
      action: {
        label: BUDGET_WORDS.undo,
        onClick: () => setForNames((current) => ({ ...current, ...before })),
      },
    });
  };
  const renameFor = (from: string, to: string, emoji: string | null) => {
    const isJoining = forNameList.some(
      (name) => toKey(name) === toKey(to) && toKey(name) !== toKey(from),
    );
    if (!isJoining)
      setForEmojis((current) => ({ ...current, [toKey(to)]: emoji }));
    setFor(keysFor(from), () => to);
  };
  const setValue = (
    { key, versions }: Proposal,
    value: BudgetValues[BudgetKind],
  ) => {
    setEdited((current) => ({
      ...current,
      [key]: { value, versionCount: versions.length },
    }));
    setSelected(null);
  };
  const selectedProposal =
    proposals.find((proposal) => proposal.key === selected) ?? null;
  const formProposal =
    form === null
      ? null
      : (proposals.find((proposal) => proposal.key === form.key) ?? null);

  const pick = (list: File[]) => {
    const wrong = list.filter((file) => !isBudgetFile(file));
    const isSeen = (file: File) =>
      readFiles.includes(toFileKey(file)) ||
      files.some((have) => toFileKey(have) === toFileKey(file));
    const fresh = list.filter((file) => isBudgetFile(file) && !isSeen(file));
    const taken = fresh.slice(0, Math.max(0, slotsLeft));
    const next = [...files, ...taken];
    if (next.reduce((sum, file) => sum + file.size, 0) > BUDGET_LIMITS.bytes)
      return setError(BUDGET_WORDS.tooBig);
    const alreadyRead = list.filter((file) =>
      readFiles.includes(toFileKey(file)),
    );
    setCanStartFresh(false);
    setError(
      [
        wrong.length > 0
          ? BUDGET_WORDS.wrongType(wrong.map((file) => file.name))
          : null,
        alreadyRead.length > 0
          ? BUDGET_WORDS.alreadyRead(alreadyRead.map((file) => file.name))
          : null,
        taken.length < fresh.length ? BUDGET_WORDS.tooMany : null,
      ]
        .filter((line) => line !== null)
        .join(' ') || null,
    );
    setFiles(next);
  };

  const read = async () => {
    if (!user) return;
    const run = runRef.current + 1;
    runRef.current = run;
    setIsReading(true);
    setError(null);
    setCanStartFresh(false);
    try {
      const names = nameDocuments(files, pasted.trim() !== '', readNames);
      const next = await readBudget(files, pasted, names, reading ?? undefined);
      if (runRef.current !== run) return;
      if (reading === null && countReading(next) === 0) {
        setError(BUDGET_WORDS.nothingFound);
        setCanStartFresh(true);
        return;
      }
      if (
        reading !== null &&
        JSON.stringify(next) === JSON.stringify(reading)
      ) {
        setError(BUDGET_WORDS.nothingNew(files.length));
        setFiles([]);
        setPasted('');
        return;
      }
      setReading(next);
      setReadFiles((keys) => [...keys, ...files.map(toFileKey)]);
      setReadNames((used) => [
        ...used,
        ...names.files.map((entry) => entry.shown),
        ...(names.pasted ? [names.pasted.shown] : []),
      ]);
      setFiles([]);
      setPasted('');
      goTo('review');
    } catch (readError) {
      if (runRef.current !== run) return;
      console.error('Reading the budget failed', readError);
      setCanStartFresh(reading === null);
      setError(
        getAiReadFailureMessage(readError, {
          subject: BUDGET_WORDS.failSubject,
          fallback: BUDGET_WORDS.failFallback,
          unreadable: BUDGET_WORDS.unreadable,
        }),
      );
    } finally {
      if (runRef.current === run) setIsReading(false);
    }
  };

  const add = async () => {
    setIsAdding(true);
    setError(null);
    const valuesOf = <K extends BudgetKind>(kind: K) =>
      ofKind(kind).map(({ key, value, forName }) => ({
        id: key,
        value: value as BudgetValues[K],
        forName,
        forEmoji: forName === null ? null : emojiOf(forName),
      }));
    try {
      await onAdd({
        incomes: valuesOf('income'),
        bills: valuesOf('bill'),
        envelopes: valuesOf('envelope'),
        goals: valuesOf('goal'),
      });
    } catch (addError) {
      console.error('Adding the budget failed', addError);
      if (addError instanceof DraftPartialWrite) {
        const written = new Set(addError.result.addedIds);
        setRemoved((current) => new Set([...current, ...written]));
        setError(
          BUDGET_WORDS.partialAdded(addError.result.added, proposals.length),
        );
      } else {
        setError(
          addError instanceof DraftPlanNotReady
            ? BUDGET_WORDS.notReady
            : BUDGET_WORDS.planFailed,
        );
      }
      setIsAdding(false);
    }
  };

  const renderForm = () => {
    if (form === null || formProposal === null) return null;
    const { kind, value, key } = formProposal;
    const sinkFor = <K extends BudgetKind>(
      initial: BudgetValues[K],
    ): DraftSink<BudgetValues[K]> => ({
      initial,
      repeatNote: toCadenceNote(formProposal),
      sources: ofKind('income')
        .map((entry) => (entry.value as BudgetValues['income']).sourceName)
        .reduce<string[]>(
          (acc, name) =>
            acc.some((seen) => toKey(seen) === toKey(name))
              ? acc
              : [...acc, name],
          [],
        )
        .map((name) => ({ id: toDraftSourceId(name), name })),
      ...(kind === 'bill' || kind === 'envelope'
        ? { forName: { names: forNameList, current: formProposal.forName } }
        : {}),
      openStep: form.step ?? getMissingSteps(kind, value)[0] ?? null,
      onSave: (next, nextFor) => {
        setEdited((current) => ({
          ...current,
          [key]: { value: next, versionCount: formProposal.versions.length },
        }));
        if (kind === 'bill' || kind === 'envelope')
          setForNames((current) => ({ ...current, [key]: nextFor ?? null }));
      },
    });
    const close = () => setForm(null);
    const formKey = form.token;
    if (kind === 'income')
      return (
        <IncomeForm
          key={formKey}
          isOpen
          title='Income source'
          defaultFrequency={null}
          draft={sinkFor<'income'>(value as BudgetValues['income'])}
          onClose={close}
        />
      );
    if (kind === 'bill')
      return (
        <BillForm
          key={formKey}
          isOpen
          title='Bill'
          draft={sinkFor<'bill'>(value as BudgetValues['bill'])}
          onClose={close}
        />
      );
    if (kind === 'envelope')
      return (
        <EnvelopeForm
          key={formKey}
          isOpen
          title='Envelope'
          draft={sinkFor<'envelope'>(value as BudgetValues['envelope'])}
          onClose={close}
        />
      );
    return (
      <GoalForm
        key={formKey}
        isOpen
        title='Goal'
        draft={sinkFor<'goal'>(value as BudgetValues['goal'])}
        onClose={close}
      />
    );
  };

  const notRead = data.notRead;
  const selectedRow = selectedProposal ? toProposalRow(selectedProposal) : null;
  const isFolded = isShort && needing > 0;
  const selectedMissing =
    selectedProposal === null
      ? []
      : getMissingSteps(selectedProposal.kind, selectedProposal.value);
  const isSelectedUndecided = selectedProposal?.isUndecided ?? false;
  const isSelectedNeedy = isSelectedUndecided || selectedMissing.length > 0;
  const hasIncome = proposals.some((proposal) => proposal.kind === 'income');
  const selectedCadence =
    selectedProposal?.cadence != null && selectedMissing.includes('repeats')
      ? selectedProposal.cadence
      : null;
  const notice =
    error || canStartFresh ? (
      <div ref={noticeRef} className='scroll-mt-16 space-y-2'>
        {error && (
          <p className='text-destructive text-sm text-pretty' role='alert'>
            {error}
          </p>
        )}
        {canStartFresh && (
          <Button
            type='button'
            variant='secondary'
            className='w-full justify-between'
            onClick={onStartFresh}
          >
            {BUDGET_WORDS.freshInstead}
            <ChevronRight className='h-4 w-4' aria-hidden='true' />
          </Button>
        )}
      </div>
    ) : null;

  if (phase === 'input') {
    return (
      <div className='flex flex-1 flex-col gap-4'>
        <div className='space-y-1'>
          <h2 className='text-2xl font-semibold text-balance'>
            {BUDGET_WORDS.ask}
          </h2>
          <p className='text-muted-foreground text-sm text-pretty'>
            {reading === null
              ? BUDGET_WORDS.help
              : BUDGET_WORDS.addAnotherBody(slotsLeft)}
          </p>
        </div>
        {notice}
        <div className='space-y-3'>
          {files.length > 0 && (
            <ul className='border-border bg-card divide-border divide-y rounded-2xl border'>
              {files.map((file) => (
                <li
                  key={`${file.name}-${file.size}`}
                  className='flex items-center gap-3 px-3 py-2'
                >
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-medium'>{file.name}</p>
                    <p className='text-muted-foreground text-xs'>
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='icon'
                    aria-label={BUDGET_WORDS.removeFile(file.name)}
                    disabled={isReading}
                    className="relative size-7 p-0 before:absolute before:-inset-1.5 before:content-['']"
                    onClick={() =>
                      setFiles((current) => current.filter((f) => f !== file))
                    }
                  >
                    <X className='h-4 w-4' aria-hidden='true' />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {slotsLeft > 0 && (
            <div className='flex items-center gap-2'>
              <Button
                type='button'
                variant='secondary'
                className='flex-1 gap-2'
                disabled={isReading}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className='h-4 w-4' aria-hidden='true' />
                {files.length > 0
                  ? BUDGET_WORDS.chooseMore
                  : BUDGET_WORDS.chooseFiles}
              </Button>
              <HelpTip title={BUDGET_WORDS.tabsTitle}>
                {BUDGET_WORDS.tabsHint}
              </HelpTip>
            </div>
          )}
          <p className='text-muted-foreground text-xs text-pretty'>
            {BUDGET_WORDS.accepts} · up to {BUDGET_LIMITS.bytes / 1024 / 1024}{' '}
            MB together
          </p>
          <Input
            ref={fileRef}
            type='file'
            multiple
            accept={BUDGET_ACCEPT}
            aria-label={BUDGET_WORDS.chooseFiles}
            className='hidden'
            onChange={(event) => {
              pick(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          <Field label={BUDGET_WORDS.pasteLabel} isCompact>
            {() => (
              <Textarea
                rows={3}
                variant='outline'
                className='min-h-20 sm:[@media(min-height:700px)]:min-h-32'
                placeholder={BUDGET_WORDS.pastePlaceholder}
                maxLength={BUDGET_LIMITS.textChars}
                disabled={isReading}
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
              />
            )}
          </Field>
        </div>
        <ModalFooterActions
          note={
            isReading ? (
              <span className='flex items-center gap-2'>
                <Loader className='h-4 w-4 animate-spin' aria-hidden='true' />
                {BUDGET_WORDS.reading(files.length, pasted.trim() !== '')}
              </span>
            ) : hasInput || isShort ? null : (
              BUDGET_WORDS.needInput
            )
          }
          cancelAction={
            <Button type='button' variant='secondary' onClick={stepBack}>
              Back
            </Button>
          }
          rightActions={
            <Button
              type='button'
              disabled={isReading || !hasInput}
              onClick={() => void read()}
            >
              {BUDGET_WORDS.read}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <div className='space-y-1'>
        <h2 className='text-2xl font-semibold text-balance'>
          {BUDGET_WORDS.reviewAsk}
        </h2>
        <p className='text-muted-foreground text-sm text-pretty'>
          {BUDGET_WORDS.reviewHelp}
          {proposals.length > 0 && !hasIncome && ` ${BUDGET_WORDS.noIncome}`}
        </p>
      </div>
      {notice}
      {proposals.length === 0 && (
        <p className='text-muted-foreground text-sm'>{BUDGET_WORDS.empty}</p>
      )}
      {KINDS.map(({ kind, label, search }) => {
        const list = ofKind(kind);
        const rows =
          kind === 'bill'
            ? toForRows(list, GROUP_WORDS.ungrouped, toProposalRow, emojiOf)
            : kind === 'envelope'
              ? toForRows(
                  list,
                  GROUP_WORDS.ungroupedEnvelopes,
                  toProposalRow,
                  emojiOf,
                )
              : kind === 'income'
                ? toPayerRows(list, toProposalRow)
                : list.map(toProposalRow);
        const isFor = kind === 'bill' || kind === 'envelope';
        const hasFor =
          isFor && list.some((proposal) => proposal.forName !== null);
        const isHelpHere =
          hasFor &&
          (kind === 'bill' ||
            !ofKind('bill').some((proposal) => proposal.forName !== null));
        return list.length === 0 ? null : (
          <div key={kind} className='space-y-2'>
            <SectionDivider
              label={label}
              trailing={
                isHelpHere ? (
                  <HelpTip title={FORM_FLOW_WORDS.groupTitle}>
                    <p>{FORM_FLOW_WORDS.groupHelp}</p>
                  </HelpTip>
                ) : undefined
              }
            />
            <StartRowList
              rows={rows}
              searchLabel={search}
              onOpen={setSelected}
              getHeadingEmoji={hasFor ? emojiOf : undefined}
              renderHeadingAction={
                hasFor
                  ? (group) =>
                      group === GROUP_WORDS.ungrouped ||
                      group === GROUP_WORDS.ungroupedEnvelopes ? null : (
                        <Button
                          type='button'
                          variant='tertiary'
                          size='sm'
                          className="relative px-1.5! before:absolute before:-inset-1.5 before:content-['']"
                          aria-label={BUDGET_WORDS.forActions(group)}
                          onClick={() => setRenaming({ name: group, kind })}
                        >
                          <Pencil className='h-4 w-4' aria-hidden='true' />
                        </Button>
                      )
                  : undefined
              }
            />
          </div>
        );
      })}
      {readFiles.length < BUDGET_LIMITS.files && (
        <div>
          <RevealChip
            icon={<Upload className='h-4 w-4' aria-hidden='true' />}
            onClick={() => goTo('input')}
          >
            {BUDGET_WORDS.addAnother}
          </RevealChip>
        </div>
      )}
      {notRead.length > 0 && (
        <div>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className="text-muted-foreground! relative -ml-2 gap-1.5 after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']"
            onClick={() => setIsNotReadOpen(true)}
          >
            <CircleHelp className='h-4 w-4' aria-hidden='true' />
            {BUDGET_WORDS.notReadRow(notRead.length)}
            <ChevronRight className='h-4 w-4' aria-hidden='true' />
          </Button>
        </div>
      )}
      <ModalFooterActions
        note={
          needing > 0 && !isFolded
            ? BUDGET_WORDS.needDetails(needing)
            : needing === 0 && undated > 0 && !isShort
              ? BUDGET_WORDS.dueLaterNote(undated)
              : null
        }
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            disabled={isAdding}
            onClick={stepBack}
          >
            Back
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isAdding}
            disabled={isAdding || proposals.length === 0 || needing > 0}
            onClick={() => void add()}
          >
            {isFolded
              ? BUDGET_WORDS.needDetailsShort(needing)
              : BUDGET_WORDS.planAdd}
          </Button>
        }
      />
      <DetailSheet
        isOpen={isNotReadOpen}
        onClose={() => setIsNotReadOpen(false)}
        title={BUDGET_WORDS.notReadTitle}
      >
        <ul className='space-y-3'>
          {[...new Set(notRead.map((entry) => entry.file))].map((file) => (
            <li key={file}>
              <p className='text-sm font-medium'>{file}</p>
              <ul className='list-disc pl-5 text-sm'>
                {notRead
                  .filter((entry) => entry.file === file)
                  .map((entry) => (
                    <li key={entry.text}>{entry.text}</li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </DetailSheet>
      <DetailSheet
        isOpen={selectedProposal !== null}
        onClose={() => setSelected(null)}
        title={selectedProposal?.name ?? ''}
        actions={<ValuesEyeButton />}
      >
        <div className='space-y-3'>
          {selectedProposal && selectedRow && !isSelectedNeedy && (
            <SheetHead
              label={BUDGET_WORDS.sheetKind[selectedProposal.kind]}
              isLabelDroppedWhenShort
              figure={selectedRow.amount ?? undefined}
              fact={selectedRow.line}
            />
          )}
          {selectedProposal && isSelectedNeedy && (
            <InlineNotice
              tone='warning'
              title={
                selectedRow?.amount && !isSelectedUndecided ? (
                  <MaskedText>{selectedRow.amount}</MaskedText>
                ) : undefined
              }
            >
              {isSelectedUndecided ? (
                selectedProposal.isReopened ? (
                  BUDGET_WORDS.chooseVersionAgain
                ) : (
                  BUDGET_WORDS.chooseVersion
                )
              ) : (
                <MaskedText>
                  {toNeeds(selectedProposal, selectedMissing)}
                </MaskedText>
              )}
            </InlineNotice>
          )}
          {selectedProposal && (
            <div className='space-y-1 text-sm'>
              {!isSelectedUndecided && (
                <p className='text-muted-foreground'>
                  {BUDGET_WORDS.sourcePrefix} {selectedProposal.sourceFile}
                </p>
              )}
              {selectedCadence !== null && (
                <p className='text-pretty'>
                  <MaskedText>
                    {toCadenceNote(selectedProposal) ?? ''}
                  </MaskedText>
                </p>
              )}
              {selectedProposal.monthlyCents !== null && (
                <p className='text-pretty'>
                  <MaskedText>
                    {BUDGET_WORDS.goalMonthly(
                      formatCents(selectedProposal.monthlyCents),
                    )}
                  </MaskedText>
                </p>
              )}
            </div>
          )}
          {selectedProposal && isSelectedUndecided && (
            <div className='space-y-2'>
              {isHidden && (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  className='gap-1.5'
                  onClick={toggleHidden}
                >
                  <Eye className='h-4 w-4' aria-hidden='true' />
                  {BUDGET_WORDS.showToCompare}
                </Button>
              )}
              <ul className='space-y-2'>
                {selectedProposal.versions.map((version) => (
                  <li
                    key={version.sourceFile}
                    className='border-border bg-card flex items-center gap-3 rounded-2xl border p-3'
                  >
                    <div className='min-w-0 flex-1 text-sm text-pretty break-words'>
                      {selectedProposal.isReopened &&
                        JSON.stringify(version.value) ===
                          JSON.stringify(selectedProposal.value) && (
                          <span className='bg-accent text-accent-foreground mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium'>
                            {BUDGET_WORDS.yourChoice}
                          </span>
                        )}
                      <p>
                        <MaskedText>{version.says}</MaskedText>
                      </p>
                    </div>
                    <Button
                      type='button'
                      variant='secondary'
                      size='sm'
                      className="relative before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
                      onClick={() => setValue(selectedProposal, version.value)}
                    >
                      {BUDGET_WORDS.useThis}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {selectedProposal &&
            (selectedProposal.kind === 'bill' ||
              selectedProposal.kind === 'envelope') &&
            forNameList.length > 0 && (
              <div className='space-y-2'>
                <p className='text-muted-foreground text-xs'>
                  {FORM_FLOW_WORDS.groupTitle}
                </p>
                <PillGroup
                  label={FORM_FLOW_WORDS.groupTitle}
                  options={[
                    ...forNameList.map((name) => ({
                      value: name,
                      label: name,
                    })),
                    { value: '', label: FORM_FLOW_WORDS.clearGroup },
                  ]}
                  value={selectedProposal.forName ?? ''}
                  onChange={(name) => {
                    setFor([selectedProposal.key], () =>
                      name === '' ? null : name,
                    );
                    setSelected(null);
                  }}
                />
              </div>
            )}
          <ActionGroup isRoomy={!isShort}>
            {selectedProposal && selectedCadence?.perMonthCents != null && (
              <ActionRow
                isGrouped
                isRoomy={!isShort}
                icon={<Repeat />}
                label={mask(
                  BUDGET_WORDS.monthlyOffer(
                    formatCents(selectedCadence.perMonthCents),
                  ),
                )}
                subtitle={BUDGET_WORDS.monthlyOfferSub}
                onClick={() =>
                  setValue(selectedProposal, selectedCadence.monthly)
                }
              />
            )}
            {selectedProposal &&
              (selectedProposal.kind === 'bill' ||
                selectedProposal.kind === 'envelope' ||
                selectedProposal.kind === 'income') && (
                <ActionRow
                  isGrouped
                  isRoomy={!isShort}
                  icon={<Tag />}
                  label={
                    selectedProposal.kind === 'income'
                      ? BUDGET_WORDS.changePayer
                      : forNameList.length > 0
                        ? BUDGET_WORDS.forSomethingElse
                        : BUDGET_WORDS.changeFor
                  }
                  subtitle={
                    selectedProposal.kind === 'income'
                      ? (selectedProposal.value as BudgetValues['income'])
                          .sourceName
                      : forNameList.length > 0
                        ? undefined
                        : FORM_FLOW_WORDS.noGroup
                  }
                  hasChevron
                  onClick={() => {
                    setForm((current) => ({
                      key: selectedProposal.key,
                      token: (current?.token ?? 0) + 1,
                      step:
                        selectedProposal.kind === 'income' ? 'source' : 'group',
                    }));
                    setSelected(null);
                  }}
                />
              )}
            <ActionRow
              isGrouped
              isRoomy={!isShort}
              icon={<Pencil />}
              label={BUDGET_WORDS.openToChange}
              hasChevron
              onClick={() => {
                if (!selected) return;
                setForm((current) => ({
                  key: selected,
                  token: (current?.token ?? 0) + 1,
                  step: null,
                }));
                setSelected(null);
              }}
            />
            <ActionRow
              isGrouped
              isRoomy={!isShort}
              isDestructive
              icon={<Trash2 />}
              label={BUDGET_WORDS.removeOne}
              onClick={() => {
                if (selected)
                  setRemoved((current) => new Set([...current, selected]));
                setSelected(null);
              }}
            />
          </ActionGroup>
        </div>
      </DetailSheet>
      {renderForm()}
      {renaming !== null && (
        <ForRenameSheet
          key={renaming.name}
          name={renaming.name}
          emoji={emojiOf(renaming.name)}
          onClose={() => setRenaming(null)}
          onDone={(name, emoji) => {
            renameFor(renaming.name, name, emoji);
            setRenaming(null);
          }}
          onTakeOut={() => {
            takeOut(renaming.kind, renaming.name);
            setRenaming(null);
          }}
        />
      )}
    </div>
  );
}

export default BudgetStart;

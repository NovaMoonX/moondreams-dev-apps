import { useRef, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  Archive,
  CalendarDays,
  Pencil,
  Receipt,
  Smile,
  Wallet,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import DateInput from '@/components/DateInput';
import EmojiField from '@/components/EmojiField';
import FormSheet from '@/components/FormSheet';
import HelpTip from '@/components/HelpTip';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import SensitiveValue from '@/components/SensitiveValue';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useStore } from 'react-redux';

import { useAppSelector, type RootState } from '@/store';
import { resolveItemEmoji } from '@apps/runway/utils/purposeEmoji';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import { isCountedAt } from '@apps/runway/hooks/usePriorityDial';
import {
  fundingAtLevel,
  getExtras,
  withExtras,
} from '@apps/runway/engine/parts';
import {
  BILL_WORDS,
  FORM_FLOW_WORDS,
  GROUP_WORDS,
  ITEM_SHEET_R2_WORDS,
  PRIORITY_DIAL_WORDS,
  MAX_EMOJI_LENGTH,
  MAX_NAME_LENGTH,
  PRIORITIES,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import SheetHead from '@apps/runway/components/SheetHead';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import { MaskedText } from '@apps/runway/components/MaskedText';
import BillForm from '@apps/runway/forms/BillForm';
import EnvelopeForm from '@apps/runway/forms/EnvelopeForm';
import ItemRow from '@apps/runway/components/ItemRow';
import {
  useGroupFigures,
  useIncomeDaysPerMonth,
} from '@apps/runway/hooks/useGroupFigures';
import GroupTotalHelp from '@apps/runway/components/GroupTotalHelp';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  archiveItem,
  changeItem,
  MAX_REORDER_WRITES,
  setGroupPriority,
} from '@apps/runway/store/actions/itemActions';
import {
  selectBillPayments,
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectGroups,
  selectStance,
  selectAllPurposeEmojis,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { GroupTotal } from '@apps/runway/engine/groups';
import {
  getVersionStretches,
  isSameValue,
  type VersionStretch,
} from '@apps/runway/engine/resolve';
import { toOrdinal } from '@apps/runway/utils/monthDays';
import { getNextTierRank } from '@apps/runway/engine/priorities';
import {
  getSectionPick,
  planGroupPriority,
  withSectionPick,
  type GroupPriorityChange,
  type GroupSection,
} from '@apps/runway/utils/groupPriority';
import type {
  BillSealed,
  BillVersion,
  EnvelopeSealed,
  EnvelopeVersion,
  GroupSealed,
  Priority,
  Schedule,
} from '@apps/runway/types';
import {
  describeBillMonthly,
  describeEnvelopeMonthly,
  joinPaymentAndState,
  describeBillRepeat,
  describeGroupLead,
  describeGroupTotal,
} from '@apps/runway/utils/billText';
import {
  describeCadenceLine,
  describeFundingShort,
  describeExtras,
} from '@apps/runway/utils/fundingText';
import { resolveGroupRename } from '@apps/runway/utils/groupChoice';
import { getCardNamer } from '@apps/runway/utils/cardText';
import { describeChange } from '@apps/runway/utils/changeText';

type StartingChoice = Priority | 'none';
type PriorityRow = 'all' | GroupSection;

/** How many changes a priority's confirmation names before it counts the rest. */
const PRIORITY_CONFIRM_ROWS = 6;

interface DueWritten {
  itemId: string;
  name: string;
  original: VersionStretch<BillSealed>[];
  written: VersionStretch<BillSealed>[];
}

interface GroupSheetProps {
  groupId: string;
  today: number;
  dial: Priority;
  onClose: () => void;
}

const startingOptions = [
  ...PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] })),
  { value: 'none' as const, label: GROUP_WORDS.noPriority },
];

/** Repeats whose dates come from the due date alone; a twice-a-month or irregular bill, or one that ends after a count, keeps its own. */
const SETTABLE_KINDS: readonly string[] = [
  'once',
  'weekly',
  'everyOtherWeek',
  'monthly',
];

/** What a name is for, as a sheet: what its bills and envelopes come to a usual month, which they are, adding one, its name, the priority a new one starts with, and stopping its use. */
const getWeekday = (date: number) =>
  new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });

/** What a repeating bill's new day means for it ("Monthly bills then repeat on the 5th"), or null when none repeats. */
const describeRepeatsOn = (kinds: string[], date: number): string | null => {
  const notes = [
    kinds.includes('monthly')
      ? `Monthly bills then repeat on the ${toOrdinal(new Date(date).getUTCDate())} of each month.`
      : null,
    kinds.includes('weekly')
      ? `Weekly bills then repeat every ${getWeekday(date)}.`
      : null,
    kinds.includes('everyOtherWeek')
      ? `Bills every other week then repeat every other ${getWeekday(date)}.`
      : null,
  ].filter((note): note is string => note !== null);
  return notes.length === 0 ? null : notes.join(' ');
};

function GroupSheet({ groupId, today, dial, onClose }: GroupSheetProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { isHidden } = useValuesHidden();
  const stance = useAppSelector(selectStance);
  const purposeEmojis = useAppSelector(selectAllPurposeEmojis);
  const group = useAppSelector((state) =>
    selectGroups(state, today).find(({ item }) => item.id === groupId),
  );
  const [isRenaming, setIsRenaming] = useState(false);
  const [isPickingEmoji, setIsPickingEmoji] = useState(false);
  const [emoji, setEmoji] = useState('');
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priorityNote, setPriorityNote] = useState<{
    row: PriorityRow;
    text: string;
    isError: boolean;
  } | null>(null);
  const [pendingPriority, setPendingPriority] = useState<{
    row: PriorityRow;
    choice: StartingChoice;
  } | null>(null);
  const allGroups = useAppSelector((state) => selectGroups(state, today));
  const figures = useGroupFigures(today, dial).find(({ id }) => id === groupId);
  const getIncomeDays = useIncomeDaysPerMonth(today);
  const [adding, setAdding] = useState<'bill' | 'envelope' | null>(null);
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const [isSettingDue, setIsSettingDue] = useState(false);
  const [dueText, setDueText] = useState('');
  const [dueRecord, setDueRecord] = useState<{
    note: string;
    undo: DueWritten[] | null;
  } | null>(null);
  const store = useStore<RootState>();
  const handledUndos = useRef(new WeakSet<DueWritten[]>());
  const [isUndoingDue, setIsUndoingDue] = useState(false);
  const isApplyingPriority = useRef(false);
  const allVersions = useAppSelector((state) => state.runway.versions);

  if (!group || !figures) return null;
  const {
    total,
    billsTotal,
    envelopesTotal,
    bills,
    envelopes,
    names: memberNames,
  } = figures;
  const billCount = bills.length;
  const envelopeCount = envelopes.length;
  const memberCount = billCount + envelopeCount;
  const payload = group.version.payload;
  const hasRange = !isHidden && total.total.lowCents !== total.total.highCents;

  const getLivePayload = () =>
    selectGroups(store.getState(), today).find(
      ({ item }) => item.id === groupId,
    )?.version.payload ?? payload;

  const save = async (
    next: GroupSealed,
    isQuiet = false,
    before: GroupSealed = payload,
  ): Promise<string | null> => {
    if (!user) return null;
    if (!isQuiet) setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await changeItem(user.uid, encryption, {
        itemId: groupId,
        kind: 'group',
        payload: next,
        summary: `${next.name}: ${describeChange(before, next, getCardNamer([])) || 'Updated'}, from ${formatDateOrdinalUTC(today)}.`,
        note: null,
        effectiveFrom: today,
      });
      return null;
    } catch (saveError) {
      return getErrorMessage(saveError, GROUP_WORDS.saveFailed);
    } finally {
      if (!isQuiet) setIsSaving(false);
    }
  };

  const rename = async (next: string) => {
    setError(null);
    const renamed = resolveGroupRename(
      next,
      groupId,
      allGroups.map(({ item, version }) => ({
        id: item.id,
        name: version.payload.name,
      })),
    );
    if (renamed.kind === 'taken') {
      setError(GROUP_WORDS.nameTaken(renamed.name));
      return;
    }
    if (renamed.name === payload.name) {
      setIsRenaming(false);
      return;
    }
    const failure = await save({ ...payload, name: renamed.name });
    if (failure === null) setIsRenaming(false);
    else setError(failure);
  };

  const saveEmoji = async (next: string | null) => {
    setError(null);
    if (next === payload.emoji) {
      setIsPickingEmoji(false);
      return;
    }
    const failure = await save({ ...payload, emoji: next });
    if (failure === null) setIsPickingEmoji(false);
    else setError(failure);
  };

  const getMemberStretches = (
    versions: RootState['runway']['versions'],
    kind: 'bill' | 'envelope',
    itemId: string,
    from = today,
  ): VersionStretch<BillSealed | EnvelopeSealed>[] =>
    kind === 'bill'
      ? getVersionStretches<BillVersion, BillSealed>(
          versions.filter((v): v is BillVersion => v.kind === 'bill'),
          itemId,
          from,
        )
      : getVersionStretches<EnvelopeVersion, EnvelopeSealed>(
          versions.filter((v): v is EnvelopeVersion => v.kind === 'envelope'),
          itemId,
          from,
        );

  const sectionsOf = (row: PriorityRow): GroupSection[] =>
    row === 'all' ? ['bill', 'envelope'] : [row];

  type MemberRow = (typeof bills)[number] | (typeof envelopes)[number];

  const planPriority = (
    source: {
      versions: RootState['runway']['versions'];
      bills: readonly MemberRow[];
      envelopes: readonly MemberRow[];
    },
    sections: readonly GroupSection[],
    choice: Priority,
    firstRank: number,
  ) => {
    const toMember =
      (kind: GroupSection) =>
      ({ item, version }: MemberRow) => ({
        kind,
        itemId: item.id,
        name: version.payload.name,
        stretches: getMemberStretches(source.versions, kind, item.id),
      });
    return planGroupPriority(
      [
        ...(sections.includes('bill')
          ? source.bills.map(toMember('bill'))
          : []),
        ...(sections.includes('envelope')
          ? source.envelopes.map(toMember('envelope'))
          : []),
      ],
      choice,
      firstRank,
    );
  };

  /** The group's members and every stretch of each as the store holds them now, so a write after a confirm sees edits made meanwhile. */
  const planPriorityNow = (
    sections: readonly GroupSection[],
    choice: Priority,
  ) => {
    const state = store.getState();
    const liveBills = selectBills(state, today);
    const liveEnvelopes = selectEnvelopes(state, today);
    const isMember = ({ version }: MemberRow) =>
      version.payload.groupId === groupId;
    return planPriority(
      {
        versions: state.runway.versions,
        bills: liveBills.filter(isMember),
        envelopes: liveEnvelopes.filter(isMember),
      },
      sections,
      choice,
      getNextTierRank(
        [...liveBills, ...liveEnvelopes, ...selectGoals(state, today)],
        choice,
      ),
    );
  };

  /** One line of a priority's confirmation; the dialog sits outside the sheet, so amounts are left out while hidden. */
  const describePriorityChange = (
    change: GroupPriorityChange,
    label: string,
    isMasked: boolean,
  ): string => {
    const { folded } = change;
    if (folded === null)
      return GROUP_WORDS.priorityMoves(
        change.name,
        change.wasPriority === null
          ? label
          : PRIORITY_LABELS[change.wasPriority],
        label,
      );
    const parts = [
      { cents: folded.cents, tier: folded.priority },
      ...folded.extras,
    ].map(({ cents, tier }) =>
      isMasked
        ? PRIORITY_LABELS[tier]
        : `${formatCents(cents)} ${PRIORITY_LABELS[tier]}`,
    );
    const fold = GROUP_WORDS.priorityFolds(
      change.name,
      label,
      isMasked ? null : formatCents(folded.totalCents),
      parts,
    );
    return change.wasPriority === null || change.wasPriority === folded.priority
      ? fold
      : GROUP_WORDS.priorityAlsoMoves(
          fold,
          PRIORITY_LABELS[change.wasPriority],
          label,
        );
  };

  const pickPriority = async (row: PriorityRow, choice: StartingChoice) => {
    if (!user || isApplyingPriority.current) return;
    isApplyingPriority.current = true;
    try {
      const sections = sectionsOf(row);
      const readPlan = () => {
        const live = getLivePayload();
        const next = withSectionPick(
          live,
          sections,
          choice === 'none' ? null : choice,
        );
        const isPickSame = sections.every(
          (section) =>
            getSectionPick(live, section) === getSectionPick(next, section),
        );
        const changes =
          choice === 'none' ? [] : planPriorityNow(sections, choice);
        const writeCount =
          (isPickSame ? 0 : 1) +
          changes.reduce((sum, { written }) => sum + written.length, 0);
        const key = JSON.stringify([
          next,
          changes.map(({ itemId, written }) => [itemId, written]),
        ]);
        return { live, next, isPickSame, changes, writeCount, key };
      };
      const plan = readPlan();
      const { changes } = plan;
      const label =
        choice === 'none' ? GROUP_WORDS.noPriority : PRIORITY_LABELS[choice];
      const scope = GROUP_WORDS.priorityScope(row, payload.name);
      if (changes.length === 0 && plan.isPickSame) {
        setPriorityNote(
          choice === 'none'
            ? null
            : {
                row,
                text: GROUP_WORDS.priorityAlready(scope, label),
                isError: false,
              },
        );
        return;
      }
      if (plan.writeCount > MAX_REORDER_WRITES) {
        setPriorityNote({
          row,
          text: GROUP_WORDS.priorityTooMany,
          isError: true,
        });
        return;
      }
      if (changes.length > 0) {
        const shown = changes.slice(0, PRIORITY_CONFIRM_ROWS);
        const isConfirmed = await confirm({
          title: GROUP_WORDS.priorityConfirmTitle(scope, label),
          message: (
            <div className='space-y-2 text-left text-sm'>
              <p>{GROUP_WORDS.priorityConfirmLead(label)}</p>
              <ul className='list-disc space-y-1 pl-5'>
                {shown.map((change) => (
                  <li key={change.itemId}>
                    {describePriorityChange(change, label, isHidden)}
                  </li>
                ))}
              </ul>
              {changes.length > shown.length && (
                <p className='text-muted-foreground'>
                  {GROUP_WORDS.priorityConfirmMore(
                    changes.length - shown.length,
                  )}
                </p>
              )}
            </div>
          ),
          confirmText: GROUP_WORDS.priorityConfirm(label),
        });
        if (!isConfirmed) return;
      }
      setPriorityNote(null);
      setPendingPriority({ row, choice });
      const encryption = await getRunwayEncryption(user.uid);
      const fresh = readPlan();
      if (fresh.key !== plan.key) {
        setPriorityNote({
          row,
          text: GROUP_WORDS.priorityMoved,
          isError: true,
        });
        return;
      }
      const { live, next, isPickSame, changes: written } = fresh;
      const date = formatDateOrdinalUTC(today);
      await setGroupPriority(user.uid, encryption, {
        groupId,
        group: isPickSame ? null : next,
        members: written.map((change) => ({
          itemId: change.itemId,
          kind: change.kind,
          stretches: change.written,
        })),
        summary:
          written.length === 0
            ? `${next.name}: ${describeChange(live, next, getCardNamer([])) || 'Updated'}, from ${date}.`
            : GROUP_WORDS.prioritySummary(
                label,
                next.name,
                written.map((change) =>
                  describePriorityChange(change, label, false),
                ),
                date,
              ),
        effectiveFrom: today,
      });
      setPriorityNote({
        row,
        text:
          choice === 'none'
            ? GROUP_WORDS.priorityNoneSet(row, payload.name)
            : written.length === 0
              ? GROUP_WORDS.priorityAlready(scope, label)
              : GROUP_WORDS.priorityDone(written.length, label),
        isError: false,
      });
    } catch (pickError) {
      setPriorityNote({
        row,
        text: getErrorMessage(pickError, GROUP_WORDS.priorityFailed),
        isError: true,
      });
    } finally {
      isApplyingPriority.current = false;
      setPendingPriority(null);
    }
  };

  const archive = async () => {
    if (!user) return;
    const isConfirmed = await confirm({
      title: GROUP_WORDS.archiveTitle(payload.name),
      message: GROUP_WORDS.archiveBody(billCount, envelopeCount),
      confirmText: GROUP_WORDS.archive(payload.name),
      destructive: true,
    });
    if (!isConfirmed) return;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await archiveItem(
        user.uid,
        encryption,
        {
          itemId: groupId,
          summary: GROUP_WORDS.archived(payload.name, billCount, envelopeCount),
          note: null,
          heldChoice: null,
        },
        today,
      );
      addToast({
        title: GROUP_WORDS.archivedToast(payload.name),
        type: 'success',
      });
      onClose();
    } catch (archiveError) {
      setError(getErrorMessage(archiveError, GROUP_WORDS.archiveFailed));
      setIsSaving(false);
    }
  };

  const presentSections: GroupSection[] = [
    ...(billCount > 0 ? (['bill'] as const) : []),
    ...(envelopeCount > 0 ? (['envelope'] as const) : []),
  ];
  const priorityRows: PriorityRow[] =
    presentSections.length === 1
      ? presentSections
      : ['all', ...presentSections];
  const getRowValue = (row: PriorityRow): StartingChoice | 'mixed' => {
    if (pendingPriority?.row === row) return pendingPriority.choice;
    const picks = sectionsOf(row).map(
      (section) => getSectionPick(payload, section) ?? 'none',
    );
    return picks.every((pick) => pick === picks[0]) ? picks[0] : 'mixed';
  };
  /** The pick a row stands for: a section's own, or for Everything the one both sections share. */
  const getRowPick = (row: PriorityRow): Priority | null => {
    if (row !== 'all') return getSectionPick(payload, row);
    const bill = getSectionPick(payload, 'bill');
    return bill === getSectionPick(payload, 'envelope') ? bill : null;
  };
  /** Who a row covers that is not at its pick, from the live plan; Everything carries it when both sections share one, so the section rows do not repeat it. */
  const getOffPick = (row: PriorityRow): string[] => {
    if (pendingPriority !== null) return [];
    if (
      row !== 'all' &&
      priorityRows.includes('all') &&
      getRowPick('all') !== null
    )
      return [];
    const pick = getRowPick(row);
    if (pick === null) return [];
    return planPriority(
      { versions: allVersions, bills, envelopes },
      sectionsOf(row),
      pick,
      0,
    ).map(({ name }) => name);
  };

  const dueDate = fromDateInputValue(dueText);
  const isPaidOnce = ({ item, version }: (typeof bills)[number]) =>
    version.payload.timing.schedule.kind === 'once' &&
    (payments[item.id] ?? []).some((payment) => payment.paid);
  const billVersions = allVersions.filter(
    (version): version is BillVersion => version.kind === 'bill',
  );
  const getStretches = (
    versions: readonly BillVersion[],
    itemId: string,
    from = today,
  ) => getVersionStretches<BillVersion, BillSealed>(versions, itemId, from);
  const isSettable = ({ item }: (typeof bills)[number]) => {
    const stretches = getStretches(billVersions, item.id);
    return (
      stretches.length > 0 &&
      stretches.every(
        ({ payload: bill }) =>
          SETTABLE_KINDS.includes(bill.timing.schedule.kind) &&
          bill.ending.afterCount === null,
      )
    );
  };
  const isSameDue = ({ item }: (typeof bills)[number]) =>
    dueDate !== undefined &&
    getStretches(billVersions, item.id).every(({ payload: bill }) => {
      const { schedule } = bill.timing;
      if (schedule.anchor === null) return false;
      if (schedule.anchor === dueDate) return true;
      return (
        schedule.kind === 'monthly' &&
        schedule.anchor <= dueDate &&
        schedule.monthDays[0] === new Date(dueDate).getUTCDate()
      );
    });
  const endsBefore = ({ item }: (typeof bills)[number]) =>
    dueDate !== undefined &&
    getStretches(billVersions, item.id).some(
      ({ payload: bill }) =>
        bill.ending.onDate !== null && bill.ending.onDate < dueDate,
    );
  const eligibleBills = bills.filter(
    (bill) => isSettable(bill) && !isPaidOnce(bill) && !endsBefore(bill),
  );
  const changingBills = eligibleBills.filter((bill) => !isSameDue(bill));
  const replacedBills = changingBills.filter(
    ({ version }) => version.payload.timing.schedule.anchor !== null,
  );
  const isPast = dueDate !== undefined && dueDate < today;
  const skippedCount = billCount - eligibleBills.length;

  const describeBillDue = (
    schedule: Schedule,
    due: number | null,
    payment: string | null,
  ) =>
    due === null
      ? payment
        ? joinPaymentAndState(payment, BILL_WORDS.needsDueDate)
        : BILL_WORDS.needsDueDate
      : payment
        ? joinPaymentAndState(payment, `Due\u00a0${formatDateOrdinalUTC(due)}`)
        : `Due\u00a0${formatDateOrdinalUTC(due)}\u00a0· ${describeBillRepeat(schedule)}`;
  const getCurrentDue = ({ item, version }: (typeof bills)[number]) =>
    (payments[item.id] ?? []).find((entry) => entry.dueOn >= today)?.dueOn ??
    version.payload.timing.schedule.anchor;
  const settableBills = bills.filter(
    (bill) => isSettable(bill) && !isPaidOnce(bill),
  );

  const undoDueDates = async (written: DueWritten[]) => {
    if (!user || handledUndos.current.has(written)) return;
    handledUndos.current.add(written);
    setIsUndoingDue(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const state = store.getState();
      const liveVersions = state.runway.versions.filter(
        (version): version is BillVersion => version.kind === 'bill',
      );
      const isUntouched = (entry: (typeof written)[number]) =>
        isSameValue(
          getStretches(
            liveVersions,
            entry.itemId,
            entry.written[0].effectiveFrom,
          ),
          entry.written,
        );
      const untouched = written.filter(isUntouched);
      const stale = written
        .filter((entry) => !isUntouched(entry))
        .map((entry) => entry.name);
      const results = await Promise.allSettled(
        untouched.map((entry) =>
          changeItem(user.uid, encryption, {
            itemId: entry.itemId,
            kind: 'bill',
            payload: entry.original[0].payload,
            summary: GROUP_WORDS.dueSummary(
              entry.name,
              describeChange(
                entry.written[0].payload,
                entry.original[0].payload,
                getCardNamer([]),
              ) || 'Updated',
              formatDateOrdinalUTC(today),
            ),
            note: null,
            effectiveFrom: today,
            stretches: entry.original,
          }),
        ),
      );
      const failed = untouched.flatMap((entry, index) =>
        results[index].status === 'rejected' ? [entry.name] : [],
      );
      const done = untouched.length - failed.length;
      const isClean = failed.length === 0 && stale.length === 0;
      const title = isClean
        ? GROUP_WORDS.dueUndone
        : GROUP_WORDS.dueUndoPartial(done, written.length, [
            ...failed,
            ...stale,
          ]);
      const description =
        stale.length === 0 ? undefined : GROUP_WORDS.dueUndoStale(stale);
      setDueRecord({
        note: description ? `${title} ${description}` : title,
        undo: null,
      });
      addToast({
        title,
        description,
        type: isClean ? 'success' : 'error',
      });
    } catch (undoError) {
      const message = getErrorMessage(undoError, GROUP_WORDS.dueUndoFailed);
      handledUndos.current.delete(written);
      setDueRecord({ note: message, undo: written });
      addToast({ title: message, type: 'error' });
    } finally {
      setIsUndoingDue(false);
    }
  };

  const setDueDate = async () => {
    if (!user || dueDate === undefined) return;
    if (replacedBills.length > 0) {
      const isConfirmed = await confirm({
        title: GROUP_WORDS.dueReplaceTitle,
        message: GROUP_WORDS.dueReplaceBody(
          replacedBills.map((bill) => {
            const current = getCurrentDue(bill);
            return current === null
              ? bill.version.payload.name
              : `${bill.version.payload.name} (${formatDateOrdinalUTC(current)})`;
          }),
          formatDateOrdinalUTC(dueDate),
          describeRepeatsOn(
            replacedBills.map(
              ({ version }) => version.payload.timing.schedule.kind,
            ),
            dueDate,
          ),
        ),
        confirmText: GROUP_WORDS.dueReplace,
      });
      if (!isConfirmed) return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const liveVersions = store
        .getState()
        .runway.versions.filter(
          (version): version is BillVersion => version.kind === 'bill',
        );
      const toDue = (bill: BillSealed): BillSealed => ({
        ...bill,
        fundedBy:
          bill.fundedBy.kind === 'chosen'
            ? { kind: 'suggested' }
            : bill.fundedBy,
        timing: {
          kind: 'date',
          schedule: {
            ...bill.timing.schedule,
            anchor: dueDate,
            monthDays:
              bill.timing.schedule.kind === 'monthly'
                ? [new Date(dueDate).getUTCDate()]
                : [],
          },
        },
      });
      const plans = changingBills.map(({ item, version }) => {
        const original = getStretches(liveVersions, item.id);
        return {
          itemId: item.id,
          name: version.payload.name,
          original,
          written: original.map((stretch) => ({
            ...stretch,
            payload: toDue(stretch.payload),
          })),
        };
      });
      const results = await Promise.allSettled(
        plans.map((plan) =>
          changeItem(user.uid, encryption, {
            itemId: plan.itemId,
            kind: 'bill',
            payload: plan.written[0].payload,
            summary: GROUP_WORDS.dueSummary(
              plan.name,
              describeChange(
                plan.original[0].payload,
                plan.written[0].payload,
                getCardNamer([]),
              ) || 'Updated',
              formatDateOrdinalUTC(today),
            ),
            note: null,
            effectiveFrom: today,
            stretches: plan.written,
          }),
        ),
      );
      const saved = plans.filter(
        (_, index) => results[index].status === 'fulfilled',
      );
      const failed = plans
        .filter((_, index) => results[index].status === 'rejected')
        .map((plan) => plan.name);
      if (saved.length > 0) {
        setDueRecord({
          note: GROUP_WORDS.dueDone(
            saved.length,
            formatDateOrdinalUTC(dueDate),
          ),
          undo: saved,
        });
        addToast({
          title: GROUP_WORDS.dueToast(saved.length),
          type: 'success',
          action: {
            label: ITEM_SHEET_R2_WORDS.undo,
            onClick: () => void undoDueDates(saved),
          },
        });
      }
      if (failed.length === 0) {
        setIsSettingDue(false);
        return;
      }
      setError(
        saved.length === 0
          ? GROUP_WORDS.dueFailed
          : GROUP_WORDS.duePartial(saved.length, plans.length, failed),
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError, GROUP_WORDS.dueFailed));
    } finally {
      setIsSaving(false);
    }
  };

  const trimmed = name.trim();
  const canRename = trimmed !== '' && trimmed !== payload.name;
  const lead = describeGroupLead(total, memberCount);
  const getCaption = (
    heading: string,
    kindTotal: GroupTotal,
    count: number,
  ) => {
    const kindLead = describeGroupLead(kindTotal, count);
    return kindLead.amount === null || kindLead.isOneTime
      ? heading
      : `${heading} · ${kindLead.amount} ${kindLead.rest}`;
  };
  const trimmedEmoji = emoji.trim();

  if (adding === 'bill') {
    return (
      <BillForm
        isOpen
        title='Bill'
        presetGroupId={groupId}
        onClose={onClose}
        onCancel={() => setAdding(null)}
      />
    );
  }
  if (adding === 'envelope') {
    return (
      <EnvelopeForm
        isOpen
        title='Envelope'
        presetGroupId={groupId}
        onClose={onClose}
        onCancel={() => setAdding(null)}
      />
    );
  }

  return (
    <FormSheet
      isOpen
      onClose={onClose}
      title={payload.emoji ? `${payload.emoji} ${payload.name}` : payload.name}
      actions={<ValuesEyeButton />}
    >
      <div className='sheet-scrolls space-y-4 [@media(max-height:599px)]:space-y-2.5'>
        {isPickingEmoji ? (
          <>
            <BackLink onBack={() => setIsPickingEmoji(false)} />
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs'>
                {GROUP_WORDS.emojiLabel}
              </p>
              <EmojiField
                value={emoji}
                onChange={setEmoji}
                ariaLabel={GROUP_WORDS.emojiLabel}
                placeholder='🐾'
                maxLength={MAX_EMOJI_LENGTH}
              />
            </div>
            <ModalFooterActions
              note={error}
              leftActions={
                payload.emoji !== null && (
                  <Button
                    type='button'
                    variant='secondary'
                    disabled={isSaving}
                    onClick={() => void saveEmoji(null)}
                  >
                    {GROUP_WORDS.removeEmoji}
                  </Button>
                )
              }
              rightActions={
                <Button
                  type='button'
                  loading={isSaving}
                  disabled={
                    isSaving ||
                    trimmedEmoji === '' ||
                    trimmedEmoji === payload.emoji
                  }
                  onClick={() => void saveEmoji(trimmedEmoji)}
                >
                  Save
                </Button>
              }
            />
          </>
        ) : isSettingDue ? (
          <>
            <BackLink onBack={() => setIsSettingDue(false)} />
            <ActionTitle>{GROUP_WORDS.dueQuestion}</ActionTitle>
            <div>
              <DateInput
                variant='outline'
                aria-label={GROUP_WORDS.dueCaption}
                min={toDateInputValue(today)}
                value={dueText}
                onChange={(event) => setDueText(event.target.value)}
              />
            </div>
            {skippedCount > 0 && (
              <p className='text-muted-foreground text-sm'>
                {GROUP_WORDS.dueSkipped(skippedCount)}
              </p>
            )}
            <ModalFooterActions
              note={
                error ??
                (isSaving
                  ? null
                  : dueDate === undefined
                    ? GROUP_WORDS.duePickDay
                    : isPast
                      ? FORM_FLOW_WORDS.pastDay
                      : changingBills.length === 0
                        ? GROUP_WORDS.dueNothingToChange
                        : null)
              }
              rightActions={
                <Button
                  type='button'
                  loading={isSaving}
                  disabled={
                    isSaving ||
                    dueDate === undefined ||
                    isPast ||
                    changingBills.length === 0
                  }
                  onClick={() => void setDueDate()}
                >
                  {GROUP_WORDS.dueAction}
                </Button>
              }
            />
          </>
        ) : isRenaming ? (
          <>
            <BackLink onBack={() => setIsRenaming(false)} />
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs'>
                {GROUP_WORDS.nameLabel}
              </p>
              <Input
                variant='outline'
                aria-label={GROUP_WORDS.nameLabel}
                maxLength={MAX_NAME_LENGTH}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <ModalFooterActions
              note={error}
              rightActions={
                <Button
                  type='button'
                  loading={isSaving}
                  disabled={isSaving || !canRename}
                  onClick={() => void rename(trimmed)}
                >
                  Save
                </Button>
              }
            />
          </>
        ) : (
          <>
            <SheetHead
              label={
                lead.isOneTime
                  ? GROUP_WORDS.oneTimeLabel
                  : dial === 'want'
                    ? GROUP_WORDS.monthLabel
                    : `${GROUP_WORDS.monthLabel}, ${PRIORITY_DIAL_WORDS.sheetSuffix[dial]}`
              }
              figure={
                lead.amount === null ? undefined : (
                  <SensitiveValue>{lead.amount}</SensitiveValue>
                )
              }
              suffix={lead.isOneTime ? lead.rest : undefined}
              fact={
                memberCount === 0
                  ? GROUP_WORDS.noBills
                  : memberNames.length > 0
                    ? GROUP_WORDS.members(memberNames)
                    : null
              }
              help={
                <GroupTotalHelp
                  total={total}
                  hasRange={hasRange}
                  stance={stance}
                />
              }
              helpTitle={GROUP_WORDS.basisTitle}
            />
            {total.oneTime.count > 0 && !lead.isOneTime && (
              <p className='text-muted-foreground -mt-2 text-sm'>
                <MaskedText>
                  {GROUP_WORDS.plusOneTime(
                    describeGroupTotal(total.oneTime.range),
                    total.oneTime.count,
                    total.oneTime.dueOn === null
                      ? null
                      : formatDateOrdinalUTC(total.oneTime.dueOn),
                  )}
                </MaskedText>
              </p>
            )}
            {bills.length > 0 && (
              <div className='space-y-1.5'>
                <p className='text-muted-foreground text-xs'>
                  <MaskedText>
                    {getCaption(
                      GROUP_WORDS.billsHeading,
                      billsTotal,
                      billCount,
                    )}
                  </MaskedText>
                </p>
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {bills.map(({ item, version }) => {
                    const { amount } = version.payload;
                    const { schedule } = version.payload.timing;
                    const monthly = describeBillMonthly(amount, schedule);
                    return (
                      <ItemRow
                        key={item.id}
                        name={version.payload.name}
                        emoji={resolveItemEmoji(
                          version.payload.emoji,
                          version.payload.groupId,
                          purposeEmojis,
                        )}
                        detail={describeBillDue(
                          schedule,
                          getCurrentDue({ item, version }),
                          monthly?.payment ?? null,
                        )}
                        figure={monthly?.figure ?? describeGroupTotal(amount)}
                        figureWord={
                          monthly
                            ? BILL_WORDS.aMonth
                            : schedule.kind === 'once'
                              ? BILL_WORDS.once
                              : null
                        }
                      />
                    );
                  })}
                </ul>
              </div>
            )}
            {envelopes.length > 0 && (
              <div className='space-y-1.5'>
                <p className='text-muted-foreground text-xs'>
                  <MaskedText>
                    {getCaption(
                      GROUP_WORDS.envelopesHeading,
                      envelopesTotal,
                      envelopeCount,
                    )}
                  </MaskedText>
                </p>
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {envelopes.map(({ item, version }) => {
                    const atLevel = fundingAtLevel(version.payload, dial);
                    const funding = atLevel ?? withExtras(version.payload);
                    const leftOut =
                      atLevel === null
                        ? []
                        : getExtras(version.payload).filter(
                            (extra) => !isCountedAt(extra.tier, dial),
                          );
                    const monthly = describeEnvelopeMonthly(
                      funding,
                      getIncomeDays(version.payload.funding),
                    );
                    const eachTime = `${describeCadenceLine(funding.cadence)}${describeExtras(leftOut, formatCentsShort)}`;
                    return (
                      <ItemRow
                        key={item.id}
                        name={version.payload.name}
                        emoji={resolveItemEmoji(
                          version.payload.emoji,
                          version.payload.groupId,
                          purposeEmojis,
                        )}
                        detail={
                          funding.amount.kind !== 'exact'
                            ? describeFundingShort(funding)
                            : monthly
                              ? `${monthly.payment}${describeExtras(leftOut, formatCentsShort)}`
                              : eachTime
                        }
                        figure={
                          monthly?.figure ??
                          (funding.amount.kind === 'exact'
                            ? formatCents(funding.amount.cents)
                            : null)
                        }
                        figureWord={monthly ? BILL_WORDS.aMonth : null}
                      />
                    );
                  })}
                </ul>
              </div>
            )}
            <div className='space-y-3'>
              <div className='flex items-center gap-1'>
                <h3 className='text-sm font-semibold'>
                  {GROUP_WORDS.startingPriority}
                </h3>
                <HelpTip title={GROUP_WORDS.startingPriority}>
                  <p>{GROUP_WORDS.startingPriorityHelp}</p>
                </HelpTip>
              </div>
              {priorityRows.map((row) => {
                const value = getRowValue(row);
                const offPick = getOffPick(row);
                const pick = getRowPick(row);
                const note = priorityNote?.row === row ? priorityNote : null;
                const rowLabel = GROUP_WORDS.priorityRowLabel[row];
                return (
                  <div key={row} className='space-y-1.5'>
                    {priorityRows.length > 1 && (
                      <p className='text-muted-foreground text-sm'>
                        {rowLabel}
                        {value === 'mixed' && (
                          <span>{` · ${GROUP_WORDS.priorityMixed}`}</span>
                        )}
                      </p>
                    )}
                    <PillGroup
                      label={
                        priorityRows.length > 1
                          ? `${GROUP_WORDS.startingPriority}: ${rowLabel}`
                          : GROUP_WORDS.startingPriority
                      }
                      options={startingOptions}
                      value={value === 'mixed' ? null : value}
                      onChange={(choice: StartingChoice) =>
                        void pickPriority(row, choice)
                      }
                    />
                    {pendingPriority?.row === row && (
                      <p
                        role='status'
                        className='text-muted-foreground text-sm'
                      >
                        {GROUP_WORDS.priorityApplying}
                      </p>
                    )}
                    {note && (
                      <p
                        role={note.isError ? 'alert' : 'status'}
                        className={join(
                          'text-sm',
                          note.isError
                            ? 'text-destructive'
                            : 'text-muted-foreground',
                        )}
                      >
                        {note.text}
                      </p>
                    )}
                    {pick !== null && offPick.length > 0 && (
                      <div className='flex min-h-7 items-center gap-2'>
                        <p className='text-muted-foreground text-sm'>
                          {GROUP_WORDS.priorityStale(
                            offPick,
                            PRIORITY_LABELS[pick],
                          )}
                        </p>
                        <Button
                          type='button'
                          variant='secondary'
                          size='sm'
                          rounded='full'
                          className="relative shrink-0 after:absolute after:-inset-1.5 after:content-['']"
                          onClick={() => void pickPriority(row, pick)}
                        >
                          {GROUP_WORDS.priorityMakeAll(PRIORITY_LABELS[pick])}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <ActionGroup>
              <ActionRow
                isGrouped
                hasChevron
                icon={<Receipt />}
                label={GROUP_WORDS.addBill(payload.name)}
                onClick={() => setAdding('bill')}
              />
              {settableBills.length > 0 && (
                <ActionRow
                  isGrouped
                  hasChevron={!dueRecord?.undo}
                  icon={<CalendarDays />}
                  label={GROUP_WORDS.setDue}
                  subtitle={
                    dueRecord?.note ??
                    GROUP_WORDS.setDueSub(
                      settableBills.length,
                      settableBills.length === billCount,
                    )
                  }
                  trailing={
                    dueRecord?.undo ? (
                      <Button
                        type='button'
                        variant='secondary'
                        size='sm'
                        rounded='full'
                        loading={isUndoingDue}
                        disabled={isUndoingDue}
                        className="relative mr-3 after:absolute after:-inset-1.5 after:content-['']"
                        onClick={() => void undoDueDates(dueRecord.undo ?? [])}
                      >
                        {ITEM_SHEET_R2_WORDS.undo}
                      </Button>
                    ) : undefined
                  }
                  onClick={() => {
                    setDueText('');
                    setError(null);
                    setIsSettingDue(true);
                  }}
                />
              )}
              <ActionRow
                isGrouped
                hasChevron
                icon={<Wallet />}
                label={GROUP_WORDS.addEnvelope(payload.name)}
                onClick={() => setAdding('envelope')}
              />
              <ActionRow
                isGrouped
                hasChevron
                icon={<Smile />}
                label={
                  payload.emoji === null
                    ? GROUP_WORDS.chooseEmoji(payload.name)
                    : GROUP_WORDS.changeEmoji(payload.name)
                }
                onClick={() => {
                  setEmoji(payload.emoji ?? '');
                  setError(null);
                  setIsPickingEmoji(true);
                }}
              />
              <ActionRow
                isGrouped
                hasChevron
                icon={<Pencil />}
                label={GROUP_WORDS.rename(payload.name)}
                onClick={() => {
                  setName(payload.name);
                  setError(null);
                  setIsRenaming(true);
                }}
              />
              <ActionRow
                isGrouped
                isDestructive
                icon={<Archive />}
                label={GROUP_WORDS.archive(payload.name)}
                subtitle={GROUP_WORDS.archiveSub}
                isDisabled={isSaving}
                onClick={() => void archive()}
              />
            </ActionGroup>
            {error && <p className='text-destructive text-sm'>{error}</p>}
          </>
        )}
      </div>
    </FormSheet>
  );
}

export default GroupSheet;

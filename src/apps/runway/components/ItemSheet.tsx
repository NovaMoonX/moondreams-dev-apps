import { useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  CalendarClock,
  CalendarOff,
  Calculator,
  Check,
  FolderOpen,
  HandCoins,
  CircleMinus,
  History,
  Link2,
  Pause,
  Pencil,
  PiggyBank,
  Play,
  ReceiptText,
  ShoppingBag,
  Undo2,
} from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import FoldedDateField from '@/components/FoldedDateField';
import RevealChip from '@/components/RevealChip';
import FormSheet from '@/components/FormSheet';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import NoteTextField from '@/components/NoteTextField';
import { PillGroup } from '@/components/PillGroup';
import SuggestionChips from '@/components/SuggestionChips';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { toDateInputValue } from '@/utils/dateInputUtils';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShortUTC, formatDateUTC } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import ChangeSteps from '@apps/runway/components/ChangeSteps';
import {
  ActionSection,
  ActionTitle,
} from '@apps/runway/components/ActionSection';
import GoalBalanceView, {
  GoalBalanceDoor,
} from '@apps/runway/components/GoalBalanceView';
import ItemHistoryView from '@apps/runway/components/ItemHistoryView';
import { CheckAmountBody } from '@apps/runway/screens/home/CheckAmountScreen';
import ItemPurchasesView from '@apps/runway/components/ItemPurchasesView';
import PurchaseScreen from '@apps/runway/screens/spend/PurchaseScreen';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import SheetHead from '@apps/runway/components/SheetHead';
import EffectPreview from '@apps/runway/components/EffectPreview';
import {
  CARD_WORDS,
  CHANGE_WORDS,
  GOAL_CHART_WORDS,
  HOW_OFTEN_WORDS,
  CHECK_WORDS,
  CHECKLIST_WORDS,
  FORM_FLOW_WORDS,
  GROUP_WORDS,
  ENVELOPE_SPEND_WORDS,
  ITEM_SHEET_R2_WORDS,
  ITEM_SHEET_WORDS,
  ITEM_KIND_NOUNS,
  ITEM_VIEW_WORDS,
  LIFECYCLE_WORDS,
  PAIRING_STOP_WORDS,
  HELD_WORDS,
  RELEASE_UNDO_WORDS,
  LOOKAHEAD_MONTHS,
  MAX_CHANGE_DAYS_AHEAD,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  SPEND_WORDS,
} from '@apps/runway/constants';
import { addUtcDays, addUtcMonths, DAY_MS } from '@apps/runway/engine/dates';
import type { BillPayment } from '@apps/runway/engine/demands';
import {
  getVersionStretches,
  resolveCurrentOrNext,
  resolveNextChange,
  resolveVersion,
} from '@apps/runway/engine/resolve';
import { occurrences } from '@apps/runway/engine/schedule';
import BillForm, { type BillStepId } from '@apps/runway/forms/BillForm';
import EnvelopeForm, {
  type EnvelopeStepId,
} from '@apps/runway/forms/EnvelopeForm';
import GoalForm, { type GoalStepId } from '@apps/runway/forms/GoalForm';
import IncomeForm, { type IncomeStepId } from '@apps/runway/forms/IncomeForm';
import PairingsEditor from '@apps/runway/forms/PairingsEditor';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
import { useBillPaid } from '@apps/runway/hooks/useBillPaid';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  archiveItem,
  endItem,
  changeItem,
  releaseHeld,
  setGoalState,
  undoReleaseHeld,
} from '@apps/runway/store/actions/itemActions';
import {
  getLaterReleaseDay,
  type HeldChoice,
} from '@apps/runway/engine/endings';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectAllCards,
  selectGroups,
  selectPairedBy,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getBillCardName, getCardNamer } from '@apps/runway/utils/cardText';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { formatCents } from '@/utils/moneyUtils';
import InlineNotice from '@/components/InlineNotice';
import HeldChoiceList from '@apps/runway/components/HeldChoiceList';
import type { PreviewChange } from '@apps/runway/store/selectors/previewSelectors';
import type {
  BillSealed,
  BillVersion,
  GoalSealed,
  ItemKind,
  OpenVersion,
  PayLineSealed,
} from '@apps/runway/types';
import {
  describeChange,
  type ItemPayload,
} from '@apps/runway/utils/changeText';
import {
  NEW_GROUP_ID,
  resolveGroupChoice,
} from '@apps/runway/utils/groupChoice';

type View =
  | 'menu'
  | 'balance'
  | 'pause'
  | 'resume'
  | 'end'
  | 'archive'
  | 'history'
  | 'purchases'
  | 'check'
  | 'group';
type Phase = 'sheet' | 'change' | 'purchase' | 'purchaseDetail' | 'funds';

interface ItemSheetProps {
  itemId: string;
  /** The kind the row knows, until the item's own version is read. */
  kind: ItemKind;
  today: number;
  onClose: () => void;
  /** What the figure is ("Each income day", "Next payment", "Saved"). */
  figureLabel: string;
  /** Left out for an item with no amount of its own (an income source). */
  figure?: string;
  /** Small words after the figure ("of $600"). */
  figureSuffix?: string;
  /** The one short fact under the figure. */
  fact?: string | null;
  /** A caveat about the figure (the end of a range, a pairing), behind a help icon by it. */
  help?: ReactNode;
  /** The sheet's first action: the change people make most, opened at that question. */
  quickChange?: { label: string; step: string };
  /** A bill's next payment, which the sheet can mark paid. */
  payment?: BillPayment | null;
  onMarked?: () => void;
  onUndone?: () => void;
  /** The income day whose screen opened it; a change then starts from that day. */
  presetDayKey?: string;
  /** False where the item cannot be changed from here (an income day that has passed). */
  canChange?: boolean;
  /** Rows that belong to where the sheet was opened (a held line's choices), first. */
  extra?: ReactNode;
}

const isScheduled = (
  payload: ItemPayload,
): payload is PayLineSealed | BillSealed =>
  'schedule' in payload || 'timing' in payload;

const getSchedule = (payload: PayLineSealed | BillSealed) =>
  'schedule' in payload ? payload.schedule : payload.timing.schedule;

const LAST_DAY_OTHER = 'other';

const getActionTitle = (view: View, kind: ItemKind) => {
  const noun = ITEM_KIND_NOUNS[kind];
  if (view === 'end') return `End the ${noun}`;
  if (view === 'archive') return `Archive the ${noun}`;
  if (view === 'resume') return `Resume the ${noun}`;
  return `Pause the ${noun}`;
};

const VIEW_NOTES: Record<View, string> = {
  menu: '',
  pause: LIFECYCLE_WORDS.pauseSub,
  resume: LIFECYCLE_WORDS.resumeSub,
  end: '',
  archive: LIFECYCLE_WORDS.archiveNote,
  history: '',
  balance: '',
  purchases: '',
  check: '',
  group: '',
};

/** What a row opens: the item's figure and a few facts, then everything that can be done with it, each stop showing its effect on the coming income days before it is saved. A change, a purchase or the pairings close the sheet and open their own form. */
function ItemSheet({
  itemId,
  kind,
  today,
  onClose,
  figureLabel,
  figure,
  figureSuffix,
  fact,
  help,
  quickChange,
  payment = null,
  onMarked,
  onUndone,
  presetDayKey,
  canChange = true,
  extra,
}: ItemSheetProps) {
  const { user } = useAuth();
  const level = useAppSelector(selectLevel);
  const pairedNames = useAppSelector((state) =>
    [
      ...new Set(
        (selectPairedBy(state, today)[itemId] ?? []).map(
          (entry) => entry.sourceName,
        ),
      ),
    ].join('\n'),
  );
  const heldCents = useAppSelector(
    (state) => selectBalances(state).assignedByItem[itemId] ?? 0,
  );
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const version = useAppSelector(
    (state): OpenVersion | null =>
      resolveCurrentOrNext(state.runway.versions, itemId, today) ?? null,
  );
  const next = useAppSelector((state) =>
    resolveNextChange(state.runway.versions, itemId, today),
  );
  const stretchEnd = useAppSelector(
    (state) =>
      resolveVersion(state.runway.versions, itemId, today)?.effectiveUntil ??
      null,
  );
  const header = useAppSelector(
    (state) => state.runway.items.find((item) => item.id === itemId) ?? null,
  );
  const [phase, setPhase] = useState<Phase>('sheet');
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [view, setView] = useState<View>('menu');
  const [reason, setReason] = useState('');
  const [isReasonOpen, setIsReasonOpen] = useState(false);
  const [endPick, setEndPick] = useState<string>(String(today));
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [heldChoice, setHeldChoice] = useState<HeldChoice | null>(null);
  const [groupChoice, setGroupChoice] = useState('');
  const [groupText, setGroupText] = useState('');
  const groups = useAppSelector((state) => selectGroups(state, today));
  const [isReleasing, setIsReleasing] = useState(false);
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const mask = useMaskedText();
  const allCards = useAppSelector(selectAllCards);
  const versions = useAppSelector((state) => state.runway.versions);
  const paid = useBillPaid({
    billId: itemId,
    billName: version?.payload.name ?? '',
    payment,
    onMarked,
    onUndone,
  });

  if (!version || version.kind === 'group') return null;
  const payload = version.payload;
  const paidWithCard =
    level === 'track' && payment
      ? getBillCardName(versions, allCards, itemId, payment.dueOn)
      : null;
  const itemKind: ItemKind = version.kind ?? kind;
  const endedAt = header?.endedAt ?? null;

  const goal = itemKind === 'goal' ? (payload as GoalSealed) : null;
  const isPaused = goal !== null && (goal.state ?? 'active') === 'paused';
  const upcoming = isScheduled(payload)
    ? occurrences(
        getSchedule(payload),
        payload.ending,
        today,
        addUtcMonths(today, LOOKAHEAD_MONTHS),
      ).slice(0, 3)
    : [];
  const endOptions = [
    ...upcoming.map((on) => ({
      value: String(on),
      label:
        itemKind === 'bill'
          ? `After the ${formatDateShortUTC(on)} payment`
          : `After the ${formatDateShortUTC(on)} payday`,
    })),
    ...(upcoming.includes(today)
      ? []
      : [{ value: String(today), label: 'Today' }]),
    { value: LAST_DAY_OTHER, label: 'A date' },
  ];
  const endOn =
    endPick === LAST_DAY_OTHER ? fromDateInputValue(endDate) : Number(endPick);
  const isEndValid =
    endOn !== undefined &&
    endOn >= today &&
    endOn <= addUtcDays(today, MAX_CHANGE_DAYS_AHEAD);
  const holdsMoney =
    (itemKind === 'envelope' || itemKind === 'goal' || itemKind === 'bill') &&
    heldCents > 0;
  const isReleased =
    header?.heldReleasedOn != null && header.heldReleasedOn <= today;
  const isAskingHeld =
    (view === 'end' || view === 'archive') && holdsMoney && !isReleased;
  const canRelease =
    holdsMoney &&
    header !== null &&
    (header.archivedAt !== null || header.endedAt !== null) &&
    header.heldReleasedOn === null;
  const releaseOn = header ? getLaterReleaseDay(header, today) : today;

  const release = async () => {
    if (!user || isReleasing) return;
    const name = payload.name;
    setIsReleasing(true);
    try {
      const written = await releaseHeld(user.uid, itemId, releaseOn);
      if (!written) return;
      addToast({
        title: HELD_WORDS.released(name),
        type: 'success',
        action: {
          label: HELD_WORDS.undo,
          onClick: () =>
            void undoReleaseHeld(user.uid, itemId, releaseOn)
              .then((isUndone) => {
                if (isUndone) return;
                addToast({
                  title: RELEASE_UNDO_WORDS.notUndone(name),
                  description: RELEASE_UNDO_WORDS.changedSince,
                  type: 'error',
                });
              })
              .catch((undoError: unknown) =>
                addToast({
                  title: HELD_WORDS.releaseFailed(name),
                  description: getErrorMessage(
                    undoError,
                    'Nothing was changed.',
                  ),
                  type: 'error',
                }),
              ),
        },
      });
    } catch (releaseError) {
      addToast({
        title: HELD_WORDS.releaseFailed(name),
        description: getErrorMessage(releaseError, 'Nothing was changed.'),
        type: 'error',
      });
    } finally {
      setIsReleasing(false);
    }
  };

  const difference = next
    ? describeChange(payload, next.payload, getCardNamer(allCards))
    : '';
  const planned = [
    next &&
    difference !== '' &&
    (endedAt === null || next.effectiveFrom <= endedAt)
      ? `${CHANGE_WORDS.scheduled} ${formatDateShortUTC(next.effectiveFrom)} · ${difference.replace(/ to /g, ' → ')}`
      : null,
    stretchEnd !== null
      ? `${LIFECYCLE_WORDS.until} ${formatDateShortUTC(stretchEnd - DAY_MS)}, ${LIFECYCLE_WORDS.backAfter}`
      : null,
    endedAt !== null
      ? `${LIFECYCLE_WORDS.endsAfter} ${formatDateShortUTC(endedAt)}`
      : null,
  ].filter((line): line is string => line !== null);

  const pairings =
    version.kind === 'source' || version.kind === 'payLine'
      ? (version.payload.pairings ?? [])
      : [];

  const goTo = (nextView: View) => {
    setError(null);
    setReason('');
    setIsReasonOpen(false);
    setHeldChoice(null);
    setView(nextView);
  };

  const groupOptions = groups.map(({ item, version }) => ({
    id: item.id,
    name: version.payload.name,
  }));
  const currentGroupId =
    itemKind === 'bill' &&
    groupOptions.some(({ id }) => id === (payload as BillSealed).groupId)
      ? ((payload as BillSealed).groupId ?? null)
      : null;
  const currentGroupName =
    groupOptions.find(({ id }) => id === currentGroupId)?.name ??
    GROUP_WORDS.none;
  const pickedGroup = resolveGroupChoice(groupChoice, groupText, groupOptions);
  const isGroupUnchanged =
    pickedGroup.groupId === currentGroupId && pickedGroup.newGroup === null;
  const groupBlocker =
    groupChoice === NEW_CHOICE && groupText.trim() === ''
      ? FORM_FLOW_WORDS.nameGroup
      : isGroupUnchanged
        ? ''
        : null;

  const openGroup = () => {
    goTo('group');
    setGroupChoice(currentGroupId ?? '');
    setGroupText('');
  };

  const saveGroup = async () => {
    if (isSavingRef.current || !user || itemKind !== 'bill') return;
    const bill = payload as BillSealed;
    isSavingRef.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const next: BillSealed = {
        ...bill,
        groupId:
          pickedGroup.groupId ?? (pickedGroup.newGroup ? NEW_GROUP_ID : null),
      };
      await changeItem(user.uid, encryption, {
        itemId,
        kind: 'bill',
        payload: next,
        summary: `${bill.name}: ${describeChange(
          { ...bill, groupId: currentGroupId },
          next,
          getCardNamer(allCards),
          (id) =>
            groupOptions.find((option) => option.id === id)?.name ??
            pickedGroup.name,
        )}, from ${formatDateUTC(today)}.`,
        note: null,
        effectiveFrom: today,
        newGroup: pickedGroup.newGroup,
        stretches: getVersionStretches<BillVersion, BillSealed>(
          store
            .getState()
            .runway.versions.filter(
              (version): version is BillVersion => version.kind === 'bill',
            ),
          itemId,
          today,
        ).map((stretch) => ({
          ...stretch,
          payload: { ...stretch.payload, groupId: next.groupId },
        })),
      });
      addToast({
        title:
          pickedGroup.name === ''
            ? GROUP_WORDS.movedOut(bill.name)
            : GROUP_WORDS.moved(bill.name, pickedGroup.name),
        type: 'success',
      });
      goTo('menu');
    } catch (saveError) {
      setError(getErrorMessage(saveError, GROUP_WORDS.saveFailed));
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const getChange = (): PreviewChange | null => {
    if (view === 'pause' || view === 'resume') {
      return {
        kind: 'version',
        version: {
          itemId,
          kind: 'goal',
          effectiveFrom: today,
          effectiveUntil: null,
          changeId: 'what-if',
          payload: {
            ...(payload as GoalSealed),
            state: view === 'pause' ? 'paused' : 'active',
          },
        },
      };
    }
    if (view === 'end') {
      return isEndValid ? { kind: 'end', itemId, endedAt: endOn } : null;
    }
    if (view === 'archive')
      return { kind: 'archive', itemId, archivedAt: today };
    return null;
  };
  const change = getChange();
  const changeJson = change === null ? null : JSON.stringify(change);

  const run = async () => {
    if (isSavingRef.current || !user) return;
    const why = reason.trim() === '' ? null : reason.trim();
    isSavingRef.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      if (view === 'pause' || view === 'resume') {
        await setGoalState(user.uid, encryption, {
          itemId,
          goal: payload as GoalSealed,
          state: view === 'pause' ? 'paused' : 'active',
          note: why,
          effectiveFrom: today,
        });
        onClose();
        return;
      }
      if (view === 'end' && isEndValid) {
        const written = await endItem(user.uid, encryption, {
          itemId,
          endedOn: endOn,
          summary: `${payload.name}: ended after ${formatDateUTC(endOn)}.`,
          note: why,
          heldChoice: isAskingHeld ? heldChoice : null,
        });
        if (written) onClose();
        else setError(LIFECYCLE_WORDS.alreadyEnded);
        return;
      }
      if (view === 'archive') {
        const written = await archiveItem(
          user.uid,
          encryption,
          {
            itemId,
            summary: `${payload.name}: archived.`,
            note: why,
            heldChoice: isAskingHeld ? heldChoice : null,
          },
          today,
        );
        if (written) onClose();
        else setError(LIFECYCLE_WORDS.alreadyArchived);
      }
    } catch (saveError) {
      setError(
        getErrorMessage(saveError, 'This did not save. Nothing was changed.'),
      );
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const backToSheet = () => setPhase('sheet');

  if (phase === 'change') {
    if (version.kind === 'bill') {
      return (
        <BillForm
          isOpen
          title={payload.name}
          editing={{ itemId, payload: version.payload }}
          presetDayKey={presetDayKey}
          openStep={openStep as BillStepId | null}
          onClose={onClose}
          onCancel={backToSheet}
        />
      );
    }
    if (version.kind === 'envelope') {
      return (
        <EnvelopeForm
          isOpen
          title={payload.name}
          editing={{ itemId, payload: version.payload }}
          presetDayKey={presetDayKey}
          openStep={openStep as EnvelopeStepId | null}
          onClose={onClose}
          onCancel={backToSheet}
        />
      );
    }
    if (version.kind === 'goal') {
      return (
        <GoalForm
          isOpen
          title={payload.name}
          editing={{ itemId, payload: version.payload }}
          presetDayKey={presetDayKey}
          openStep={openStep as GoalStepId | null}
          onClose={onClose}
          onCancel={backToSheet}
        />
      );
    }
    return (
      <IncomeForm
        isOpen
        title={payload.name}
        defaultFrequency={null}
        openStep={openStep as IncomeStepId | null}
        editing={
          version.kind === 'source'
            ? { itemId, kind: 'source', payload: version.payload }
            : { itemId, kind: 'payLine', payload: version.payload }
        }
        onClose={onClose}
        onCancel={backToSheet}
      />
    );
  }

  if (phase === 'purchaseDetail' && purchaseId !== null) {
    return (
      <PurchaseScreen
        key={purchaseId}
        purchaseId={purchaseId}
        onOpen={setPurchaseId}
        onClose={backToSheet}
      />
    );
  }

  if (phase === 'purchase') {
    return (
      <PurchaseForm
        isOpen
        presetEnvelopeId={itemId}
        onClose={onClose}
        onCancel={backToSheet}
      />
    );
  }

  if (
    phase === 'funds' &&
    (version.kind === 'source' || version.kind === 'payLine')
  ) {
    return (
      <PairingsEditor
        isOpen
        title={ITEM_SHEET_WORDS.fundsTitle(payload.name)}
        fromLabel={payload.name}
        locked={[]}
        initial={pairings}
        change={{ itemId, kind: version.kind, current: version.payload }}
        onClose={onClose}
        onCancel={backToSheet}
      />
    );
  }

  const chips =
    view === 'end'
      ? LIFECYCLE_WORDS.chipsEnd
      : view === 'archive'
        ? LIFECYCLE_WORDS.chipsArchive
        : LIFECYCLE_WORDS.chipsPause;
  const getBlocker = () => {
    if (view === 'end' && !isEndValid) return LIFECYCLE_WORDS.endBlocker;
    if (isAskingHeld && heldChoice === null) return HELD_WORDS.blocker;
    return null;
  };
  const blocker = getBlocker();
  const isArchivable = itemKind !== 'source' && header?.archivedAt == null;
  const isStoppable = isArchivable && (endedAt === null || endedAt >= today);
  const isTrackEnvelope = itemKind === 'envelope' && level === 'track';
  const isFunded = itemKind === 'source' || itemKind === 'payLine';
  const hasBillRow = itemKind === 'bill' && paid.isReady && payment !== null;

  const openChange = (step: string | null) => {
    setOpenStep(step);
    setPhase('change');
  };
  const openHistory = () => goTo('history');

  const menu = (
    <div className='space-y-4 [@media(max-height:599px)]:space-y-2.5'>
      <SheetHead
        label={figureLabel}
        figure={figure}
        suffix={figureSuffix}
        fact={fact}
        help={help}
      />
      {extra}
      <ActionGroup>
        {canChange && quickChange && (
          <ActionRow
            isGrouped
            hasChevron
            icon={<Pencil />}
            label={quickChange.label}
            onClick={() => openChange(quickChange.step)}
          />
        )}
        {canChange && !quickChange && (
          <ActionRow
            isGrouped
            hasChevron
            icon={<Pencil />}
            label={ITEM_SHEET_WORDS.change}
            subtitle={presetDayKey ? ITEM_SHEET_WORDS.changeDaySub : undefined}
            onClick={() => openChange(null)}
          />
        )}
        {canChange && goal && goal.funding.cadence.kind !== 'none' && (
          <ActionRow
            isGrouped
            hasChevron
            icon={<CircleMinus />}
            label={HOW_OFTEN_WORDS.changeOften}
            onClick={() => openChange('often')}
          />
        )}
        {canChange && goal && goal.funding.cadence.kind === 'none' && (
          <ActionRow
            isGrouped
            hasChevron
            icon={<PiggyBank />}
            label={HOW_OFTEN_WORDS.startAdding}
            onClick={() => openChange('often')}
          />
        )}
        {hasBillRow && payment && (
          <ActionRow
            isGrouped
            icon={paid.isPaid ? <Undo2 /> : <Check />}
            label={
              paid.isPaid ? ITEM_SHEET_WORDS.notPaid : CHECKLIST_WORDS.markPaid
            }
            subtitle={
              paid.isPaid
                ? undefined
                : paidWithCard !== null
                  ? CARD_WORDS.chargedTo(paidWithCard)
                  : payment.fundedCents >= payment.totalCents
                    ? ITEM_SHEET_WORDS.paidFromSetAside
                    : mask(
                        ITEM_SHEET_R2_WORDS.paidFromFreeText(
                          formatCentsShort(
                            payment.totalCents - payment.fundedCents,
                          ),
                        ),
                      )
            }
            isDisabled={paid.isBusy}
            onClick={() => void (paid.isPaid ? paid.undo() : paid.mark())}
          />
        )}
        {isFunded && (
          <ActionRow
            isGrouped
            hasChevron
            icon={<Link2 />}
            label={ITEM_SHEET_WORDS.funds}
            subtitle={ITEM_SHEET_WORDS.fundsSub}
            onClick={() => setPhase('funds')}
          />
        )}
        {goal && (
          <GoalBalanceDoor
            goalId={itemId}
            goal={goal}
            today={today}
            onOpen={() => goTo('balance')}
          />
        )}
        <ActionRow
          isGrouped
          hasChevron
          icon={<History />}
          label={ITEM_SHEET_WORDS.history}
          onClick={openHistory}
        />
        {canChange && itemKind === 'bill' && (
          <ActionRow
            isGrouped
            hasChevron
            icon={<FolderOpen />}
            label={GROUP_WORDS.inGroup}
            subtitle={currentGroupName}
            onClick={openGroup}
          />
        )}
        {canRelease && (
          <ActionRow
            isGrouped
            icon={<HandCoins />}
            label={HELD_WORDS.release}
            subtitle={
              releaseOn > today
                ? HELD_WORDS.releaseOn(formatDateShortUTC(releaseOn))
                : HELD_WORDS.releaseNow
            }
            isDisabled={isReleasing}
            onClick={() => void release()}
          />
        )}
        {planned.map((line) => (
          <ActionRow
            key={line}
            isGrouped
            hasChevron
            icon={<CalendarClock />}
            label={mask(line)}
            onClick={openHistory}
          />
        ))}
      </ActionGroup>
      {isTrackEnvelope && (
        <ActionGroup caption={ENVELOPE_SPEND_WORDS.heading}>
          <ActionRow
            isGrouped
            hasChevron
            icon={<ShoppingBag />}
            label={SPEND_WORDS.envelopeAdd}
            onClick={() => setPhase('purchase')}
          />
          <ActionRow
            isGrouped
            hasChevron
            icon={<ReceiptText />}
            label={SPEND_WORDS.title}
            onClick={() => goTo('purchases')}
          />
          <ActionRow
            isGrouped
            hasChevron
            icon={<Calculator />}
            label={CHECK_WORDS.open}
            subtitle={ITEM_SHEET_R2_WORDS.checkSub}
            onClick={() => goTo('check')}
          />
        </ActionGroup>
      )}
      {isArchivable && (
        <ActionGroup
          caption={
            goal && isStoppable
              ? ITEM_SHEET_WORDS.stopHeading
              : ITEM_SHEET_R2_WORDS.stopOnly
          }
        >
          {isStoppable && goal && !isPaused && (
            <ActionRow
              isGrouped
              hasChevron
              icon={<Pause />}
              label={LIFECYCLE_WORDS.pause}
              subtitle={ITEM_SHEET_R2_WORDS.pauseSub}
              onClick={() => goTo('pause')}
            />
          )}
          {isStoppable && goal && isPaused && (
            <ActionRow
              isGrouped
              hasChevron
              icon={<Play />}
              label={LIFECYCLE_WORDS.resume}
              subtitle={ITEM_SHEET_R2_WORDS.resumeSub}
              onClick={() => goTo('resume')}
            />
          )}
          {isStoppable && (
            <ActionRow
              isGrouped
              hasChevron
              icon={<CalendarOff />}
              label={LIFECYCLE_WORDS.end}
              subtitle={ITEM_SHEET_R2_WORDS.endSub}
              onClick={() => goTo('end')}
            />
          )}
          <ActionRow
            isGrouped
            hasChevron
            icon={<Archive />}
            label={LIFECYCLE_WORDS.archive}
            subtitle={ITEM_SHEET_R2_WORDS.archiveSub}
            onClick={() => goTo('archive')}
          />
        </ActionGroup>
      )}
    </div>
  );

  const browse = (
    <div className='flex flex-1 flex-col gap-4'>
      <BackLink onBack={() => goTo('menu')} />
      <p className='text-2xl font-semibold'>
        {view === 'balance'
          ? GOAL_CHART_WORDS.title
          : view === 'history'
            ? ITEM_VIEW_WORDS.historyTitle
            : view === 'check'
              ? CHECK_WORDS.title
              : ITEM_VIEW_WORDS.purchasesTitle}
      </p>
      {view === 'balance' && goal ? (
        <GoalBalanceView goalId={itemId} goal={goal} today={today} />
      ) : view === 'history' ? (
        <ItemHistoryView itemId={itemId} />
      ) : view === 'check' ? (
        <CheckAmountBody presetEnvelopeId={itemId} />
      ) : (
        <ItemPurchasesView
          envelopeId={itemId}
          onOpen={(id) => {
            setPurchaseId(id);
            setPhase('purchaseDetail');
          }}
        />
      )}
    </div>
  );

  const groupView = (
    <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
      <BackLink onBack={() => goTo('menu')} />
      <ActionTitle>{FORM_FLOW_WORDS.groupTitle}</ActionTitle>
      <PickOrCreate
        label={FORM_FLOW_WORDS.group}
        options={groupOptions.map(({ id, name }) => ({
          value: id,
          label: name,
        }))}
        choice={groupChoice}
        newText={groupText}
        newPillLabel={FORM_FLOW_WORDS.newGroup}
        newPlaceholder={FORM_FLOW_WORDS.newGroupPlaceholder}
        hasPlus={false}
        maxLength={MAX_NAME_LENGTH}
        clearLabel={FORM_FLOW_WORDS.clearGroup}
        onChange={(choice, text) => {
          setGroupChoice(choice);
          setGroupText(text);
        }}
      />
      {groupChoice === NEW_CHOICE && pickedGroup.name !== '' && (
        <p className='text-muted-foreground text-sm'>
          {GROUP_WORDS.willBe(pickedGroup.name)}
        </p>
      )}
      <ModalFooterActions
        note={error ?? (groupBlocker === '' ? null : groupBlocker)}
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={() => goTo('menu')}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isSaving}
            disabled={isSaving || groupBlocker !== null}
            onClick={() => void saveGroup()}
          >
            Save
          </Button>
        }
      />
    </div>
  );

  const action = (
    <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
      <BackLink onBack={() => goTo('menu')} />
      <div className='space-y-1'>
        <ActionTitle>{getActionTitle(view, itemKind)}</ActionTitle>
        {VIEW_NOTES[view] !== '' && (
          <p className='text-muted-foreground text-sm'>{VIEW_NOTES[view]}</p>
        )}
      </div>
      {view === 'end' && (
        <ActionSection caption={LIFECYCLE_WORDS.endHeading}>
          <PillGroup
            label={LIFECYCLE_WORDS.endHeading}
            options={endOptions}
            value={endPick}
            onChange={setEndPick}
          />
          {endPick === LAST_DAY_OTHER && (
            <FoldedDateField
              label={LIFECYCLE_WORDS.endDateLabel}
              todayValue={toDateInputValue(today)}
              min={toDateInputValue(today)}
              max={toDateInputValue(addUtcDays(today, MAX_CHANGE_DAYS_AHEAD))}
              value={endDate}
              onChange={setEndDate}
            />
          )}
        </ActionSection>
      )}
      <EffectPreview
        changeJson={changeJson}
        emptyText={CHANGE_WORDS.previewNone}
        isCompact={isAskingHeld}
      />
      {isAskingHeld && (
        <ActionSection
          caption={mask(HELD_WORDS.caption(formatCents(heldCents)))}
        >
          <HeldChoiceList
            value={heldChoice}
            onChange={setHeldChoice}
            freeBody={
              view === 'end' && isEndValid
                ? HELD_WORDS.freeEnd(formatDateShortUTC(endOn + DAY_MS))
                : HELD_WORDS.freeArchive
            }
            keepBody={HELD_WORDS.keepBody}
          />
        </ActionSection>
      )}
      {(view === 'pause' || view === 'end' || view === 'archive') &&
        pairedNames !== '' && (
          <InlineNotice tone='info'>
            {PAIRING_STOP_WORDS.stops(pairedNames.split('\n'))}
          </InlineNotice>
        )}
      {isReasonOpen && (
        <>
          <SuggestionChips
            label={CHANGE_WORDS.whyHeading}
            suggestions={chips}
            isDisabled={isSaving}
            onPick={setReason}
          />
          <NoteTextField
            label='Note'
            value={reason}
            onChange={setReason}
            placeholder={CHANGE_WORDS.whyPlaceholder}
            maxLength={MAX_NOTE_LENGTH}
            rows={1}
          />
        </>
      )}
      <div>
        <RevealChip
          onClick={() => {
            if (isReasonOpen) setReason('');
            setIsReasonOpen(!isReasonOpen);
          }}
        >
          {isReasonOpen
            ? LIFECYCLE_WORDS.removeReason
            : LIFECYCLE_WORDS.addReason}
        </RevealChip>
      </div>
      <ModalFooterActions
        note={error ?? blocker}
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={() => goTo('menu')}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            className='whitespace-nowrap max-sm:px-3'
            loading={isSaving}
            disabled={isSaving || blocker !== null}
            onClick={() => void run()}
          >
            {getActionTitle(view, itemKind)}
          </Button>
        }
      />
    </div>
  );

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={payload.name}
      actions={<ValuesEyeButton />}
    >
      <ChangeSteps
        isReason={view !== 'menu'}
        reason={
          view === 'history' ||
          view === 'balance' ||
          view === 'purchases' ||
          view === 'check'
            ? browse
            : view === 'group'
              ? groupView
              : action
        }
      >
        {menu}
      </ChangeSteps>
    </FormSheet>
  );
}

export default ItemSheet;

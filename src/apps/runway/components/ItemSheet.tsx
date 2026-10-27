import { useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  CalendarClock,
  CalendarOff,
  Calculator,
  Check,
  CircleMinus,
  CirclePlus,
  History,
  Link2,
  Pause,
  Pencil,
  Play,
  Plus,
  ReceiptText,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import NoteTextField from '@/components/NoteTextField';
import { PillGroup } from '@/components/PillGroup';
import SuggestionChips from '@/components/SuggestionChips';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
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
import ItemHistoryView from '@apps/runway/components/ItemHistoryView';
import ItemPurchasesView from '@apps/runway/components/ItemPurchasesView';
import PurchaseScreen from '@apps/runway/screens/spend/PurchaseScreen';
import SheetHead from '@apps/runway/components/SheetHead';
import EffectPreview from '@apps/runway/components/EffectPreview';
import {
  CHANGE_WORDS,
  HOW_OFTEN_WORDS,
  CHECK_WORDS,
  CHECKLIST_WORDS,
  ENVELOPE_SPEND_WORDS,
  ITEM_SHEET_R2_WORDS,
  ITEM_SHEET_WORDS,
  ITEM_KIND_NOUNS,
  ITEM_VIEW_WORDS,
  LIFECYCLE_WORDS,
  LOOKAHEAD_MONTHS,
  MAX_CHANGE_DAYS_AHEAD,
  MAX_NOTE_LENGTH,
  SPEND_WORDS,
} from '@apps/runway/constants';
import { addUtcDays, addUtcMonths, DAY_MS } from '@apps/runway/engine/dates';
import type { BillPayment } from '@apps/runway/engine/demands';
import {
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
  setGoalState,
} from '@apps/runway/store/actions/itemActions';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import type { PreviewChange } from '@apps/runway/store/selectors/previewSelectors';
import type {
  BillSealed,
  GoalSealed,
  ItemKind,
  OpenVersion,
  PayLineSealed,
} from '@apps/runway/types';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import {
  describeChange,
  type ItemPayload,
} from '@apps/runway/utils/changeText';
import {
  keepEntryFor,
  leaveAfterSubviewCloses,
} from '@apps/runway/utils/leaveAfterClose';

type View =
  'menu' | 'pause' | 'resume' | 'end' | 'archive' | 'history' | 'purchases';
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
  purchases: '',
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
  const { openCheckAmount } = useRunwayUrlState();
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
  const [endPick, setEndPick] = useState<string>(String(today));
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const paid = useBillPaid({
    billId: itemId,
    billName: version?.payload.name ?? '',
    payment,
    onMarked,
    onUndone,
  });

  if (!version) return null;
  const payload = version.payload;
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

  const difference = next ? describeChange(payload, next.payload) : '';
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
    setView(nextView);
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
        });
        if (written) onClose();
        else setError(LIFECYCLE_WORDS.alreadyEnded);
        return;
      }
      if (view === 'archive') {
        const written = await archiveItem(
          user.uid,
          encryption,
          { itemId, summary: `${payload.name}: archived.`, note: why },
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

  const leaveTo = (open: () => void) => () => {
    onClose();
    leaveAfterSubviewCloses(open);
  };

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
        title='Funds'
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
  const blocker =
    view === 'end' && !isEndValid ? LIFECYCLE_WORDS.endBlocker : null;
  const isStoppable = itemKind !== 'source' && header?.archivedAt == null;
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
        {canChange && !(itemKind === 'source' && quickChange) && (
          <ActionRow
            isGrouped
            hasChevron
            icon={quickChange ? <SlidersHorizontal /> : <Pencil />}
            label={
              quickChange
                ? ITEM_SHEET_R2_WORDS.changeElse
                : ITEM_SHEET_WORDS.change
            }
            subtitle={presetDayKey ? ITEM_SHEET_WORDS.changeDaySub : undefined}
            onClick={() => openChange(null)}
          />
        )}
        {canChange && goal && goal.funding.cadence.kind !== 'none' && (
          <ActionRow
            isGrouped
            hasChevron
            icon={<CircleMinus />}
            label={HOW_OFTEN_WORDS.stopAdding}
            subtitle={HOW_OFTEN_WORDS.stopAddingSub}
            onClick={() => openChange('often')}
          />
        )}
        {canChange && goal && goal.funding.cadence.kind === 'none' && (
          <ActionRow
            isGrouped
            hasChevron
            icon={<CirclePlus />}
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
                : payment.fundedCents >= payment.totalCents
                  ? ITEM_SHEET_WORDS.paidFromSetAside
                  : ITEM_SHEET_R2_WORDS.paidFromFreeText(
                      formatCentsShort(
                        payment.totalCents - payment.fundedCents,
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
            onClick={() => setPhase('funds')}
          />
        )}
        <ActionRow
          isGrouped
          hasChevron
          icon={<History />}
          label={ITEM_SHEET_WORDS.history}
          onClick={openHistory}
        />
        {planned.map((line) => (
          <ActionRow
            key={line}
            isGrouped
            hasChevron
            icon={<CalendarClock />}
            label={line}
            onClick={openHistory}
          />
        ))}
      </ActionGroup>
      {isTrackEnvelope && (
        <ActionGroup caption={ENVELOPE_SPEND_WORDS.heading}>
          <ActionRow
            isGrouped
            hasChevron
            icon={<Plus />}
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
            onClick={leaveTo(() => {
              keepEntryFor('day');
              openCheckAmount(itemId);
            })}
          />
        </ActionGroup>
      )}
      {isStoppable && (
        <ActionGroup
          caption={
            goal ? ITEM_SHEET_WORDS.stopHeading : ITEM_SHEET_R2_WORDS.stopOnly
          }
        >
          {goal && !isPaused && (
            <ActionRow
              isGrouped
              hasChevron
              icon={<Pause />}
              label={LIFECYCLE_WORDS.pause}
              subtitle={ITEM_SHEET_R2_WORDS.pauseSub}
              onClick={() => goTo('pause')}
            />
          )}
          {goal && isPaused && (
            <ActionRow
              isGrouped
              hasChevron
              icon={<Play />}
              label={LIFECYCLE_WORDS.resume}
              subtitle={ITEM_SHEET_R2_WORDS.resumeSub}
              onClick={() => goTo('resume')}
            />
          )}
          <ActionRow
            isGrouped
            hasChevron
            icon={<CalendarOff />}
            label={LIFECYCLE_WORDS.end}
            subtitle={ITEM_SHEET_R2_WORDS.endSub}
            onClick={() => goTo('end')}
          />
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
        {view === 'history'
          ? ITEM_VIEW_WORDS.historyTitle
          : ITEM_VIEW_WORDS.purchasesTitle}
      </p>
      {view === 'history' ? (
        <ItemHistoryView itemId={itemId} />
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
            <Input
              type='date'
              variant='outline'
              aria-label={LIFECYCLE_WORDS.endDateLabel}
              min={toDateInputValue(today)}
              max={toDateInputValue(addUtcDays(today, MAX_CHANGE_DAYS_AHEAD))}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          )}
        </ActionSection>
      )}
      <EffectPreview
        changeJson={changeJson}
        emptyText={CHANGE_WORDS.previewNone}
      />
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
    <FormSheet isOpen isDrawerWhenShort onClose={onClose} title={payload.name}>
      <ChangeSteps
        isReason={view !== 'menu'}
        reason={view === 'history' || view === 'purchases' ? browse : action}
      >
        {menu}
      </ChangeSteps>
    </FormSheet>
  );
}

export default ItemSheet;

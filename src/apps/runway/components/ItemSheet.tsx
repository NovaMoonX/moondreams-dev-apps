import { useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  CalendarOff,
  Calculator,
  Check,
  History,
  Link2,
  Pause,
  Pencil,
  Play,
  Plus,
  ReceiptText,
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
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ChangeSteps from '@apps/runway/components/ChangeSteps';
import EffectPreview from '@apps/runway/components/EffectPreview';
import {
  CHANGE_WORDS,
  CHECK_WORDS,
  CHECKLIST_WORDS,
  ENVELOPE_SPEND_WORDS,
  ITEM_SHEET_WORDS,
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
import BillForm from '@apps/runway/forms/BillForm';
import EnvelopeForm from '@apps/runway/forms/EnvelopeForm';
import GoalForm from '@apps/runway/forms/GoalForm';
import IncomeForm from '@apps/runway/forms/IncomeForm';
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
import { selectItemNames } from '@apps/runway/store/selectors/runwaySelectors';
import type {
  BillSealed,
  GoalSealed,
  ItemKind,
  OpenVersion,
  PayLineSealed,
} from '@apps/runway/types';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { describeBillProgress } from '@apps/runway/utils/billText';
import {
  describeChange,
  type ItemPayload,
} from '@apps/runway/utils/changeText';
import { leaveAfterSubviewCloses } from '@apps/runway/utils/leaveAfterClose';

type View = 'menu' | 'pause' | 'resume' | 'end' | 'archive';
type Phase = 'sheet' | 'change' | 'purchase' | 'funds';

const MAX_FUNDS_NAMES = 3;
const MAX_FACTS = 3;

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
  /** Up to three short facts under the figure: priority, schedule, progress. */
  facts?: readonly (string | null | false | undefined)[];
  /** A note under the facts that qualifies the figure (which end of a range it is planned at). */
  note?: ReactNode;
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

const VIEW_NOTES: Record<View, string> = {
  menu: '',
  pause: LIFECYCLE_WORDS.pauseSub,
  resume: LIFECYCLE_WORDS.resumeSub,
  end: LIFECYCLE_WORDS.endSub,
  archive: LIFECYCLE_WORDS.archiveNote,
};

/** What a row opens: the item's figure and a few facts, then everything that can be done with it, each stop showing its effect on the coming income days before it is saved. A change, a purchase or the pairings close the sheet and open their own form. */
function ItemSheet({
  itemId,
  kind,
  today,
  onClose,
  figureLabel,
  figure,
  facts = [],
  note,
  payment = null,
  onMarked,
  onUndone,
  presetDayKey,
  canChange = true,
  extra,
}: ItemSheetProps) {
  const { user } = useAuth();
  const level = useAppSelector(selectLevel);
  const { showSpend, openCheckAmount, openMoreEntry, setLogItem } =
    useRunwayUrlState();
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
  const itemNames = useAppSelector(selectItemNames);
  const [phase, setPhase] = useState<Phase>('sheet');
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
          ? `After the ${formatDateUTC(on)} payment`
          : `After the ${formatDateUTC(on)} payday`,
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
      ? `${CHANGE_WORDS.scheduled} ${formatDateUTC(next.effectiveFrom)}: ${difference}`
      : null,
    stretchEnd !== null
      ? `${LIFECYCLE_WORDS.until} ${formatDateUTC(stretchEnd - DAY_MS)}, ${LIFECYCLE_WORDS.backAfter}.`
      : null,
    endedAt !== null
      ? `${LIFECYCLE_WORDS.endsAfter} ${formatDateUTC(endedAt)}.`
      : null,
  ].filter((line): line is string => line !== null);
  const shownFacts = facts
    .filter((fact): fact is string => typeof fact === 'string' && fact !== '')
    .slice(0, MAX_FACTS);

  const pairings =
    version.kind === 'source' || version.kind === 'payLine'
      ? (version.payload.pairings ?? [])
      : [];
  const fundsNames = pairings.flatMap((pairing) => {
    const found = itemNames.find((entry) => entry.id === pairing.targetItemId);
    return found ? [found.name] : [];
  });
  const fundsSummary =
    fundsNames.length > MAX_FUNDS_NAMES
      ? `${fundsNames.slice(0, MAX_FUNDS_NAMES).join(', ')} and ${fundsNames.length - MAX_FUNDS_NAMES} more`
      : fundsNames.join(', ');

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

  const leaveTo = (open: () => void) => () => {
    onClose();
    leaveAfterSubviewCloses(open);
  };

  if (phase === 'change') {
    if (version.kind === 'bill') {
      return (
        <BillForm
          isOpen
          title='Bill'
          editing={{ itemId, payload: version.payload }}
          presetDayKey={presetDayKey}
          onClose={onClose}
        />
      );
    }
    if (version.kind === 'envelope') {
      return (
        <EnvelopeForm
          isOpen
          title='Envelope'
          editing={{ itemId, payload: version.payload }}
          presetDayKey={presetDayKey}
          onClose={onClose}
        />
      );
    }
    if (version.kind === 'goal') {
      return (
        <GoalForm
          isOpen
          title='Goal'
          editing={{ itemId, payload: version.payload }}
          presetDayKey={presetDayKey}
          onClose={onClose}
        />
      );
    }
    return (
      <IncomeForm
        isOpen
        title='Income'
        defaultFrequency={null}
        editing={
          version.kind === 'source'
            ? { itemId, kind: 'source', payload: version.payload }
            : { itemId, kind: 'payLine', payload: version.payload }
        }
        onClose={onClose}
      />
    );
  }

  if (phase === 'purchase') {
    return <PurchaseForm isOpen presetEnvelopeId={itemId} onClose={onClose} />;
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
      />
    );
  }

  const chips =
    view === 'end'
      ? LIFECYCLE_WORDS.chipsEnd
      : view === 'archive'
        ? LIFECYCLE_WORDS.chipsArchive
        : LIFECYCLE_WORDS.chipsPause;
  const confirmLabel =
    view === 'end'
      ? LIFECYCLE_WORDS.endConfirm
      : view === 'archive'
        ? LIFECYCLE_WORDS.archiveConfirm
        : view === 'resume'
          ? LIFECYCLE_WORDS.resumeConfirm
          : LIFECYCLE_WORDS.pauseConfirm;
  const blocker =
    view === 'end' && !isEndValid ? LIFECYCLE_WORDS.endBlocker : null;
  const isStoppable = itemKind !== 'source' && header?.archivedAt == null;
  const isTrackEnvelope = itemKind === 'envelope' && level === 'track';
  const isFunded = itemKind === 'source' || itemKind === 'payLine';
  const hasBillRow = itemKind === 'bill' && paid.isReady && payment !== null;

  const menu = (
    <div className='space-y-4'>
      <div className='border-border bg-accent rounded-2xl border p-4'>
        <p className='text-muted-foreground text-sm font-medium'>
          {figureLabel}
        </p>
        {figure && (
          <p className='text-4xl font-semibold tracking-tight break-words tabular-nums'>
            {figure}
          </p>
        )}
        {[...shownFacts, ...planned].map((fact, index) => (
          <p
            key={`${index}:${fact}`}
            className='text-muted-foreground text-sm break-words'
          >
            {fact}
          </p>
        ))}
        {note}
      </div>
      {extra}
      {(canChange || hasBillRow || isFunded) && (
        <ActionGroup isRoomy>
          {canChange && (
            <ActionRow
              isGrouped
              isRoomy
              hasChevron
              icon={<Pencil />}
              label={ITEM_SHEET_WORDS.change}
              subtitle={
                presetDayKey
                  ? ITEM_SHEET_WORDS.changeDaySub
                  : ITEM_SHEET_WORDS.changeSub[itemKind]
              }
              onClick={() => setPhase('change')}
            />
          )}
          {hasBillRow && payment && (
            <ActionRow
              isGrouped
              isRoomy
              icon={paid.isPaid ? <Undo2 /> : <Check />}
              label={
                paid.isPaid
                  ? ITEM_SHEET_WORDS.notPaid
                  : CHECKLIST_WORDS.markPaid
              }
              subtitle={
                paid.isPaid
                  ? (describeBillProgress(payment) ?? undefined)
                  : payment.fundedCents >= payment.totalCents
                    ? ITEM_SHEET_WORDS.paidFromSetAside
                    : `${formatCents(payment.totalCents - payment.fundedCents)} ${ITEM_SHEET_WORDS.paidFromFree}`
              }
              isDisabled={paid.isBusy}
              onClick={() => void (paid.isPaid ? paid.undo() : paid.mark())}
            />
          )}
          {isFunded && (
            <ActionRow
              isGrouped
              isRoomy
              hasChevron
              icon={<Link2 />}
              label={ITEM_SHEET_WORDS.funds}
              subtitle={fundsSummary === '' ? undefined : fundsSummary}
              onClick={() => setPhase('funds')}
            />
          )}
        </ActionGroup>
      )}
      {isTrackEnvelope && (
        <ActionGroup isRoomy caption={ENVELOPE_SPEND_WORDS.heading}>
          <ActionRow
            isGrouped
            isRoomy
            hasChevron
            icon={<Plus />}
            label={SPEND_WORDS.envelopeAdd}
            subtitle={ENVELOPE_SPEND_WORDS.addSub}
            onClick={() => setPhase('purchase')}
          />
          <ActionRow
            isGrouped
            isRoomy
            hasChevron
            icon={<ReceiptText />}
            label={SPEND_WORDS.title}
            subtitle={ENVELOPE_SPEND_WORDS.listSub}
            onClick={leaveTo(() => showSpend(itemId))}
          />
          <ActionRow
            isGrouped
            isRoomy
            hasChevron
            icon={<Calculator />}
            label={CHECK_WORDS.open}
            subtitle={ENVELOPE_SPEND_WORDS.checkSub}
            onClick={leaveTo(() => openCheckAmount(itemId))}
          />
        </ActionGroup>
      )}
      {isStoppable && (
        <ActionGroup isRoomy caption={ITEM_SHEET_WORDS.stopHeading}>
          {goal && !isPaused && (
            <ActionRow
              isGrouped
              isRoomy
              hasChevron
              icon={<Pause />}
              label={LIFECYCLE_WORDS.pause}
              subtitle={LIFECYCLE_WORDS.pauseSub}
              onClick={() => goTo('pause')}
            />
          )}
          {goal && isPaused && (
            <ActionRow
              isGrouped
              isRoomy
              hasChevron
              icon={<Play />}
              label={LIFECYCLE_WORDS.resume}
              subtitle={LIFECYCLE_WORDS.resumeSub}
              onClick={() => goTo('resume')}
            />
          )}
          <ActionRow
            isGrouped
            isRoomy
            hasChevron
            icon={<CalendarOff />}
            label={LIFECYCLE_WORDS.end}
            subtitle={LIFECYCLE_WORDS.endSub}
            onClick={() => goTo('end')}
          />
          <ActionRow
            isGrouped
            isRoomy
            hasChevron
            icon={<Archive />}
            label={LIFECYCLE_WORDS.archive}
            subtitle={LIFECYCLE_WORDS.archiveSub}
            onClick={() => goTo('archive')}
          />
        </ActionGroup>
      )}
      <ActionGroup isRoomy>
        <ActionRow
          isGrouped
          isRoomy
          hasChevron
          icon={<History />}
          label={ITEM_SHEET_WORDS.history}
          subtitle={ITEM_SHEET_WORDS.historySub}
          onClick={leaveTo(() => {
            setLogItem(itemId);
            openMoreEntry('changeLog');
          })}
        />
      </ActionGroup>
    </div>
  );

  const action = (
    <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
      <BackLink onBack={() => goTo('menu')} />
      <p className='text-muted-foreground text-sm'>{VIEW_NOTES[view]}</p>
      {view === 'end' && (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs'>
            {LIFECYCLE_WORDS.endHeading}
          </p>
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
        </div>
      )}
      <EffectPreview
        changeJson={changeJson}
        emptyText={CHANGE_WORDS.previewNone}
      />
      <p className='text-sm font-medium'>
        {view === 'end' ? LIFECYCLE_WORDS.whyEnd : CHANGE_WORDS.whyHeading}
      </p>
      <SuggestionChips
        label={CHANGE_WORDS.whyHint}
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
        rows={3}
      />
      <ModalFooterActions
        note={error ?? blocker}
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onClose}
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
            {confirmLabel}
          </Button>
        }
      />
    </div>
  );

  return (
    <FormSheet isOpen onClose={onClose} title={payload.name}>
      <ChangeSteps isReason={view !== 'menu'} reason={action}>
        {menu}
      </ChangeSteps>
    </FormSheet>
  );
}

export default ItemSheet;

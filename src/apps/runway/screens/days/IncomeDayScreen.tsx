import { useState } from 'react';
import { CalendarX, ChevronRight, Link2, Mail, Undo2 } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import NeedsALookRow from '@apps/runway/components/NeedsALookRow';
import InlineNotice from '@/components/InlineNotice';
import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import EmptyCard from '@/components/EmptyCard';
import ModalFooterActions from '@/components/ModalFooterActions';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useDeferredLookahead } from '@apps/runway/useDeferredLookahead';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { MaskedText } from '@apps/runway/components/MaskedText';
import CoverageHeadline from '@apps/runway/components/CoverageHeadline';
import DraftLine from '@apps/runway/components/DraftLine';
import {
  CONFIRM_WORDS,
  CHECKLIST_R3_WORDS,
  DAYS_WORDS,
  DRAFT_WORDS,
  PAY_SHARE_WORDS,
  ITEM_SHEET_R2_WORDS,
  ITEM_SHEET_WORDS,
  NEEDS_LOOK_WORDS,
} from '@apps/runway/constants';
import PairingsEditor from '@apps/runway/forms/PairingsEditor';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  EMPTY_OVERRIDE,
  markNotArrived,
  saveBillShare,
  saveDayOverride,
  undoNotArrived,
} from '@apps/runway/store/actions/dayActions';
import ConfirmedDayView from '@apps/runway/screens/days/ConfirmedDayView';
import ConfirmSheet from '@apps/runway/screens/days/ConfirmSheet';
import NotArrivedView from '@apps/runway/screens/days/NotArrivedView';
import { getErrorMessage } from '@/utils/errorUtils';
import type { DraftLine as DraftLineData } from '@apps/runway/engine/draft';
import { effectiveStance } from '@apps/runway/engine/stance';
import type { HoldChoice } from '@apps/runway/types';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  selectChangeableKey,
  selectDraft,
  selectHistoryListedDays,
  selectIsDayOlderThanRecent,
  selectIsDaysLoaded,
  selectIsPlanItemsLoaded,
  selectIsMovesLoaded,
  selectIsRecordsReady,
  selectListedDays,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describeRange } from '@apps/runway/utils/rangeText';

import { formatDayTitle } from '@apps/runway/utils/dayTitle';

interface IncomeDayScreenProps {
  dayKey: string;
  onClose: () => void;
}

/** What one coming income day does with its money, worked out each time and never stored. */
function DraftDay({ dayKey, onClose }: IncomeDayScreenProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isEditingFunds, setIsEditingFunds] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isHidden } = useValuesHidden();
  const today = todayAsUtcDate(useNow(60_000));
  const isPlanLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const isDaysLoaded = useAppSelector(selectIsDaysLoaded);
  const isRecordsReady = useAppSelector(
    (state) => selectIsRecordsReady(state) && selectIsMovesLoaded(state),
  );
  const isLoaded = isPlanLoaded && isDaysLoaded && isRecordsReady;
  const lookahead = useDeferredLookahead(today, isLoaded);
  const view = useAppSelector((state) => selectDraft(state, dayKey, today));
  const planStance = useAppSelector(selectStance);
  const changeableIds = useAppSelector(selectChangeableKey);

  if (!view || !isDaysLoaded || !isRecordsReady) {
    return (
      <Subview title='Income day' onClose={onClose}>
        <p className='text-muted-foreground text-sm'>
          {isLoaded ? 'This income day is not coming up.' : 'Getting this day.'}
        </p>
      </Subview>
    );
  }

  const { day, draft, items, sourceNames, override, inheritedPairings } = view;
  const heldLines = draft.lines.filter(
    (line) => line.pairing?.state === 'held',
  );
  const firstHeld = heldLines[0] ?? null;
  const firstHeldName =
    firstHeld !== null && Object.hasOwn(items, firstHeld.itemId)
      ? items[firstHeld.itemId].name
      : DRAFT_WORDS.billFallback;
  const effectivePairings = override?.pairings ?? inheritedPairings;
  const hasChanges =
    override !== null &&
    (override.pairings !== null ||
      Object.keys(override.holdResolutions).length > 0 ||
      Object.keys(override.payloads).length > 0 ||
      Object.keys(override.billCents).length > 0);

  const persist = async (
    change: (current: typeof EMPTY_OVERRIDE) => typeof EMPTY_OVERRIDE,
  ) => {
    if (!user) return;
    const encryption = await getRunwayEncryption(user.uid);
    await saveDayOverride(
      user.uid,
      encryption,
      { payLineId: day.payLineId, sourceId: day.sourceId, expectedOn: day.on },
      change,
    );
  };
  const save = async (
    change: (current: typeof EMPTY_OVERRIDE) => typeof EMPTY_OVERRIDE,
  ) => {
    setError(null);
    setIsSaving(true);
    try {
      await persist(change);
    } catch (saveError) {
      setError(
        getErrorMessage(saveError, 'This did not save. Nothing was changed.'),
      );
    } finally {
      setIsSaving(false);
    }
  };
  const notArrived = async () => {
    if (!user) return;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const ref = {
        payLineId: day.payLineId,
        sourceId: day.sourceId,
        expectedOn: day.on,
      };
      await markNotArrived(user.uid, encryption, ref);
      addToast({
        title: CONFIRM_WORDS.markedNotArrived,
        type: 'success',
        action: {
          label: ITEM_SHEET_R2_WORDS.undo,
          onClick: () => void undoNotArrived(user.uid, encryption, ref),
        },
      });
    } catch (markError) {
      setError(
        getErrorMessage(markError, 'This did not save. Nothing was changed.'),
      );
    } finally {
      setIsSaving(false);
    }
  };
  const choose = (line: DraftLineData, choice: HoldChoice) =>
    save((current) => ({
      ...current,
      holdResolutions: { ...current.holdResolutions, [line.itemId]: choice },
    }));
  const undoChoice = (line: DraftLineData) =>
    save((current) => ({
      ...current,
      holdResolutions: Object.fromEntries(
        Object.entries(current.holdResolutions).filter(
          ([itemId]) => itemId !== line.itemId,
        ),
      ),
    }));
  const resetShare = async (line: DraftLineData) => {
    const before = override?.billCents?.[line.itemId];
    if (!user || before === undefined) return;
    const name = Object.hasOwn(items, line.itemId)
      ? items[line.itemId].name
      : DRAFT_WORDS.billFallback;
    const dayRef = {
      payLineId: day.payLineId,
      sourceId: day.sourceId,
      expectedOn: day.on,
    };
    const date = formatDateUTC(day.on);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await saveBillShare(user.uid, encryption, dayRef, line.itemId, null, {
        itemId: line.itemId,
        summary: PAY_SHARE_WORDS.resetSummary(name, date),
        note: null,
      });
      addToast({
        title: PAY_SHARE_WORDS.resetToast(name),
        type: 'success',
        action: {
          label: PAY_SHARE_WORDS.undo,
          onClick: () =>
            void saveBillShare(
              user.uid,
              encryption,
              dayRef,
              line.itemId,
              before,
              {
                itemId: line.itemId,
                summary: PAY_SHARE_WORDS.restoreSummary(
                  name,
                  formatCents(before),
                  date,
                ),
                note: null,
              },
            ).catch((undoError: unknown) =>
              addToast({
                title: PAY_SHARE_WORDS.undoFailed,
                description: getErrorMessage(undoError, ''),
                type: 'error',
              }),
            ),
        },
      });
    } catch (resetError) {
      addToast({
        title: PAY_SHARE_WORDS.saveFailed,
        description: getErrorMessage(resetError, ''),
        type: 'error',
      });
    }
  };
  const funded = draft.lines.filter((line) => line.shortBy === 0);
  const unfunded = draft.lines.filter((line) => line.shortBy > 0);
  const fixIds = new Set(
    (lookahead?.problems ?? []).flatMap((problem) =>
      problem.kind === 'short' && problem.dayKey === dayKey
        ? [problem.itemId]
        : [],
    ),
  );
  const lesserCount =
    lookahead === null
      ? 0
      : unfunded.filter((line) => !fixIds.has(line.itemId)).length;
  const title = day.sourceName ?? day.payLineName;

  const renderLine = (line: (typeof draft.lines)[number]) => {
    const isKnown = Object.hasOwn(items, line.itemId);
    const envelope = isKnown
      ? items[line.itemId]
      : {
          name: line.bill ? DRAFT_WORDS.billFallback : 'Envelope',
          emoji: null,
        };
    return (
      <DraftLine
        key={line.lineId}
        line={line}
        isWarning={fixIds.has(line.itemId)}
        isOpen={openLineId === line.lineId}
        onOpenChange={(isOpen) => setOpenLineId(isOpen ? line.lineId : null)}
        name={envelope.name}
        kind={isKnown ? (line.bill ? 'bill' : 'envelope') : null}
        sourceNames={sourceNames}
        daySourceId={day.sourceId}
        today={today}
        dayKey={dayKey}
        onChoose={choose}
        onUndoChoice={undoChoice}
        isChoosing={isSaving}
        isDayOnly={
          Object.hasOwn(override?.payloads ?? {}, line.itemId) ||
          Object.hasOwn(override?.billCents ?? {}, line.itemId)
        }
        onResetShare={resetShare}
        canChange={day.on >= today && changeableIds.has(line.itemId)}
      />
    );
  };
  const stance = effectiveStance(planStance, day.stanceOverride);
  const statusLine =
    describeRange(day.amount, stance, 'income', Boolean(day.stanceOverride)) ??
    ITEM_SHEET_WORDS.draftStatus;
  const dayLeft = <CoverageHeadline freeCents={draft.freeToSpend.cents} />;
  const fundsNames = effectivePairings.flatMap((pairing) =>
    Object.hasOwn(items, pairing.targetItemId)
      ? [items[pairing.targetItemId].name]
      : [],
  );

  return (
    <Subview
      title={formatDayTitle(day.on)}
      onClose={onClose}
      headerAction={<ValuesEyeButton />}
    >
      <div className='space-y-4'>
        <div className='border-border bg-accent rounded-2xl border p-4'>
          <p className='text-muted-foreground text-sm font-medium break-words'>
            {day.sourceName ? `${title}, ${day.payLineName}` : title}
          </p>
          <p className='text-4xl font-semibold tracking-tight tabular-nums'>
            <MaskedText>{formatCents(draft.moneyCents)}</MaskedText>
          </p>
          <p className='text-muted-foreground text-sm'>
            <MaskedText>{statusLine}</MaskedText>
          </p>
        </div>
        {draft.lines.length === 0 ? (
          <EmptyCard icon={<Mail className='h-5 w-5' />}>
            Nothing is set to be funded from this day. Add an envelope or a bill
            in Plan and it will show here.
          </EmptyCard>
        ) : (
          <div className='space-y-4'>
            {funded.length > 0 && (
              <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                {funded.map(renderLine)}
              </ul>
            )}
            {dayLeft}
            {unfunded.length > 0 && (
              <div className='space-y-2'>
                <SectionDivider
                  label={
                    isHidden ? NEEDS_LOOK_WORDS.short : DRAFT_WORDS.notFunded
                  }
                />
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {unfunded.map(renderLine)}
                </ul>
                {lesserCount > 0 && (
                  <InlineNotice tone='info'>
                    {DRAFT_WORDS.lesserLeft(lesserCount, unfunded.length)}
                  </InlineNotice>
                )}
              </div>
            )}
          </div>
        )}
        <ActionGroup isRoomy caption={ITEM_SHEET_WORDS.dayMore}>
          <ActionRow
            isGrouped
            isRoomy
            hasChevron
            icon={<Link2 />}
            label={ITEM_SHEET_WORDS.funds}
            subtitle={
              fundsNames.length === 0
                ? ITEM_SHEET_WORDS.fundsSub
                : fundsNames.length > 3
                  ? `${fundsNames.slice(0, 3).join(', ')} and ${fundsNames.length - 3} more`
                  : fundsNames.join(', ')
            }
            onClick={() => setIsEditingFunds(true)}
          />
          {hasChanges && (
            <ActionRow
              isGrouped
              isRoomy
              icon={<Undo2 />}
              label={DRAFT_WORDS.useThePlan}
              isDisabled={isSaving}
              onClick={() => void save(() => EMPTY_OVERRIDE)}
            />
          )}
          <ActionRow
            isGrouped
            isRoomy
            icon={<CalendarX />}
            label={CONFIRM_WORDS.markNotArrived}
            subtitle={ITEM_SHEET_WORDS.notArrivedSub}
            isDisabled={isSaving}
            onClick={() => void notArrived()}
          />
        </ActionGroup>
        <div className='bg-background border-border sticky bottom-0 z-10 -mx-(--subview-pad) -mb-(--subview-pad) border-t px-(--subview-pad) pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]'>
          <ModalFooterActions
            note={
              error ??
              (firstHeld && isHidden ? (
                <NeedsALookRow />
              ) : firstHeld ? (
                <Button
                  type='button'
                  variant='tertiary'
                  className='text-foreground! h-auto min-h-10 w-full justify-between gap-2 px-0! text-left text-sm font-normal whitespace-normal'
                  onClick={() => setOpenLineId(firstHeld.lineId)}
                >
                  <span className='min-w-0'>
                    {(firstHeld.pairing?.heldCents ?? 0) > 0
                      ? CHECKLIST_R3_WORDS.heldNote(
                          firstHeldName,
                          formatCentsShort(firstHeld.pairing?.heldCents ?? 0),
                        )
                      : CHECKLIST_R3_WORDS.shortNote(
                          firstHeldName,
                          formatCentsShort(firstHeld.shortBy),
                        )}
                  </span>
                  <ChevronRight
                    className='text-muted-foreground h-4 w-4 shrink-0'
                    aria-hidden='true'
                  />
                </Button>
              ) : undefined)
            }
            rightActions={
              <Button
                type='button'
                className='w-full'
                disabled={heldLines.length > 0 || isSaving}
                onClick={() => setIsConfirming(true)}
              >
                {CONFIRM_WORDS.action}
              </Button>
            }
          />
        </div>
      </div>
      {isConfirming && (
        <ConfirmSheet
          view={view}
          stance={stance}
          onClose={() => setIsConfirming(false)}
        />
      )}
      {isEditingFunds && (
        <PairingsEditor
          isOpen
          title={ITEM_SHEET_WORDS.fundsTitle(title)}
          fromLabel={title}
          locked={[]}
          initial={effectivePairings}
          onClose={() => setIsEditingFunds(false)}
          onSave={(pairings) =>
            persist((current) => ({ ...current, pairings }))
          }
        />
      )}
    </Subview>
  );
}

/** One income day: its draft while it is coming, what was confirmed once it has arrived, or a way to put it back after it did not. */
function IncomeDayScreen({ dayKey, onClose }: IncomeDayScreenProps) {
  const today = todayAsUtcDate(useNow(60_000));
  const listed = useAppSelector((state) => {
    const { open, confirmed } = selectListedDays(state, today);
    return (
      [...open, ...confirmed, ...selectHistoryListedDays(state, today)].find(
        (entry) => entry.dayKey === dayKey,
      ) ?? null
    );
  });
  const isOlder = useAppSelector((state) =>
    selectIsDayOlderThanRecent(state, dayKey),
  );
  const isOlderFailed = useAppSelector(
    (state) => state.runway.historyFailedFor !== null,
  );

  if (listed === null && isOlder) {
    return (
      <Subview title='Income day' onClose={onClose}>
        <p className='text-muted-foreground text-sm'>
          {isOlderFailed ? DAYS_WORDS.failedMonth : DAYS_WORDS.loadingDay}
        </p>
      </Subview>
    );
  }

  if (listed?.status === 'confirmed') {
    return <ConfirmedDayView day={listed} onClose={onClose} />;
  }
  if (listed?.status === 'notArrived') {
    return <NotArrivedView day={listed} onClose={onClose} />;
  }
  return <DraftDay dayKey={dayKey} onClose={onClose} />;
}

export default IncomeDayScreen;

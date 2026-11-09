import { useEffect, useRef, useState } from 'react';
import {
  Ban,
  CalendarClock,
  HandCoins,
  History,
  Pencil,
  RotateCcw,
  Unlink,
  Unlock,
} from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import LockedButton from '@/components/LockedButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatDateRangeOrdinalUTC } from '@apps/runway/utils/horizonText';
import { formatCents } from '@/utils/moneyUtils';
import CostRow from '@apps/runway/components/CostRow';
import {
  NOTICE_MAIN_BUTTON,
  NOTICE_QUIET_BUTTON,
} from '@apps/runway/components/noticeButtonClasses';
import MarkOutsideCostRow from '@apps/runway/components/MarkOutsideCostRow';
import CoversLine from '@apps/runway/components/CoversLine';
import HorizonBringBackView from '@apps/runway/components/HorizonBringBackView';
import HorizonEndView from '@apps/runway/components/HorizonEndView';
import HorizonChangeView from '@apps/runway/components/HorizonChangeView';
import PlanChangePickerView from '@apps/runway/components/PlanChangePickerView';
import ItemHistoryView from '@apps/runway/components/ItemHistoryView';
import { MaskedText } from '@apps/runway/components/MaskedText';
import PutTowardView from '@apps/runway/components/PutTowardView';
import TakeFromPaysView from '@apps/runway/components/TakeFromPaysView';
import SheetHead from '@apps/runway/components/SheetHead';
import {
  CHANGE_REASON_CHIPS,
  COST_PAID_WORDS,
  FIX_WORDS,
  HORIZON_END_WORDS,
  HORIZON_WORDS,
  ITEM_SHEET_WORDS,
  ITEM_VIEW_WORDS,
  MAX_HORIZON_COSTS,
  PART_OF_WORDS,
  RANGE_END_WORDS,
} from '@apps/runway/constants';
import {
  changeCost,
  getCostPriority,
  getNextVersionId,
  listEndlessCosts,
  listOpenCosts,
  type CostChange,
  getPurchaseMarkFigures,
  type CostPaidEntry,
} from '@apps/runway/engine/horizon';
import {
  getLinkDoneOn,
  getLinkSpan,
  hasLinkHappened,
  removeLink,
  sortLinksByDate,
} from '@apps/runway/engine/horizonLinks';
import type { HorizonShort } from '@apps/runway/engine/lookahead';
import { getRangeEnd } from '@apps/runway/engine/stance';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  releaseHorizonHeld,
  setHorizonStateWith,
  undoHorizonState,
} from '@apps/runway/store/actions/horizonActions';
import {
  selectBalances,
  selectHeldBy,
} from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectAllCards,
  selectAllHorizonItems,
  selectComingDays,
  selectEnvelopes,
  selectGoals,
  selectCostPaid,
  selectCostPayments,
  selectItemStops,
  selectSpendPurchases,
} from '@apps/runway/store/selectors/runwaySelectors';
import {
  isCountedAt,
  usePriorityDial,
} from '@apps/runway/hooks/usePriorityDial';
import CostForm from '@apps/runway/forms/CostForm';
import HorizonChangeForm from '@apps/runway/forms/HorizonChangeForm';
import CostSheet from '@apps/runway/screens/plan/CostSheet';
import type { HorizonCost, HorizonSealed, Stance } from '@apps/runway/types';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { getCardNamer } from '@apps/runway/utils/cardText';
import {
  describeChange,
  type ItemPayload,
} from '@apps/runway/utils/changeText';
import { getHorizonStatus } from '@apps/runway/utils/horizonText';

interface HorizonSheetProps {
  itemId: string;
  horizon: HorizonSealed;
  today: number;
  stance: Stance;
  /** The fronted payment the sheet was opened for, said again inside it. */
  fronted?: Extract<HorizonShort, { kind: 'fronted' }> | null;
  /** A cost to open on, with Back leading to the event's sheet. */
  openCostId?: string | null;
  /** Opened from another record's sheet: the cost's Back returns there, named so. */
  returnLabel?: string | null;
  onClose: () => void;
}

/** One event: what is left of the money put toward it, what that covers, then the costs by date. */
function HorizonSheet({
  itemId,
  horizon,
  today,
  stance,
  fronted = null,
  openCostId = null,
  returnLabel = null,
  onClose,
}: HorizonSheetProps) {
  const { dial } = usePriorityDial();
  const balances = useAppSelector(selectBalances);
  const paid = useAppSelector(selectCostPaid)[itemId];
  const costPayments = useAppSelector((state) =>
    selectCostPayments(state, today),
  );
  const purchases = useAppSelector(selectSpendPurchases);
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const { isHidden } = useValuesHidden();
  const { showOnPlan } = useRunwayUrlState();
  const [isTakingFromPays, setIsTakingFromPays] = useState(false);
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const [isReleasing, setIsReleasing] = useState(false);
  const [view, setView] = useState<
    | 'main'
    | 'change'
    | 'history'
    | 'finish'
    | 'callOff'
    | 'bringBack'
    | 'planChange'
  >('main');
  const [unlinkId, setUnlinkId] = useState<string | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const versions = useAppSelector((state) => state.runway.versions);
  const stops = useAppSelector(selectItemStops);
  const allCards = useAppSelector(selectAllCards);
  const [costId, setCostId] = useState<string | null>(openCostId);
  const [costEdit, setCostEdit] = useState<CostChange | 'form' | null>(null);
  const [addState, setAddState] = useState<'form' | HorizonCost | null>(null);
  const [putting, setPutting] = useState<{
    initialCents: number | null;
  } | null>(null);
  const {
    figures,
    plan,
    plannedCents,
    plannedHighCents,
    isPlannedRange,
    outsidePaidCents,
    outsideDueCents,
    hasRepeats,
    stage,
  } = getHorizonStatus(
    horizon,
    balances.assignedByItem[itemId] ?? 0,
    today,
    stance,
    paid,
    balances.costPaidByItem[itemId] ?? 0,
    balances.costFromFreeByItem[itemId] ?? 0,
  );
  const { shortfall } = plan;
  const isDone = horizon.state !== 'open';
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  // While hidden every item keeps the same lines, so a missing line never tells an empty balance.
  const getShortBody = () => {
    if (!shortfall) return '';
    if (figures.leftCents <= 0 && !isHidden) {
      return HORIZON_WORDS.shortNothing(horizon.name);
    }
    const cost = horizon.costs.find(({ id }) => id === shortfall.costId);
    if (!cost) return '';
    const isRange = cost.amount.lowCents !== cost.amount.highCents;
    const index = plan.covers.findIndex(
      ({ costId, dueOn }) =>
        costId === shortfall.costId && dueOn === shortfall.dueOn,
    );
    const earlier =
      index > 0
        ? horizon.costs.find(({ id }) => id === plan.covers[index - 1].costId)
        : undefined;
    if (shortfall.availableCents === 0 && earlier) {
      return HORIZON_WORDS.shortAfter(cost.name, earlier.name);
    }
    return HORIZON_WORDS.shortBody(
      cost.name,
      formatCents(shortfall.paymentCents),
      formatCents(shortfall.availableCents),
      index > 0,
      isRange ? RANGE_END_WORDS[getRangeEnd(stance, 'expense')] : null,
    );
  };
  const getRestFromPaysNote = () => {
    const { rest } = horizon;
    const picked =
      rest.kind === 'onePay'
        ? comingDays.find(({ dayKey }) => dayKey === rest.dayKey)
        : undefined;
    return picked
      ? HORIZON_WORDS.restOnePayNote(formatDateOrdinalUTC(picked.on))
      : HORIZON_WORDS.restPaysNote;
  };
  const when =
    horizon.happensUntil === null
      ? HORIZON_WORDS.around(formatDateOrdinalUTC(horizon.happensOn))
      : HORIZON_WORDS.aroundRange(
          formatDateRangeOrdinalUTC(
            horizon.happensOn,
            horizon.happensUntil,
          ).replace(/ /g, '\u00A0'),
        );
  const yearLead = hasRepeats ? `${HORIZON_WORDS.overNextYear} ` : '';
  const fact = [
    horizon.costs.length === 0
      ? ''
      : yearLead +
        HORIZON_WORDS.plannedTotal(
          formatCents(isPlannedRange ? plannedHighCents : plannedCents),
          isPlannedRange,
          hasRepeats,
        ),
    when,
  ]
    .filter(Boolean)
    .join('\u00A0· ');
  const outsideFact = [
    outsidePaidCents > 0 &&
      HORIZON_WORDS.outsideTotal(formatCents(outsidePaidCents)),
    outsideDueCents > 0 &&
      HORIZON_WORDS.outsideDue(formatCents(outsideDueCents)),
  ]
    .filter(Boolean)
    .join('\u00A0· ');
  const outsideLine =
    outsideFact && `${HORIZON_WORDS.outsideLead}\u00A0${outsideFact}`;
  const openCost = horizon.costs.find(({ id }) => id === costId);
  const bodyRef = useRef<HTMLDivElement>(null);
  const viewKey = [
    view,
    costId,
    costEdit === null,
    addState === null,
    isTakingFromPays,
    putting === null,
  ].join();
  // A view swapped in starts at the top, so its back chip is never left under the sticky title.
  useEffect(() => {
    const isScroller = (node: HTMLElement) =>
      /auto|scroll/.test(getComputedStyle(node).overflowY) &&
      node.scrollHeight > node.clientHeight;
    for (
      let node = bodyRef.current?.parentElement;
      node;
      node = node.parentElement
    ) {
      if (isScroller(node)) {
        node.scrollTop = 0;
        return;
      }
    }
  }, [viewKey]);
  const payments = costPayments[itemId] ?? [];
  const getPaid = (costId: string) => {
    const latest = payments
      .flatMap((payment) =>
        payment.costId === costId && payment.paid ? [payment.paid] : [],
      )
      .reduce<CostPaidEntry | null>(
        (best, entry) => (best && best.paidOn >= entry.paidOn ? best : entry),
        null,
      );
    if (!latest) return null;
    const entry =
      latest.mark === 'purchase'
        ? getPurchaseMarkFigures(
            latest,
            purchases.find(({ id }) => id === latest.purchaseId) ?? null,
            balances.costFromFreeByItem[itemId] ?? 0,
          )
        : latest;
    const isSettled = !payments.some(
      (payment) => payment.costId === costId && payment.paid === null,
    );
    const paidOn = formatDateOrdinalUTC(entry.paidOn);
    const getLine = () => {
      if (latest.mark === 'outside')
        return COST_PAID_WORDS.paidOutsideRow(paidOn);
      // A settled row's figure is already what it came to.
      return isSettled
        ? COST_PAID_WORDS.paidHead(paidOn)
        : COST_PAID_WORDS.paidRow(paidOn, formatCents(entry.amountCents));
    };
    return { line: getLine(), amountCents: entry.amountCents, isSettled };
  };
  const outsideToMark = horizon.costs.flatMap((cost) => {
    const payment = payments.find(
      ({ costId, paid }) => costId === cost.id && paid === null,
    );
    return cost.isOutside && payment ? [{ cost, payment }] : [];
  });
  const costs = [...horizon.costs].sort(
    (a, b) => (a.schedule.anchor ?? 0) - (b.schedule.anchor ?? 0),
  );

  const doneOn = formatDateOrdinalUTC(horizon.stateOn ?? horizon.happensOn);
  const sent = horizon.stateMoney;
  const sentPlace =
    sent?.kind === 'place'
      ? ([...envelopes, ...goals].find(({ item }) => item.id === sent.toId)
          ?.version.payload.name ?? HORIZON_END_WORDS.anotherPlace)
      : null;
  const getSentLine = () => {
    if (sent === null || sent.kind === 'held') return null;
    const money = formatCents(sent.cents);
    return sent.kind === 'free'
      ? HORIZON_END_WORDS.wentToFree(money, horizon.state === 'calledOff')
      : HORIZON_END_WORDS.wentToPlace(
          money,
          sentPlace ?? HORIZON_END_WORDS.anotherPlace,
          horizon.state === 'calledOff',
        );
  };
  const sentLine = getSentLine();
  const isNothingPaid = figures.spentCents <= 0 && !isHidden;
  const getHeroLabel = () => {
    if (isNothingPaid) {
      return horizon.state === 'calledOff' && outsidePaidCents > 0
        ? HORIZON_END_WORDS.nothingPaidFrom(horizon.name)
        : HORIZON_END_WORDS.nothingPaid;
    }
    return horizon.state === 'calledOff'
      ? HORIZON_END_WORDS.paidBeforeCallOff
      : HORIZON_END_WORDS.spent;
  };
  const endlessIds = new Set(listEndlessCosts(horizon).map(({ id }) => id));
  const stillOpen = listOpenCosts(horizon, today, stance, paid);
  const waitingOn = stillOpen.filter(({ id }) => !endlessIds.has(id));
  const endlessBlock =
    stage === 'open' &&
    stillOpen.length > 0 &&
    stillOpen.every(({ id }) => endlessIds.has(id))
      ? stillOpen[0]
      : null;

  const release = async () => {
    if (!user || isReleasing) return;
    if (!navigator.onLine) {
      addToast({ title: HORIZON_END_WORDS.offline, type: 'error' });
      return;
    }
    setIsReleasing(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const getFound = () =>
        selectAllHorizonItems(store.getState(), todayAsUtcDate()).find(
          ({ item }) => item.id === itemId,
        )?.version;
      const found = getFound();
      const written = found
        ? await releaseHorizonHeld(user.uid, encryption, {
            itemId,
            horizon: found.payload,
            baseVersionId: found.id,
            today: todayAsUtcDate(),
            leftCents: Math.max(
              0,
              selectBalances(store.getState()).assignedByItem[itemId] ?? 0,
            ),
          })
        : null;
      if (written === null) {
        addToast({ title: HORIZON_END_WORDS.alreadyDone, type: 'error' });
        return;
      }
      const money = formatCents(written.move?.cents ?? 0);
      addToast({
        title: mask(HORIZON_END_WORDS.releasedAmount(money, horizon.name)),
        type: 'success',
        action: {
          label: HORIZON_END_WORDS.undo,
          onClick: () => {
            if (getFound()?.id !== written.versionId) {
              addToast({
                title: HORIZON_END_WORDS.changedSince,
                type: 'error',
              });
              return;
            }
            void undoHorizonState(
              user.uid,
              encryption,
              written,
              HORIZON_END_WORDS.undoReleaseSummary(horizon.name, money),
              todayAsUtcDate(),
              {
                cents: selectHeldBy(store.getState(), null),
                name: HORIZON_END_WORDS.freeTitle,
              },
            )
              .then((isUndone) => {
                addToast(
                  isUndone
                    ? {
                        title: mask(
                          HORIZON_END_WORDS.releaseUndone(money, horizon.name),
                        ),
                        type: 'success',
                      }
                    : { title: HORIZON_END_WORDS.changedSince, type: 'error' },
                );
              })
              .catch((undoError: unknown) =>
                addToast({
                  title: HORIZON_END_WORDS.releaseFailed(horizon.name),
                  description: getErrorMessage(
                    undoError,
                    HORIZON_END_WORDS.failed,
                  ),
                  type: 'error',
                }),
              );
          },
        },
      });
    } catch (releaseError) {
      addToast({
        title: HORIZON_END_WORDS.releaseFailed(horizon.name),
        description: getErrorMessage(releaseError, HORIZON_END_WORDS.failed),
        type: 'error',
      });
    } finally {
      setIsReleasing(false);
    }
  };

  const getItemName = (id: string) => {
    const latest = [...versions]
      .filter((version) => version.itemId === id)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    return latest && 'name' in latest.payload ? latest.payload.name : '';
  };
  const linkLines = sortLinksByDate(horizon.links, versions).flatMap((link) => {
    const span = getLinkSpan(versions, link, stops);
    if (!span) return [];
    const difference = span.before
      ? describeChange(
          span.before.payload as ItemPayload,
          span.version.payload as ItemPayload,
          getCardNamer(allCards),
        ).replace(/ to /g, ' → ')
      : '';
    const isHappened = hasLinkHappened(span, today);
    const getWhen = () => {
      if (!span.isLive) return HORIZON_WORDS.changeNoLonger;
      return isHappened
        ? HORIZON_WORDS.changeHappened(
            formatDateOrdinalUTC(getLinkDoneOn(span)),
          )
        : HORIZON_WORDS.changeFrom(formatDateOrdinalUTC(span.startsOn));
    };
    const when = getWhen();
    return [
      {
        link,
        isLive: span.isLive,
        itemName: getItemName(link.itemId),
        line: HORIZON_WORDS.changeLine(
          getItemName(link.itemId),
          difference,
          when,
        ),
      },
    ];
  });
  const liveCount = linkLines.filter(({ isLive }) => isLive).length;
  const unlinking = linkLines.find(({ link }) => link.changeId === unlinkId);
  const unlinkChange = async () => {
    if (!user || isUnlinking || !unlinking) return;
    setIsUnlinking(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const found = selectAllHorizonItems(
        store.getState(),
        todayAsUtcDate(),
      ).find(({ item }) => item.id === itemId)?.version;
      const isWritten =
        found !== undefined &&
        (await setHorizonStateWith(user.uid, encryption, {
          versionId: getNextVersionId(found.id),
          itemId,
          horizon: removeLink(found.payload, unlinking.link.changeId),
          summary: PART_OF_WORDS.unlinkedLine(unlinking.itemName, horizon.name),
          note: null,
          on: todayAsUtcDate(),
          move: null,
        }));
      if (!isWritten) {
        addToast({ title: HORIZON_END_WORDS.changedSince, type: 'error' });
        return;
      }
      setUnlinkId(null);
    } catch (unlinkError) {
      addToast({
        title: HORIZON_WORDS.unlinkFailed,
        description: getErrorMessage(unlinkError, ''),
        type: 'error',
      });
    } finally {
      setIsUnlinking(false);
    }
  };
  const isChangesOnly = horizon.costs.length === 0;
  const changesBlock =
    linkLines.length === 0 && horizon.state !== 'open' ? null : (
      <div className='space-y-2'>
        {linkLines.length > 0 && (
          <>
            <p className='text-muted-foreground text-sm font-medium'>
              {HORIZON_WORDS.changesCaption}
            </p>
            <ActionGroup>
              {linkLines.map(({ link, line }) => (
                <ActionRow
                  key={link.changeId}
                  isGrouped
                  hasChevron={horizon.state === 'open'}
                  icon={<CalendarClock />}
                  label={mask(line)}
                  onClick={() =>
                    horizon.state === 'open'
                      ? setUnlinkId(link.changeId)
                      : undefined
                  }
                />
              ))}
            </ActionGroup>
          </>
        )}
        {horizon.state === 'open' && (
          <ActionGroup>
            <ActionRow
              isGrouped
              hasChevron
              icon={<CalendarClock />}
              label={HORIZON_WORDS.planChange}
              subtitle={HORIZON_WORDS.planChangeSub}
              onClick={() => setView('planChange')}
            />
          </ActionGroup>
        )}
      </div>
    );

  if (addState === 'form') {
    return (
      <CostForm
        itemName={horizon.name}
        itemPriority={horizon.priority}
        happensOn={horizon.happensOn}
        takenNames={horizon.costs.map(({ name }) => name)}
        onSave={setAddState}
        onClose={() => setAddState(null)}
      />
    );
  }
  if (openCost && costEdit === 'form') {
    return (
      <CostForm
        isAmountFixed
        itemName={horizon.name}
        itemPriority={horizon.priority}
        happensOn={horizon.happensOn}
        cost={openCost}
        takenNames={horizon.costs
          .filter(({ id }) => id !== openCost.id)
          .map(({ name }) => name)}
        onSave={setCostEdit}
        onClose={() => setCostEdit(null)}
      />
    );
  }

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={horizon.name}
      actions={<ValuesEyeButton />}
    >
      <div ref={bodyRef} className='contents' />
      {view === 'finish' || view === 'callOff' ? (
        <HorizonEndView
          itemId={itemId}
          horizon={horizon}
          mode={view}
          today={today}
          stance={stance}
          onBack={() => setView('main')}
          onClose={onClose}
        />
      ) : view === 'bringBack' ? (
        <HorizonBringBackView
          itemId={itemId}
          horizon={horizon}
          today={today}
          stance={stance}
          onBack={() => setView('main')}
          onClose={() => {
            setCostId(null);
            setView('main');
          }}
        />
      ) : view === 'planChange' ? (
        <PlanChangePickerView
          eventId={itemId}
          today={today}
          onBack={() => setView('main')}
        />
      ) : view === 'change' ? (
        <HorizonChangeForm
          itemId={itemId}
          horizon={horizon}
          today={today}
          onBack={() => setView('main')}
          onDone={() => setView('main')}
        />
      ) : view === 'history' ? (
        <div className='flex flex-1 flex-col gap-4'>
          <div className='flex items-center gap-1'>
            <BackLink isChevronOnly onBack={() => setView('main')} />
            <p className='min-w-0 text-2xl font-semibold'>
              {ITEM_VIEW_WORDS.historyTitle}
            </p>
          </div>
          <ItemHistoryView itemId={itemId} />
        </div>
      ) : openCost && costEdit !== null && costEdit !== 'form' ? (
        <HorizonChangeView
          itemId={itemId}
          backLabel={openCost.name}
          title={HORIZON_WORDS.changeCost(openCost.name)}
          current={horizon}
          candidate={changeCost(horizon, openCost.id, costEdit)}
          blocker={null}
          reasonChips={CHANGE_REASON_CHIPS.horizon}
          onBack={() => setCostEdit(null)}
          onDone={() => setCostEdit(null)}
        />
      ) : openCost ? (
        <CostSheet
          itemId={itemId}
          horizon={horizon}
          cost={openCost}
          today={today}
          stance={stance}
          backLabel={returnLabel}
          onBack={() => {
            if (returnLabel !== null) {
              onClose();
              return;
            }
            setCostId(null);
            setCostEdit(null);
          }}
          onChange={() => setCostEdit('form')}
          onCallOff={() => {
            setCostId(null);
            setView('callOff');
          }}
          onBringBack={() => setView('bringBack')}
        />
      ) : addState !== null ? (
        <HorizonChangeView
          itemId={itemId}
          backLabel={horizon.name}
          title={HORIZON_WORDS.add(addState.name)}
          current={horizon}
          candidate={{ ...horizon, costs: [...horizon.costs, addState] }}
          blocker={
            horizon.costs.length >= MAX_HORIZON_COSTS
              ? HORIZON_WORDS.maxCosts(MAX_HORIZON_COSTS)
              : null
          }
          reasonChips={CHANGE_REASON_CHIPS.horizon}
          onBack={() => setAddState(null)}
          onDone={() => setAddState(null)}
        />
      ) : isTakingFromPays ? (
        <TakeFromPaysView
          itemId={itemId}
          horizon={horizon}
          today={today}
          onBack={() => setIsTakingFromPays(false)}
        />
      ) : putting ? (
        <PutTowardView
          itemId={itemId}
          name={horizon.name}
          today={today}
          initialCents={putting.initialCents}
          onBack={() => setPutting(null)}
        />
      ) : isDone ? (
        <div className='flex flex-1 flex-col gap-4'>
          <SheetHead
            label={getHeroLabel()}
            figure={isNothingPaid ? undefined : formatCents(figures.spentCents)}
            fact={
              horizon.state === 'calledOff'
                ? HORIZON_END_WORDS.calledOffOn(doneOn)
                : HORIZON_END_WORDS.doneOn(doneOn)
            }
          />
          <div className='text-muted-foreground space-y-0.5 text-sm'>
            {sentLine && (
              <p>
                <MaskedText>{sentLine}</MaskedText>
              </p>
            )}
            {figures.leftCents > 0 && (
              <p>
                <MaskedText>
                  {HORIZON_END_WORDS.stillHeld(formatCents(figures.leftCents))}
                </MaskedText>
              </p>
            )}
          </div>
          {changesBlock}
          {!isChangesOnly && (
            <div className='space-y-2'>
              <p className='text-muted-foreground text-sm font-medium'>
                {HORIZON_WORDS.costsCaption}
              </p>
              <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                {costs.map((cost) => {
                  const costPaid = getPaid(cost.id);
                  return (
                    <CostRow
                      key={cost.id}
                      cost={cost}
                      paid={costPaid}
                      stoppedNote={
                        costPaid === null && cost.becameBillId === null
                          ? HORIZON_END_WORDS.stopped
                          : null
                      }
                      onOpen={() => {
                        if (cost.becameBillId !== null) {
                          void showOnPlan('bills', {
                            itemId: cost.becameBillId,
                            returnTo: 'horizon',
                          });
                          return;
                        }
                        setCostId(cost.id);
                        setCostEdit(null);
                      }}
                    />
                  );
                })}
              </ul>
            </div>
          )}
          <ActionGroup isRoomy>
            <ActionRow
              isGrouped
              isRoomy
              hasChevron
              icon={<RotateCcw />}
              label={HORIZON_END_WORDS.bringBackRow}
              subtitle={
                figures.leftCents > 0
                  ? HORIZON_END_WORDS.bringBackHeldSub
                  : HORIZON_END_WORDS.bringBackSub
              }
              onClick={() => setView('bringBack')}
            />
            {figures.leftCents > 0 && (
              <ActionRow
                isGrouped
                isRoomy
                icon={<Unlock />}
                label={mask(
                  HORIZON_END_WORDS.release(formatCents(figures.leftCents)),
                )}
                subtitle={mask(
                  HORIZON_END_WORDS.releaseSub(formatCents(figures.leftCents)),
                )}
                isDisabled={isReleasing}
                onClick={() => void release()}
              />
            )}
            <ActionRow
              isGrouped
              isRoomy
              hasChevron
              icon={<History />}
              label={ITEM_SHEET_WORDS.history}
              subtitle={ITEM_SHEET_WORDS.historySub}
              onClick={() => setView('history')}
            />
          </ActionGroup>
        </div>
      ) : (
        <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
          {endlessBlock && (
            <InlineNotice tone='info'>
              <p>{HORIZON_END_WORDS.endless(endlessBlock.name)}</p>
            </InlineNotice>
          )}
          {stage === 'readyToFinish' && (
            <InlineNotice tone='success' title={HORIZON_END_WORDS.readyTitle}>
              <p>{HORIZON_END_WORDS.readySub}</p>
            </InlineNotice>
          )}
          {isChangesOnly ? (
            <SheetHead
              label={
                liveCount === 0
                  ? HORIZON_WORDS.noChangesYet
                  : HORIZON_WORDS.changesCount(liveCount)
              }
              fact={when}
            />
          ) : (
            <SheetHead
              label={HORIZON_WORDS.left}
              figure={formatCents(figures.leftCents)}
              fact={
                figures.setAsideCents === 0 && !isHidden
                  ? null
                  : HORIZON_WORDS.leftFact(
                      formatCents(figures.setAsideCents),
                      formatCents(figures.spentCents),
                      figures.fromFreeCents > 0 || isHidden
                        ? formatCents(figures.fromFreeCents)
                        : null,
                    )
              }
            />
          )}
          {!isChangesOnly && (
            <CoversLine
              plan={plan}
              costs={horizon.costs}
              heldCents={figures.leftCents}
              stance={stance}
              isSetAsideUsed={figures.setAsideCents > 0}
              after={
                (horizon.rest.kind === 'pays' ||
                  horizon.rest.kind === 'onePay') &&
                plan.coveredUntil !== null
                  ? getRestFromPaysNote()
                  : null
              }
            />
          )}
          {shortfall && (
            <InlineNotice
              tone='warning'
              title={
                <MaskedText>
                  {HORIZON_WORDS.shortTitle(
                    formatCents(shortfall.shortCents),
                    formatDateOrdinalUTC(shortfall.dueOn),
                    shortfall.totalShortCents > shortfall.shortCents
                      ? formatCents(
                          shortfall.totalShortCents - shortfall.shortCents,
                        )
                      : null,
                  )}
                </MaskedText>
              }
            >
              <p>
                <MaskedText>{getShortBody()}</MaskedText>
              </p>
              <div className='mt-2 flex flex-wrap gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className={NOTICE_MAIN_BUTTON.warning}
                  onClick={() =>
                    setPutting({ initialCents: shortfall.shortCents })
                  }
                >
                  {HORIZON_WORDS.putMore}
                </Button>
                {horizon.rest.kind === 'later' && (
                  <Button
                    type='button'
                    variant='tertiary'
                    size='sm'
                    className={NOTICE_QUIET_BUTTON}
                    onClick={() => setIsTakingFromPays(true)}
                  >
                    {HORIZON_WORDS.takeFromPays}
                  </Button>
                )}
              </div>
            </InlineNotice>
          )}
          {fronted && !shortfall && (
            <InlineNotice tone='warning'>
              <p>
                {FIX_WORDS.frontedSummary(
                  fronted.name,
                  formatDateOrdinalUTC(fronted.dueOn),
                  formatDateOrdinalUTC(fronted.payOn),
                )}
              </p>
            </InlineNotice>
          )}
          {horizon.rest.kind === 'outside' && plan.coveredUntil !== null && (
            <p className='text-muted-foreground text-sm'>
              {HORIZON_WORDS.restOutsideNote}
            </p>
          )}
          <div className='text-muted-foreground space-y-0.5 text-sm'>
            <p>
              <MaskedText>{fact}</MaskedText>
            </p>
            {outsideLine && (
              <p>
                <MaskedText>{outsideLine}</MaskedText>
              </p>
            )}
            {stage === 'open' && waitingOn.length > 0 && (
              <p className='pt-2'>
                {HORIZON_END_WORDS.finishWaits(
                  waitingOn.slice(0, 2).map(({ name }) => name),
                  Math.max(0, waitingOn.length - 2),
                )}
              </p>
            )}
          </div>
          <div className='space-y-2'>
            {!isChangesOnly && (
              <>
                <p className='text-muted-foreground text-sm font-medium'>
                  {HORIZON_WORDS.costsCaption}
                </p>
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {costs.map((cost) => (
                    <CostRow
                      key={cost.id}
                      cost={cost}
                      paid={getPaid(cost.id)}
                      badge={
                        cost.priority !== null &&
                        cost.priority !== horizon.priority
                          ? cost.priority
                          : null
                      }
                      isFaded={
                        !isCountedAt(
                          getCostPriority(cost, horizon.priority),
                          dial,
                        )
                      }
                      onOpen={() => {
                        if (cost.becameBillId !== null) {
                          void showOnPlan('bills', {
                            itemId: cost.becameBillId,
                            returnTo: 'horizon',
                          });
                          return;
                        }
                        setCostId(cost.id);
                        setCostEdit(null);
                      }}
                    />
                  ))}
                </ul>
              </>
            )}
            {horizon.costs.length >= MAX_HORIZON_COSTS ? (
              <LockedButton
                label={HORIZON_WORDS.addCost}
                title={HORIZON_WORDS.maxCostsTitle}
              >
                <p>{HORIZON_WORDS.maxCosts(MAX_HORIZON_COSTS)}</p>
              </LockedButton>
            ) : (
              <Button
                type='button'
                variant='secondary'
                onClick={() => setAddState('form')}
              >
                {HORIZON_WORDS.addCost}
              </Button>
            )}
            {outsideToMark.length > 0 && (
              <ActionGroup isRoomy>
                {outsideToMark.map(({ cost, payment }) => (
                  <MarkOutsideCostRow
                    key={cost.id}
                    itemId={itemId}
                    itemName={horizon.name}
                    cost={cost}
                    payment={payment}
                  />
                ))}
              </ActionGroup>
            )}
          </div>
          {changesBlock}
          <ActionGroup isRoomy>
            {!shortfall && !isChangesOnly && (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<HandCoins />}
                label={HORIZON_WORDS.putMore}
                subtitle={HORIZON_WORDS.putMoreSub}
                onClick={() => setPutting({ initialCents: null })}
              />
            )}
            <ActionRow
              isGrouped
              isRoomy
              hasChevron
              icon={<Pencil />}
              label={HORIZON_WORDS.changeItem}
              subtitle={HORIZON_WORDS.changeItemSub}
              onClick={() => setView('change')}
            />
            <ActionRow
              isGrouped
              isRoomy
              hasChevron
              icon={<Ban />}
              label={HORIZON_END_WORDS.callOffRow}
              subtitle={HORIZON_END_WORDS.callOffRowSub}
              onClick={() => setView('callOff')}
            />
            <ActionRow
              isGrouped
              isRoomy
              hasChevron
              icon={<History />}
              label={ITEM_SHEET_WORDS.history}
              subtitle={ITEM_SHEET_WORDS.historySub}
              onClick={() => setView('history')}
            />
          </ActionGroup>
          {stage === 'readyToFinish' && (
            <ModalFooterActions
              rightActions={
                <Button type='button' onClick={() => setView('finish')}>
                  {HORIZON_END_WORDS.finishLabel(horizon.name)}
                </Button>
              }
            />
          )}
        </div>
      )}
      {unlinking && (
        <FormSheet
          isOpen
          onClose={() => setUnlinkId(null)}
          title={HORIZON_WORDS.unlinkTitle}
        >
          <div className='space-y-2 pb-4'>
            <p className='text-base font-medium'>
              <MaskedText>{unlinking.line}</MaskedText>
            </p>
            <p className='text-muted-foreground text-sm'>
              {HORIZON_WORDS.unlinkNote}
            </p>
          </div>
          <ModalFooterActions
            cancelAction={
              <Button
                type='button'
                variant='secondary'
                disabled={isUnlinking}
                onClick={() => setUnlinkId(null)}
              >
                Cancel
              </Button>
            }
            rightActions={
              <Button
                type='button'
                loading={isUnlinking}
                disabled={isUnlinking}
                onClick={() => void unlinkChange()}
              >
                <Unlink className='h-4 w-4' aria-hidden='true' />
                {HORIZON_WORDS.unlinkRow(horizon.name)}
              </Button>
            }
          />
        </FormSheet>
      )}
    </FormSheet>
  );
}

export default HorizonSheet;

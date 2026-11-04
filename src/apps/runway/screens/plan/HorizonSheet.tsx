import { useState } from 'react';
import { HandCoins, History, Pencil, Plus } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatDateRangeOrdinalUTC } from '@apps/runway/utils/horizonText';
import { formatCents } from '@/utils/moneyUtils';
import CostRow from '@apps/runway/components/CostRow';
import CoversLine from '@apps/runway/components/CoversLine';
import HorizonChangeView from '@apps/runway/components/HorizonChangeView';
import ItemHistoryView from '@apps/runway/components/ItemHistoryView';
import { MaskedText } from '@apps/runway/components/MaskedText';
import PutTowardView from '@apps/runway/components/PutTowardView';
import TakeFromPaysView from '@apps/runway/components/TakeFromPaysView';
import SheetHead from '@apps/runway/components/SheetHead';
import {
  FIX_WORDS,
  HORIZON_WORDS,
  ITEM_SHEET_WORDS,
  ITEM_VIEW_WORDS,
  MAX_HORIZON_COSTS,
  RANGE_END_WORDS,
} from '@apps/runway/constants';
import type { HorizonShort } from '@apps/runway/engine/lookahead';
import { getRangeEnd } from '@apps/runway/engine/stance';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectComingDays } from '@apps/runway/store/selectors/runwaySelectors';
import CostForm from '@apps/runway/forms/CostForm';
import HorizonChangeForm from '@apps/runway/forms/HorizonChangeForm';
import CostSheet from '@apps/runway/screens/plan/CostSheet';
import type { HorizonCost, HorizonSealed, Stance } from '@apps/runway/types';
import { getHorizonStatus } from '@apps/runway/utils/horizonText';

interface HorizonSheetProps {
  itemId: string;
  horizon: HorizonSealed;
  today: number;
  stance: Stance;
  /** The fronted payment the sheet was opened for, said again inside it. */
  fronted?: Extract<HorizonShort, { kind: 'fronted' }> | null;
  onClose: () => void;
}

/** One event: what is left of the money put toward it, what that covers, then the costs by date. */
function HorizonSheet({
  itemId,
  horizon,
  today,
  stance,
  fronted = null,
  onClose,
}: HorizonSheetProps) {
  const balances = useAppSelector(selectBalances);
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const { isHidden } = useValuesHidden();
  const [isTakingFromPays, setIsTakingFromPays] = useState(false);
  const [view, setView] = useState<'main' | 'change' | 'history'>('main');
  const [costId, setCostId] = useState<string | null>(null);
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
    outsideCents,
    hasRepeats,
  } = getHorizonStatus(
    horizon,
    balances.assignedByItem[itemId] ?? 0,
    today,
    stance,
  );
  const { shortfall } = plan;
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
          formatDateRangeOrdinalUTC(horizon.happensOn, horizon.happensUntil),
        );
  const yearLead = hasRepeats ? `${HORIZON_WORDS.overNextYear} ` : '';
  const fact = [
    yearLead +
      HORIZON_WORDS.plannedTotal(
        formatCents(isPlannedRange ? plannedHighCents : plannedCents),
        isPlannedRange,
        hasRepeats,
      ),
    outsideCents > 0 && HORIZON_WORDS.outsideTotal(formatCents(outsideCents)),
    when,
  ]
    .filter(Boolean)
    .join(' ·\u00A0');
  const openCost = horizon.costs.find(({ id }) => id === costId);
  const costs = [...horizon.costs].sort(
    (a, b) => (a.schedule.anchor ?? 0) - (b.schedule.anchor ?? 0),
  );

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={horizon.name}
      actions={<ValuesEyeButton />}
    >
      {view === 'change' ? (
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
      ) : openCost ? (
        <CostSheet
          itemId={itemId}
          horizon={horizon}
          cost={openCost}
          today={today}
          stance={stance}
          onBack={() => setCostId(null)}
        />
      ) : addState !== null && addState !== 'form' ? (
        <HorizonChangeView
          itemId={itemId}
          backLabel={horizon.name}
          title={HORIZON_WORDS.formTitle}
          current={horizon}
          candidate={{ ...horizon, costs: [...horizon.costs, addState] }}
          blocker={null}
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
      ) : (
        <div className='space-y-4'>
          <SheetHead
            label={HORIZON_WORDS.left}
            figure={formatCents(figures.leftCents)}
            fact={
              figures.setAsideCents === 0 && !isHidden
                ? null
                : HORIZON_WORDS.leftFact(
                    formatCents(figures.setAsideCents),
                    formatCents(figures.spentCents),
                  )
            }
          />
          <CoversLine
            plan={plan}
            costs={horizon.costs}
            heldCents={figures.leftCents}
            stance={stance}
            after={
              (horizon.rest.kind === 'pays' ||
                horizon.rest.kind === 'onePay') &&
              plan.coveredUntil !== null
                ? getRestFromPaysNote()
                : null
            }
          />
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
                  variant='secondary'
                  size='sm'
                  onClick={() =>
                    setPutting({ initialCents: shortfall.shortCents })
                  }
                >
                  {HORIZON_WORDS.putMore}
                </Button>
                {horizon.rest.kind === 'later' && (
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
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
          <ActionGroup isRoomy>
            {!shortfall && (
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
              icon={<History />}
              label={ITEM_SHEET_WORDS.history}
              subtitle={ITEM_SHEET_WORDS.historySub}
              onClick={() => setView('history')}
            />
          </ActionGroup>
          <p className='text-muted-foreground text-sm'>
            <MaskedText>{fact}</MaskedText>
          </p>
          <div className='space-y-2'>
            <p className='text-muted-foreground text-sm font-medium'>
              {HORIZON_WORDS.costsCaption}
            </p>
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {costs.map((cost) => (
                <CostRow
                  key={cost.id}
                  cost={cost}
                  onOpen={() => setCostId(cost.id)}
                />
              ))}
            </ul>
            <Button
              type='button'
              variant='secondary'
              disabled={horizon.costs.length >= MAX_HORIZON_COSTS}
              onClick={() => setAddState('form')}
            >
              <Plus className='h-4 w-4' aria-hidden='true' />
              {HORIZON_WORDS.addCost}
            </Button>
            {horizon.costs.length >= MAX_HORIZON_COSTS && (
              <p className='text-muted-foreground text-sm'>
                {HORIZON_WORDS.maxCosts(MAX_HORIZON_COSTS)}
              </p>
            )}
          </div>
          {addState === 'form' && (
            <CostForm
              itemName={horizon.name}
              happensOn={horizon.happensOn}
              onSave={setAddState}
              onClose={() => setAddState(null)}
            />
          )}
        </div>
      )}
    </FormSheet>
  );
}

export default HorizonSheet;

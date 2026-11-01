import { useState } from 'react';
import { Target } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import StoppedHoldingList from '@apps/runway/components/StoppedHoldingList';
import FloatingAction from '@/components/FloatingAction';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { GROUP_WORDS, RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';
import GoalRow from '@apps/runway/components/GoalRow';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getPace } from '@apps/runway/engine/pace';
import { effectiveStance, pick } from '@apps/runway/engine/stance';
import { RangeBasisNote } from '@apps/runway/components/RangeNote';
import GoalForm from '@apps/runway/forms/GoalForm';
import {
  getPriorDays,
  selectComingDays,
  selectHeldByItem,
  selectGoals,
  selectIsMovesLoaded,
  selectIsPlanItemsLoaded,
  selectIsRecordsReady,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import PlanTotal from '@apps/runway/components/PlanTotal';
import {
  isCountedAt,
  usePriorityDial,
} from '@apps/runway/hooks/usePriorityDial';
import { describePlanTotal } from '@apps/runway/utils/billText';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

function GoalsScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const isLoaded = useAppSelector(
    (state) =>
      selectIsPlanItemsLoaded(state) &&
      selectIsMovesLoaded(state) &&
      selectIsRecordsReady(state),
  );
  const goals = useAppSelector((state) => selectGoals(state, today));
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const stance = useAppSelector(selectStance);
  const heldByItem = useAppSelector(selectHeldByItem);
  const assignedByItem = useAppSelector(selectBalances).assignedByItem;
  const { dial } = usePriorityDial();
  const counted = goals.filter(({ version }) =>
    isCountedAt(version.payload.priority, dial),
  );
  const targetCents = counted.reduce(
    (sum, { version }) => sum + version.payload.targetCents,
    0,
  );
  const totalFigure = describePlanTotal(
    {
      kind: 'saved',
      savedCents: counted.reduce(
        (sum, { item }) => sum + Math.max(0, assignedByItem[item.id] ?? 0),
        0,
      ),
      targetCents,
    },
    dial,
  );
  const items = useAppSelector((state) => state.runway.items);
  const versions = useAppSelector((state) => state.runway.versions);
  const priorDays = getPriorDays(
    items,
    versions,
    today,
    comingDays,
    goals.map(({ version }) => version.payload.funding),
  );
  const { addRequest, clearAdd } = useRunwayUrlState();
  const [formKey, setFormKey] = useState<number | null>(null);
  const isRequested = addRequest === 'goal';
  const [query, setQuery] = useState('');

  const hasRangedIncome = comingDays.some(
    (day) => day.amount.lowCents !== day.amount.highCents,
  );
  const hasSearch = goals.length >= RUNWAY_SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const visible = goals
    .filter(({ version }) =>
      `${version.payload.name} ${version.payload.targetDate === null ? '' : formatDateShortUTC(version.payload.targetDate)}`
        .toLowerCase()
        .includes(needle),
    )
    .map(({ item, version }) => ({
      item,
      payload: version.payload,
      pace: getPace(
        { ...version.payload, heldCents: heldByItem[item.id] ?? 0 },
        comingDays.map((day) => ({
          ...day,
          moneyCents: pick(
            effectiveStance(stance, day.stanceOverride),
            day.amount,
            'income',
          ),
        })),
        priorDays,
      ),
    }));

  const getBody = () => {
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground text-sm'>Getting your goals.</p>
      );
    }
    if (goals.length === 0) {
      return (
        <EmptyCard icon={<Target className='h-5 w-5' />}>
          A goal is money you are saving toward, like a trip or a new laptop.
          Add one with a target and a date, and see what it takes each income
          day.
        </EmptyCard>
      );
    }
    return (
      <div className='space-y-3'>
        {hasSearch && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder='Search goals'
          />
        )}
        {visible.length === 0 ? (
          <p className='text-muted-foreground text-sm'>No goal matches that.</p>
        ) : (
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {visible.map(({ item, payload, pace }) => (
              <GoalRow
                key={item.id}
                goalId={item.id}
                goal={payload}
                pace={pace}
                heldCents={heldByItem[item.id] ?? 0}
                today={today}
                isFaded={!isCountedAt(payload.priority, dial)}
              />
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className='space-y-4'>
      <SectionHeader
        title='Goals'
        action={
          isLoaded && totalFigure ? (
            <PlanTotal
              figure={totalFigure}
              helpTitle={GROUP_WORDS.goalsHelpTitle}
              help={
                <div className='space-y-2'>
                  <p>
                    <MaskedText>
                      {GROUP_WORDS.savingToward(formatCents(targetCents))}
                    </MaskedText>
                  </p>
                  {hasRangedIncome && (
                    <RangeBasisNote stance={stance} side='income' />
                  )}
                </div>
              }
            />
          ) : undefined
        }
      />
      {getBody()}
      {isLoaded && <StoppedHoldingList kind='goal' today={today} />}
      <FloatingAction
        label='Add a goal'
        icon={<Target className='h-5 w-5' aria-hidden='true' />}
        onClick={() => setFormKey((current) => (current ?? 0) + 1)}
      />
      {(formKey !== null || isRequested) && (
        <GoalForm
          key={formKey ?? 'requested'}
          isOpen
          title='Goal'
          onClose={() => {
            setFormKey(null);
            clearAdd();
          }}
        />
      )}
    </div>
  );
}

export default GoalsScreen;

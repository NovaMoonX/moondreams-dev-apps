import { useState } from 'react';
import { Target } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import HelpTip from '@/components/HelpTip';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
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

const SEARCH_THRESHOLD = 8;

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
  const items = useAppSelector((state) => state.runway.items);
  const versions = useAppSelector((state) => state.runway.versions);
  const priorDays = getPriorDays(
    items,
    versions,
    today,
    comingDays,
    goals.map(({ version }) => version.payload.funding),
  );
  const [formKey, setFormKey] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const hasRangedIncome = comingDays.some(
    (day) => day.amount.lowCents !== day.amount.highCents,
  );
  const hasSearch = goals.length >= SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const visible = goals
    .filter(({ version }) =>
      version.payload.name.toLowerCase().includes(needle),
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
        help={
          isLoaded &&
          goals.length > 0 &&
          hasRangedIncome && (
            <HelpTip title='Ranges of pay'>
              <RangeBasisNote stance={stance} side='income' />
            </HelpTip>
          )
        }
        action={
          <Button
            variant='secondary'
            size='sm'
            onClick={() => setFormKey((current) => (current ?? 0) + 1)}
          >
            + New goal
          </Button>
        }
      />
      {getBody()}
      {formKey !== null && (
        <GoalForm
          key={formKey}
          isOpen
          title='Goal'
          onClose={() => setFormKey(null)}
        />
      )}
    </div>
  );
}

export default GoalsScreen;

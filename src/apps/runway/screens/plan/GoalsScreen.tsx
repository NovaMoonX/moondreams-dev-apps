import { useState } from 'react';
import { ChevronRight, CircleCheck, Target, TriangleAlert } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import StoppedHoldingList from '@apps/runway/components/StoppedHoldingList';
import FloatingAction from '@/components/FloatingAction';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { MaskedText } from '@apps/runway/components/MaskedText';
import {
  GOAL_TRACK_WORDS,
  GROUP_WORDS,
  RUNWAY_SEARCH_THRESHOLD,
} from '@apps/runway/constants';
import GoalRow from '@apps/runway/components/GoalRow';
import GroupHeading from '@apps/runway/components/GroupHeading';
import GroupSheet from '@apps/runway/forms/GroupSheet';
import { useGroupFigures } from '@apps/runway/hooks/useGroupFigures';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { useGoalPaces } from '@apps/runway/hooks/useGoalPaces';
import { RangeBasisNote } from '@apps/runway/components/RangeNote';
import GoalForm from '@apps/runway/forms/GoalForm';
import {
  selectComingDays,
  selectHeldByItem,
  selectGoals,
  selectIsMovesLoaded,
  selectIsPlanItemsLoaded,
  selectIsRecordsReady,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import PlanTotal from '@apps/runway/components/PlanTotal';
import {
  isCountedAt,
  usePriorityDial,
} from '@apps/runway/hooks/usePriorityDial';
import { useGoalsSaved } from '@apps/runway/hooks/useGoalsSaved';
import { describePlanTotal } from '@apps/runway/utils/billText';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { revealItem } from '@apps/runway/utils/revealItem';

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
  const { dial } = usePriorityDial();
  const paces = useGoalPaces(today);
  const { savedCents, targetCents, hasTargets } = useGoalsSaved(today);
  const totalFigure = describePlanTotal(
    { kind: 'saved', savedCents, targetCents },
    dial,
    hasTargets,
  );
  const { addRequest, clearAdd, openItem, openItemAt, closeOpenItem } =
    useRunwayUrlState();
  const [formKey, setFormKey] = useState<number | null>(null);
  const isRequested = addRequest === 'goal';
  const [query, setQuery] = useState('');
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const figuresByGroup = useGroupFigures(today, dial);

  const hasRangedIncome = comingDays.some(
    (day) => day.amount.lowCents !== day.amount.highCents,
  );
  const hasSearch = goals.length >= RUNWAY_SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const trackedGoals = paces.filter(({ track }) => track !== null);
  const behindGoals = trackedGoals.filter(({ track }) => track === 'behind');
  const visible = paces.filter(({ payload }) =>
    `${payload.name} ${payload.targetDate === null ? '' : formatDateOrdinalUTC(payload.targetDate)}`
      .toLowerCase()
      .includes(needle),
  );

  const groupIds = new Set(figuresByGroup.map(({ id }) => id));
  const sections = figuresByGroup
    .map((figures) => ({
      figures,
      rows: visible.filter(({ payload }) => payload.groupId === figures.id),
    }))
    .filter(({ rows }) => rows.length > 0);
  const ungrouped = visible.filter(
    ({ payload }) => payload.groupId === null || !groupIds.has(payload.groupId),
  );

  const getList = (rows: typeof visible) => (
    <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
      {rows.map(({ item, payload, pace, paceDial }) => (
        <GoalRow
          key={item.id}
          goalId={item.id}
          goal={payload}
          pace={pace}
          paceDial={paceDial}
          heldCents={heldByItem[item.id] ?? 0}
          request={openItem?.itemId === item.id ? openItem : null}
          onRequestDone={closeOpenItem}
          today={today}
          isFaded={!isCountedAt(payload.priority, dial)}
        />
      ))}
    </ul>
  );

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
        {trackedGoals.length > 0 &&
          (behindGoals.length === 0 ? (
            <div className='flex min-h-10 items-center gap-1'>
              <CircleCheck
                className='text-success h-4 w-4 shrink-0'
                aria-hidden='true'
              />
              <p className='text-sm font-medium'>
                {GOAL_TRACK_WORDS.allOnTrack}
              </p>
            </div>
          ) : (
            <Button
              type='button'
              variant='tertiary'
              className='h-auto min-h-10 w-full items-center justify-start gap-1.5 px-0! py-1 text-left text-sm font-medium whitespace-normal text-(--runway-warning-ink)!'
              aria-label={`${GOAL_TRACK_WORDS.behind(
                behindGoals.map(({ payload }) => payload.name),
              )}. ${GOAL_TRACK_WORDS.openBehind}`}
              onClick={() => {
                const first = behindGoals[0].item.id;
                revealItem(first);
                void openItemAt(first, 'amount');
              }}
            >
              <TriangleAlert className='h-4 w-4 shrink-0' aria-hidden='true' />
              <span className='min-w-0 flex-1'>
                {GOAL_TRACK_WORDS.behind(
                  behindGoals.map(({ payload }) => payload.name),
                )}
              </span>
              <ChevronRight className='h-4 w-4 shrink-0' aria-hidden='true' />
            </Button>
          ))}
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
          <>
            {sections.map(({ figures, rows }) => (
              <div key={figures.id} className='space-y-2'>
                <GroupHeading
                  figures={figures}
                  kind='goals'
                  saved={rows.reduce(
                    (sum, { item, payload }) => ({
                      savedCents:
                        sum.savedCents +
                        Math.min(heldByItem[item.id] ?? 0, payload.targetCents),
                      targetCents: sum.targetCents + payload.targetCents,
                    }),
                    { savedCents: 0, targetCents: 0 },
                  )}
                  onOpen={() => setOpenGroupId(figures.id)}
                />
                {getList(rows)}
              </div>
            ))}
            {ungrouped.length > 0 && (
              <div className='space-y-2'>
                {sections.length > 0 && (
                  <SectionDivider label={GROUP_WORDS.ungroupedGoals} />
                )}
                {getList(ungrouped)}
              </div>
            )}
          </>
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
              dial={dial}
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
      {openGroupId !== null && (
        <GroupSheet
          groupId={openGroupId}
          today={today}
          dial={dial}
          onClose={() => setOpenGroupId(null)}
        />
      )}
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

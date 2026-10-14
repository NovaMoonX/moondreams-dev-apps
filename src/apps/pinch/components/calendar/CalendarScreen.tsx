import { memo, useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Plus, Settings } from 'lucide-react';

import PeriodSwitcher from '@/components/PeriodSwitcher';
import SectionHeader from '@/components/SectionHeader';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import BreakdownDrawer from '@apps/pinch/components/calendar/BreakdownDrawer';
import DayDrawer from '@apps/pinch/components/calendar/DayDrawer';
import DayView from '@apps/pinch/components/calendar/DayView';
import MonthView from '@apps/pinch/components/calendar/MonthView';
import StatsRow from '@apps/pinch/components/calendar/StatsRow';
import WeekView from '@apps/pinch/components/calendar/WeekView';
import SettingsSheet from '@apps/pinch/components/settings/SettingsSheet';
import AddToShoppingSheet from '@apps/pinch/components/shared/AddToShoppingSheet';
import FillInSheet from '@apps/pinch/components/shared/FillInSheet';
import {
  CALENDAR_VIEW_LABELS,
  CALENDAR_VIEWS,
  DEFAULT_CALENDAR_VIEW,
  type CalendarView,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectIngredientsById,
  selectPeriodStats,
  selectPlannedByDay,
  selectPlannedMeals,
  selectRecipes,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type {
  Gap,
  MealType,
  PlannedMeal,
  ShoppingRequest,
} from '@apps/pinch/types';
import {
  formatPeriodTitle,
  getCellDayKey,
  getLocalMonthKey,
  getPeriodRange,
  getVisibleRange,
  isDayInRange,
  isRangeInWindow,
  shiftAnchor,
} from '@apps/pinch/utils/dayKeys';
import { getItemTitle } from '@apps/pinch/utils/mealFormat';

const NO_MEALS: PlannedMeal[] = [];

const VIEW_OPTIONS = CALENDAR_VIEWS.map((value) => ({
  value,
  label: CALENDAR_VIEW_LABELS[value],
}));

interface CalendarScreenProps {
  uid: string;
  /** The month the planned-meals listener is centred on; moved only when a view reaches past what is loaded. */
  shownMonth: string;
  onShownMonthChange: (monthKey: string) => void;
}

function CalendarScreen({
  uid,
  shownMonth,
  onShownMonthChange,
}: CalendarScreenProps) {
  const { openSubview, setIsStartOpen } = usePinchOverlay();
  const [searchParams, setSearchParams] = useSearchParams();
  const plannedByDay = useAppSelector(selectPlannedByDay);
  const hasPlannedMeals = useAppSelector(selectPlannedMeals).length > 0;
  const hasRecipes = useAppSelector(selectRecipes).length > 0;
  const isPlannedLoadFailed = useAppSelector(
    (state) => state.pinch.plannedMeals.loadError !== null,
  );
  const now = useNow();
  const todayKey = getCellDayKey(new Date(now));
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const getMealTitle = useCallback(
    (meal: PlannedMeal) =>
      meal.items.length === 0
        ? ''
        : getItemTitle(meal.items[0], recipesById, ingredientsById) +
          (meal.items.length > 1 ? ` +${meal.items.length - 1}` : ''),
    [recipesById, ingredientsById],
  );
  const [anchorKey, setAnchorKey] = useState(() =>
    shownMonth === getLocalMonthKey(new Date(now))
      ? todayKey
      : `${shownMonth}-01`,
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<{
    dayKey: string;
    mealId: string | null;
  } | null>(null);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [fillIn, setFillIn] = useState<Gap[] | null>(null);
  const [shopping, setShopping] = useState<ShoppingRequest | null>(null);
  const isPhone = useMediaQuery().isBelow('sm');

  const requestedView = searchParams.get('view');
  const view: CalendarView =
    CALENDAR_VIEWS.find((candidate) => candidate === requestedView) ??
    DEFAULT_CALENDAR_VIEW;
  const range = getPeriodRange(view, anchorKey);
  const periodTitle = formatPeriodTitle(view, anchorKey, todayKey);
  const isTodayShown = isDayInRange(todayKey, range);
  const stats = useAppSelector((state) =>
    selectPeriodStats(state, range.startKey, range.endKey),
  );

  const getAddDayKey = () => {
    if (view === 'day') return anchorKey;
    if (selectedKey) return selectedKey;
    return isTodayShown ? todayKey : range.startKey;
  };

  const openPlan = (
    dayKey: string,
    mealType: MealType | null,
    plannedMealId: string | null = null,
  ) =>
    openSubview({
      kind: 'plan',
      dayKey,
      mealType,
      plannedMealId,
      fromMealId: null,
      fromRecipeId: null,
    });

  const goTo = (nextAnchorKey: string, nextView: CalendarView = view) => {
    if (
      !isRangeInWindow(getVisibleRange(nextView, nextAnchorKey), shownMonth)
    ) {
      onShownMonthChange(nextAnchorKey.slice(0, 7));
    }
    setSelectedKey(null);
    setAnchorKey(nextAnchorKey);
  };

  const changeView = (nextView: CalendarView) => {
    if (nextView === view) return;
    const nextParams = new URLSearchParams(searchParams);
    if (nextView === DEFAULT_CALENDAR_VIEW) {
      nextParams.delete('view');
    } else {
      nextParams.set('view', nextView);
    }
    setSearchParams(nextParams, { replace: true });
    goTo(selectedKey ?? (isTodayShown ? todayKey : anchorKey), nextView);
  };

  return (
    <section className='space-y-4'>
      <SectionHeader
        title='Calendar'
        action={
          <div className='flex items-center gap-1'>
            <Button
              type='button'
              variant='tertiary'
              size='icon'
              aria-label='Settings'
              className='size-10'
              onClick={() => setIsSettingsOpen(true)}
            >
              <Settings className='h-5 w-5' aria-hidden='true' />
            </Button>
            <Button
              type='button'
              size='sm'
              rounded='full'
              className='gap-1'
              onClick={() => openPlan(getAddDayKey(), null)}
            >
              <Plus className='h-4 w-4' aria-hidden='true' />
              Add
            </Button>
          </div>
        }
      />
      <PeriodSwitcher
        title={periodTitle}
        unitLabel={view}
        views={VIEW_OPTIONS}
        view={view}
        viewsLabel='Calendar view'
        onViewChange={changeView}
        onPrevious={() => goTo(shiftAnchor(view, anchorKey, -1))}
        onNext={() => goTo(shiftAnchor(view, anchorKey, 1))}
        canJumpToToday={!isTodayShown}
        onToday={() => goTo(todayKey)}
      />
      <StatsRow
        uid={uid}
        stats={stats}
        view={view}
        onOpenBreakdown={() => setIsBreakdownOpen(true)}
        onFillIn={setFillIn}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      {isPlannedLoadFailed && (
        <p className='text-muted-foreground text-center text-sm'>
          We couldn't load your planned meals just now. Check your connection
          and try again.
        </p>
      )}
      {!hasPlannedMeals && !isPlannedLoadFailed && (
        <div className='bg-secondary/50 space-y-3 rounded-2xl p-4 text-center'>
          <p className='text-sm'>
            {hasRecipes
              ? 'Nothing planned yet. Plan your first meal.'
              : 'Nothing planned yet. Plan your first meal, or add a recipe to plan from.'}
          </p>
          <div className='flex flex-wrap justify-center gap-2'>
            <Button
              type='button'
              size='sm'
              variant='secondary'
              rounded='full'
              onClick={() => openPlan(todayKey, null)}
            >
              Plan your first meal
            </Button>
            {!hasRecipes && (
              <Button
                type='button'
                size='sm'
                variant='secondary'
                rounded='full'
                onClick={() =>
                  isPhone
                    ? setIsStartOpen(true, true)
                    : openSubview({
                        kind: 'recipe',
                        id: null,
                        fromCalendar: true,
                      })
                }
              >
                Add a recipe
              </Button>
            )}
          </div>
        </div>
      )}
      {view === 'month' && (
        <MonthView
          monthKey={anchorKey.slice(0, 7)}
          plannedByDay={plannedByDay}
          selectedKey={selectedKey}
          getMealTitle={getMealTitle}
          onSelectDay={(dayKey) => {
            setSelectedKey(dayKey);
            setOpenDay({ dayKey, mealId: null });
          }}
        />
      )}
      {view === 'week' && (
        <WeekView
          startKey={range.startKey}
          todayKey={todayKey}
          plannedByDay={plannedByDay}
          getMealTitle={getMealTitle}
          onOpenDay={(dayKey) => setOpenDay({ dayKey, mealId: null })}
          onOpenMeal={(dayKey, mealId) => setOpenDay({ dayKey, mealId })}
          onAdd={(dayKey) => openPlan(dayKey, null)}
        />
      )}
      {view === 'day' && (
        <DayView
          meals={plannedByDay.get(anchorKey) ?? NO_MEALS}
          onOpenMeal={(mealId) => setOpenDay({ dayKey: anchorKey, mealId })}
          onAdd={() => openPlan(anchorKey, null)}
        />
      )}
      {isSettingsOpen && (
        <SettingsSheet uid={uid} onClose={() => setIsSettingsOpen(false)} />
      )}
      {isBreakdownOpen && (
        <BreakdownDrawer
          periodTitle={periodTitle}
          stats={stats}
          isSingleDay={view === 'day'}
          onClose={() => setIsBreakdownOpen(false)}
        />
      )}
      {fillIn && (
        <FillInSheet uid={uid} gaps={fillIn} onClose={() => setFillIn(null)} />
      )}
      {openDay && (
        <DayDrawer
          key={`${openDay.dayKey}:${openDay.mealId ?? ''}`}
          uid={uid}
          dayKey={openDay.dayKey}
          initialMealId={openDay.mealId}
          onClose={() => setOpenDay(null)}
          onAdd={(mealType) => {
            const { dayKey } = openDay;
            setOpenDay(null);
            openPlan(dayKey, mealType);
          }}
          onEdit={(plannedMealId, mealType) => {
            const { dayKey } = openDay;
            setOpenDay(null);
            openPlan(dayKey, mealType, plannedMealId);
          }}
          onFillIn={(gaps) => {
            setOpenDay(null);
            setFillIn(gaps);
          }}
          onAddToShopping={(request) => {
            setOpenDay(null);
            setShopping(request);
          }}
        />
      )}
      {shopping && (
        <AddToShoppingSheet
          uid={uid}
          request={shopping}
          onClose={() => setShopping(null)}
        />
      )}
    </section>
  );
}

export default memo(CalendarScreen);

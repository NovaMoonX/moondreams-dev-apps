import { memo, useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Plus } from 'lucide-react';

import PeriodSwitcher from '@/components/PeriodSwitcher';
import SectionHeader from '@/components/SectionHeader';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import DayDrawer from '@apps/pinch/components/calendar/DayDrawer';
import MonthView from '@apps/pinch/components/calendar/MonthView';
import SummaryLine from '@apps/pinch/components/calendar/SummaryLine';
import WeekSummarySheet from '@apps/pinch/components/calendar/WeekSummarySheet';
import WeekView from '@apps/pinch/components/calendar/WeekView';
import AddToShoppingSheet from '@apps/pinch/components/shared/AddToShoppingSheet';
import AddToShoppingRow from '@apps/pinch/components/shared/AddToShoppingRow';
import FillInSheet from '@apps/pinch/components/shared/FillInSheet';
import { NutritionViewOptions } from '@apps/pinch/components/shared/ListViewControls';
import { useListViewOptions } from '@apps/pinch/hooks/useListViewOptions';
import {
  CALENDAR_VIEW_LABELS,
  CALENDAR_VIEWS,
  DEFAULT_CALENDAR_VIEW,
  type CalendarView,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { usePinchSessionState } from '@apps/pinch/hooks/usePinchSession';
import {
  selectIngredientsById,
  selectPeriodStats,
  selectPlannedByDay,
  selectPlannedMeals,
  selectMeals,
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
import { getPlannedMealTitle } from '@apps/pinch/utils/mealFormat';

const VIEW_OPTIONS = CALENDAR_VIEWS.map((value) => ({
  value,
  label: CALENDAR_VIEW_LABELS[value],
}));

const parseCalendarView = (stored: unknown) =>
  CALENDAR_VIEWS.find((candidate) => candidate === stored) ?? null;

interface CalendarScreenProps {
  uid: string;
  /** The month the planned-meals listener is centred on; moved only when a view reaches past what is loaded. */
  shownMonth: string;
  onShownMonthChange: (monthKey: string) => void;
  /** The day a toast's View asked to see; the screen opens on it. */
  focusDayKey?: string;
}

function CalendarScreen({
  uid,
  shownMonth,
  onShownMonthChange,
  focusDayKey,
}: CalendarScreenProps) {
  const { openSubview, setIsStartOpen } = usePinchOverlay();
  const [searchParams, setSearchParams] = useSearchParams();
  const plannedByDay = useAppSelector(selectPlannedByDay);
  const hasPlannedMeals = useAppSelector(selectPlannedMeals).length > 0;
  const hasRecipes = useAppSelector(selectRecipes).length > 0;
  const hasSavedMeals = useAppSelector(selectMeals).length > 0;
  const viewOptions = useListViewOptions(uid, 'calendar');
  const isPlannedLoadFailed = useAppSelector(
    (state) => state.pinch.plannedMeals.loadError !== null,
  );
  const now = useNow();
  const todayKey = getCellDayKey(new Date(now));
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const getMealTitle = useCallback(
    (meal: PlannedMeal) =>
      getPlannedMealTitle(meal, recipesById, ingredientsById),
    [recipesById, ingredientsById],
  );
  const [anchorKey, setAnchorKey] = usePinchSessionState(
    'calendar:anchor',
    () =>
      shownMonth === getLocalMonthKey(new Date(now))
        ? todayKey
        : `${shownMonth}-01`,
    focusDayKey,
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<{
    dayKey: string;
    mealId: string | null;
  } | null>(null);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [fillIn, setFillIn] = useState<Gap[] | null>(null);
  const [shopping, setShopping] = useState<ShoppingRequest | null>(null);
  const { isBelow } = useMediaQuery();
  const isPhone = isBelow('sm');
  const isWide = !isBelow('lg');
  const [storedView, setStoredView] = useLocalStorageState<CalendarView | null>(
    `pinch:${uid}:calendar-view`,
    null,
    parseCalendarView,
  );

  const getView = (): CalendarView => {
    const requested = searchParams.get('view');
    if (requested === 'day') return 'week';
    const linked = parseCalendarView(requested);
    if (linked) return linked;
    return storedView ?? DEFAULT_CALENDAR_VIEW[isWide ? 'wide' : 'narrow'];
  };
  const view = getView();
  const isRollingWeek = view === 'week' && !isWide;
  const range = getPeriodRange(view, anchorKey, isRollingWeek);
  const periodTitle = formatPeriodTitle(
    view,
    anchorKey,
    todayKey,
    isRollingWeek,
  );
  const isTodayShown = isDayInRange(todayKey, range);
  const isFromToday = isRollingWeek && range.startKey === todayKey;
  const stats = useAppSelector((state) =>
    selectPeriodStats(state, range.startKey, range.endKey),
  );
  const upcomingMealCount = stats.byDay.reduce(
    (total, day) => (day.dayKey >= todayKey ? total + day.count : total),
    0,
  );
  const isFirstRun = !hasPlannedMeals && !isPlannedLoadFailed;

  const getSummaryLabel = () => {
    if (isFromToday) return 'Next 7 days';
    if (!isTodayShown || isRollingWeek) return null;
    return view === 'month' ? 'This month' : 'This week';
  };

  const getAddDayKey = () => {
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
    const nextRange = getVisibleRange(
      nextView,
      nextAnchorKey,
      nextView === 'week' && !isWide,
    );
    if (!isRangeInWindow(nextRange, shownMonth)) {
      onShownMonthChange(nextAnchorKey.slice(0, 7));
    }
    setSelectedKey(null);
    setAnchorKey(nextAnchorKey);
  };

  const changeView = (nextView: CalendarView) => {
    if (nextView === view) return;
    setStoredView(nextView);
    if (searchParams.has('view')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('view');
      setSearchParams(nextParams, { replace: true });
    }
    goTo(selectedKey ?? (isTodayShown ? todayKey : anchorKey), nextView);
  };

  return (
    <section className='space-y-4'>
      <SectionHeader
        title='Calendar'
        action={
          hasRecipes || hasSavedMeals ? (
            <div className='flex items-center gap-1'>
              <NutritionViewOptions
                options={viewOptions.options}
                customizedCount={viewOptions.customizedCount}
                onChange={viewOptions.update}
                onReset={viewOptions.reset}
              />
              <Button
                type='button'
                size='sm'
                rounded='full'
                className='gap-1'
                onClick={() => openPlan(getAddDayKey(), null)}
              >
                <Plus className='h-4 w-4' aria-hidden='true' />
                Plan
              </Button>
            </div>
          ) : undefined
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
      {stats.plannedCount > 0 && (
        <SummaryLine
          label={getSummaryLabel()}
          stats={stats}
          isPast={range.endKey < todayKey}
          showAverages={viewOptions.options.showAverages}
          onOpen={() => setIsSummaryOpen(true)}
        />
      )}
      {isPlannedLoadFailed && (
        <p className='text-muted-foreground text-center text-sm'>
          We couldn't load your planned meals just now. Check your connection
          and try again.
        </p>
      )}
      {isFirstRun && (
        <div className='bg-secondary/50 space-y-3 rounded-2xl p-4 text-center'>
          <p className='text-sm'>
            {hasRecipes
              ? 'Nothing planned yet. Tap Plan to put a recipe on a day.'
              : 'Bring in a recipe from a chat, a photo or a link, plan your week, and get the shopping list.'}
          </p>
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
              Add your first recipe
            </Button>
          )}
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
      {view === 'week' && !isFirstRun && (
        <WeekView
          startKey={range.startKey}
          todayKey={todayKey}
          hasEarlierDays={isFromToday}
          plannedByDay={plannedByDay}
          getMealTitle={getMealTitle}
          showPrices={viewOptions.options.showPrices}
          onOpenDay={(dayKey) => setOpenDay({ dayKey, mealId: null })}
          onOpenMeal={(dayKey, mealId) => setOpenDay({ dayKey, mealId })}
          onAdd={(dayKey) => openPlan(dayKey, null)}
        />
      )}
      {isSummaryOpen && (
        <WeekSummarySheet
          uid={uid}
          title={periodTitle}
          range={range}
          stats={stats}
          todayKey={todayKey}
          isAveragesOnFront={viewOptions.options.showAverages}
          addToShoppingSlot={
            upcomingMealCount > 0 ? (
              <AddToShoppingRow
                subtitle={`${upcomingMealCount} ${upcomingMealCount === 1 ? 'meal' : 'meals'} from today on`}
                onClick={() => {
                  setIsSummaryOpen(false);
                  setShopping({
                    kind: 'range',
                    startKey:
                      range.startKey > todayKey ? range.startKey : todayKey,
                    endKey: range.endKey,
                  });
                }}
              />
            ) : undefined
          }
          onClose={() => setIsSummaryOpen(false)}
          onOpenDay={(dayKey) => {
            setIsSummaryOpen(false);
            setOpenDay({ dayKey, mealId: null });
          }}
          onFillIn={(gaps) => {
            setIsSummaryOpen(false);
            setFillIn(gaps);
          }}
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

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useSearchParams } from 'react-router-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import AuthRequiredState from '@/ui/AuthRequiredState';
import { hasDialogOnTop } from '@/utils/dialogUtils';
import CalendarScreen from '@apps/pinch/components/calendar/CalendarScreen';
import ContainersSubview from '@apps/pinch/components/containers/ContainersSubview';
import IdeaAddSheet from '@apps/pinch/components/ideas/IdeaAddSheet';
import CookingResumeRow from '@apps/pinch/components/cooking/CookingResumeRow';
import CookingSubview from '@apps/pinch/components/cooking/CookingSubview';
import KitchenScreen from '@apps/pinch/components/kitchen/KitchenScreen';
import PantrySubview from '@apps/pinch/components/pantry/PantrySubview';
import ProductsSubview from '@apps/pinch/components/kitchen/ProductsSubview';
import PlanMealSubview from '@apps/pinch/components/plan/PlanMealSubview';
import SettingsSubview from '@apps/pinch/components/settings/SettingsSubview';
import SharedLinksSubview from '@apps/pinch/components/share/SharedLinksSubview';
import ShoppingScreen from '@apps/pinch/components/shopping/ShoppingScreen';
import MealSubview from '@apps/pinch/components/recipes/MealSubview';
import { RecipeStartDrawer } from '@apps/pinch/components/recipes/RecipeStart';
import RecipeSubview from '@apps/pinch/components/recipes/RecipeSubview';
import RecipesScreen from '@apps/pinch/components/recipes/RecipesScreen';
import SourcesSubview from '@apps/pinch/components/recipes/SourcesSubview';
import PinchNav from '@apps/pinch/components/shell/PinchNav';
import LoadingSkeleton from '@apps/pinch/components/shell/LoadingSkeleton';
import { DEFAULT_PINCH_TAB, PINCH_TABS } from '@apps/pinch/constants';
import { PinchOverlayContext } from '@apps/pinch/hooks/usePinchOverlay';
import { PinchSessionContext } from '@apps/pinch/hooks/usePinchSession';
import { useFreezePastDays } from '@apps/pinch/hooks/useFreezePastDays';
import { usePinchSync } from '@apps/pinch/hooks/usePinchSync';
import { usePinchTheme } from '@apps/pinch/hooks/usePinchTheme';
import {
  selectIsPinchLoaded,
  selectPinchLoadError,
} from '@apps/pinch/store/selectors';
import type { PinchSubview, PinchTab } from '@apps/pinch/types';
import {
  addDaysToKey,
  getLocalMonthKey,
  isRangeInWindow,
} from '@apps/pinch/utils/dayKeys';

const OVERLAY_SUBVIEWS: PinchSubview['kind'][] = [
  'recipe',
  'plan',
  'meal',
  'cook',
];

/** A notification's link (`?open=fridge` or `?open=pantry`) opens that screen as the page loads. */
const getLinkedSubview = (): PinchSubview | null => {
  const open = new URLSearchParams(window.location.search).get('open');
  if (open === 'fridge') return { kind: 'containers' };
  return open === 'pantry' ? { kind: 'pantry' } : null;
};

const getHistoryIndex = () => {
  const index: unknown = window.history.state?.idx;
  return typeof index === 'number' ? index : null;
};

function Pinch() {
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();
  const [subview, setSubview] = useState<PinchSubview | null>(getLinkedSubview);
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isIdeaSheetOpen, setIsIdeaSheetOpen] = useState(false);
  const isStartFromCalendarRef = useRef(false);
  const openStart = useCallback((isOpen: boolean, fromCalendar = false) => {
    if (isOpen) isStartFromCalendarRef.current = fromCalendar;
    setIsStartOpen(isOpen);
  }, []);
  const [shownMonth, setShownMonth] = useState(getLocalMonthKey);
  const subviewRef = useRef<PinchSubview | null>(null);
  const calendarIndexRef = useRef<number | null>(null);
  const [session] = useState(() => new Map<string, unknown>());
  const scrollByTabRef = useRef<Partial<Record<PinchTab, number>>>({});
  const shownTabRef = useRef<PinchTab | null>(null);
  const [resetCounts, setResetCounts] = useState<
    Partial<Record<PinchTab, number>>
  >({});
  const showShoppingTab = useCallback(() => {
    if (subviewRef.current !== null || hasDialogOnTop()) {
      return;
    }
    const next = new URLSearchParams(window.location.search);
    const isFromCalendar = !next.has('tab');
    if (isFromCalendar) calendarIndexRef.current = getHistoryIndex();
    next.set('tab', 'shopping');
    startTransition(() => setSearchParams(next, { replace: !isFromCalendar }));
  }, [setSearchParams]);
  const openSubviewFromToast = useCallback((next: PinchSubview) => {
    if (subviewRef.current !== null || hasDialogOnTop()) {
      return;
    }
    setSubview(next);
  }, []);
  const [calendarFocus, setCalendarFocus] = useState<{
    dayKey: string;
    nonce: number;
  } | null>(null);
  const showCalendarDay = useCallback(
    (dayKey: string) => {
      if (subviewRef.current !== null || hasDialogOnTop()) {
        return;
      }
      const next = new URLSearchParams(window.location.search);
      const isFromTab = next.has('tab');
      next.delete('tab');
      next.set('view', 'week');
      const around = {
        startKey: addDaysToKey(dayKey, -6),
        endKey: addDaysToKey(dayKey, 6),
      };
      startTransition(() => {
        setShownMonth((current) =>
          isRangeInWindow(around, current) ? current : dayKey.slice(0, 7),
        );
        setCalendarFocus((current) => ({
          dayKey,
          nonce: (current?.nonce ?? 0) + 1,
        }));
        setSearchParams(next, { replace: isFromTab });
      });
    },
    [setSearchParams],
  );
  const overlayContext = useMemo(
    () => ({
      subview,
      openSubview: setSubview,
      showShoppingTab,
      showCalendarDay,
      closeSubview: () => setSubview(null),
      closeSubviewIf: (isCurrent: (current: PinchSubview | null) => boolean) =>
        setSubview((current) => (isCurrent(current) ? null : current)),
      isStartOpen,
      setIsStartOpen: openStart,
      openIdeaSheet: () => setIsIdeaSheetOpen(true),
      openSubviewFromToast,
    }),
    [
      subview,
      isStartOpen,
      showShoppingTab,
      showCalendarDay,
      openStart,
      openSubviewFromToast,
    ],
  );

  const isLoaded = useAppSelector(selectIsPinchLoaded);
  const loadError = useAppSelector(selectPinchLoadError);

  useEffect(() => {
    subviewRef.current = subview;
  }, [subview]);

  useEffect(() => {
    if (!searchParams.has('open')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  usePinchTheme();
  usePinchSync(user?.uid ?? null, shownMonth);
  useFreezePastDays(user?.uid ?? null);

  const requestedTab = searchParams.get('tab');
  const activeTab: PinchTab =
    PINCH_TABS.find((tab) => tab === requestedTab) ?? DEFAULT_PINCH_TAB;
  const isTabHidden =
    subview !== null && !OVERLAY_SUBVIEWS.includes(subview.kind);
  const isTabShown = Boolean(user) && isLoaded && !loadError && !isTabHidden;

  useEffect(() => () => session.clear(), [session, user?.uid]);

  useEffect(() => {
    const handleScroll = () => {
      const shown = shownTabRef.current;
      if (shown !== null) scrollByTabRef.current[shown] = window.scrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Each tab opens where it was left (the top on a first visit), never at the scroll of the one before.
  useLayoutEffect(() => {
    if (!isTabShown) {
      shownTabRef.current = null;
      return;
    }
    shownTabRef.current = activeTab;
    window.scrollTo({ top: scrollByTabRef.current[activeTab] ?? 0 });
  }, [activeTab, isTabShown]);

  const resetTab = (tab: PinchTab) => {
    Array.from(session.keys())
      .filter((key) => key.startsWith(`${tab}:`))
      .forEach((key) => session.delete(key));
    if (tab === DEFAULT_PINCH_TAB) setCalendarFocus(null);
    setResetCounts((current) => ({
      ...current,
      [tab]: (current[tab] ?? 0) + 1,
    }));
  };

  // Back from any tab returns to the Calendar and back from the Calendar leaves: only leaving the
  // Calendar adds an entry, and going back to it steps back onto that entry when it is the one below.
  const setActiveTab = (tab: PinchTab) => {
    if (tab === activeTab) {
      if (window.scrollY > 0) {
        const isReduced = window.matchMedia(
          '(prefers-reduced-motion: reduce)',
        ).matches;
        window.scrollTo({ top: 0, behavior: isReduced ? 'auto' : 'smooth' });
        return;
      }
      resetTab(tab);
      return;
    }
    setCalendarFocus(null);
    const historyIndex = getHistoryIndex();
    const isFromCalendar = activeTab === DEFAULT_PINCH_TAB;
    if (
      tab === DEFAULT_PINCH_TAB &&
      historyIndex !== null &&
      calendarIndexRef.current === historyIndex - 1
    ) {
      window.history.back();
      return;
    }
    if (isFromCalendar) calendarIndexRef.current = historyIndex;
    const nextSearchParams = new URLSearchParams(searchParams);
    if (tab === DEFAULT_PINCH_TAB) {
      nextSearchParams.delete('tab');
    } else {
      nextSearchParams.set('tab', tab);
    }
    startTransition(() =>
      setSearchParams(nextSearchParams, { replace: !isFromCalendar }),
    );
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (!user) {
    return <AuthRequiredState message='Please sign in to use Pinch.' />;
  }

  if (!isLoaded) {
    return <LoadingSkeleton />;
  }

  if (loadError) {
    return (
      <div className='page flex items-center justify-center'>
        <div className='max-w-sm space-y-3 text-center'>
          <p className='font-medium'>We couldn't load your kitchen just now.</p>
          <p className='text-muted-foreground text-sm'>
            Check your connection and give it another try.
          </p>
          <Button type='button' onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const getScreen = () => {
    const resetCount = resetCounts[activeTab] ?? 0;
    if (activeTab === 'recipes') {
      return <RecipesScreen key={resetCount} uid={user.uid} />;
    }
    if (activeTab === 'kitchen') {
      return <KitchenScreen key={resetCount} uid={user.uid} />;
    }
    if (activeTab === 'shopping') {
      return <ShoppingScreen key={resetCount} uid={user.uid} />;
    }
    return (
      <CalendarScreen
        key={`${calendarFocus?.nonce ?? 0}-${resetCount}`}
        focusDayKey={calendarFocus?.dayKey}
        uid={user.uid}
        shownMonth={shownMonth}
        onShownMonthChange={setShownMonth}
      />
    );
  };

  return (
    <PinchOverlayContext.Provider value={overlayContext}>
      {isIdeaSheetOpen && (
        <IdeaAddSheet
          uid={user.uid}
          confirmsWithToast
          onClose={() => setIsIdeaSheetOpen(false)}
        />
      )}
      {isStartOpen && (
        <RecipeStartDrawer
          onClose={() => setIsStartOpen(false)}
          onKeepAsIdea={() => {
            setIsStartOpen(false);
            setIsIdeaSheetOpen(true);
          }}
          onPick={(method) => {
            setIsStartOpen(false);
            setSubview({
              kind: 'recipe',
              id: null,
              method,
              fromDrawer: true,
              fromCalendar: isStartFromCalendarRef.current,
            });
          }}
        />
      )}
      {subview?.kind === 'products' && <ProductsSubview uid={user.uid} />}
      {subview?.kind === 'sources' && <SourcesSubview uid={user.uid} />}
      {subview?.kind === 'settings' && <SettingsSubview uid={user.uid} />}
      {subview?.kind === 'shares' && <SharedLinksSubview />}
      {subview?.kind === 'pantry' && (
        <PantrySubview
          key={subview.ingredientId ?? ''}
          uid={user.uid}
          ingredientId={subview.ingredientId ?? null}
        />
      )}
      {subview?.kind === 'containers' && (
        <ContainersSubview
          key={`${subview.recipeId ?? ''}-${subview.mealId ?? ''}-${subview.place ?? ''}`}
          uid={user.uid}
          recipeId={subview.recipeId ?? null}
          mealId={subview.mealId ?? null}
          place={subview.place ?? null}
        />
      )}
      {subview?.kind === 'recipe' && (
        <RecipeSubview uid={user.uid} recipeId={subview.id} />
      )}
      {subview?.kind === 'meal' && (
        <MealSubview uid={user.uid} mealId={subview.id} />
      )}
      {subview?.kind === 'cook' && (
        <CookingSubview
          key={`${subview.recipeId}-${subview.plannedMealId ?? ''}-${(subview.plate ?? []).map((entry) => entry.recipeId).join(',')}`}
          uid={user.uid}
          recipeId={subview.recipeId}
          servings={subview.servings}
          plannedMealId={subview.plannedMealId ?? null}
          plate={subview.plate}
          resume={subview.resume}
        />
      )}
      {subview?.kind === 'plan' && (
        <PlanMealSubview
          key={`${subview.dayKey}-${subview.mealType ?? ''}-${subview.plannedMealId ?? 'new'}-${subview.fromMealId ?? ''}-${subview.fromRecipeId ?? ''}`}
          uid={user.uid}
          dayKey={subview.dayKey}
          mealType={subview.mealType}
          plannedMealId={subview.plannedMealId}
          fromMealId={subview.fromMealId}
          fromRecipeId={subview.fromRecipeId}
        />
      )}
      {/* A subview takes over the app; the tabs stay mounted underneath so search and scroll survive. */}
      <div className={join(isTabHidden && 'hidden')}>
        <div className='page pb-28 lg:pb-8 lg:pl-34'>
          <div className='mx-auto max-w-4xl space-y-4 py-6'>
            {subview?.kind !== 'cook' && <CookingResumeRow uid={user.uid} />}
            <PinchSessionContext.Provider value={session}>
              {getScreen()}
            </PinchSessionContext.Provider>
          </div>
          <PinchNav value={activeTab} onChange={setActiveTab} />
        </div>
      </div>
    </PinchOverlayContext.Provider>
  );
}

export default Pinch;

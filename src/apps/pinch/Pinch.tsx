import {
  useCallback,
  useEffect,
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
import CookingSubview from '@apps/pinch/components/cooking/CookingSubview';
import KitchenScreen from '@apps/pinch/components/kitchen/KitchenScreen';
import ProductsSubview from '@apps/pinch/components/kitchen/ProductsSubview';
import PlanMealSubview from '@apps/pinch/components/plan/PlanMealSubview';
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

function Pinch() {
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();
  const [subview, setSubview] = useState<PinchSubview | null>(null);
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isIdeaSheetOpen, setIsIdeaSheetOpen] = useState(false);
  const isStartFromCalendarRef = useRef(false);
  const openStart = useCallback((isOpen: boolean, fromCalendar = false) => {
    if (isOpen) isStartFromCalendarRef.current = fromCalendar;
    setIsStartOpen(isOpen);
  }, []);
  const [shownMonth, setShownMonth] = useState(getLocalMonthKey);
  const subviewRef = useRef<PinchSubview | null>(null);
  const showShoppingTab = useCallback(() => {
    if (subviewRef.current !== null) {
      return;
    }
    const next = new URLSearchParams(window.location.search);
    next.set('tab', 'shopping');
    startTransition(() => setSearchParams(next));
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
        setSearchParams(next);
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

  usePinchTheme();
  usePinchSync(user?.uid ?? null, shownMonth);
  useFreezePastDays(user?.uid ?? null);

  const requestedTab = searchParams.get('tab');
  const activeTab: PinchTab =
    PINCH_TABS.find((tab) => tab === requestedTab) ?? DEFAULT_PINCH_TAB;

  const setActiveTab = (tab: PinchTab) => {
    setCalendarFocus(null);
    const nextSearchParams = new URLSearchParams(searchParams);
    if (tab === DEFAULT_PINCH_TAB) {
      nextSearchParams.delete('tab');
    } else {
      nextSearchParams.set('tab', tab);
    }
    startTransition(() => setSearchParams(nextSearchParams));
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
    if (activeTab === 'recipes') return <RecipesScreen uid={user.uid} />;
    if (activeTab === 'kitchen') return <KitchenScreen uid={user.uid} />;
    if (activeTab === 'shopping') return <ShoppingScreen uid={user.uid} />;
    return (
      <CalendarScreen
        key={calendarFocus?.nonce}
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
      {subview?.kind === 'containers' && (
        <ContainersSubview
          key={`${subview.recipeId ?? ''}-${subview.mealId ?? ''}`}
          uid={user.uid}
          recipeId={subview.recipeId ?? null}
          mealId={subview.mealId ?? null}
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
          key={`${subview.recipeId}-${subview.plannedMealId ?? ''}`}
          uid={user.uid}
          recipeId={subview.recipeId}
          servings={subview.servings}
          plannedMealId={subview.plannedMealId ?? null}
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
      <div
        className={join(
          subview !== null &&
            subview.kind !== 'recipe' &&
            subview.kind !== 'plan' &&
            subview.kind !== 'meal' &&
            subview.kind !== 'cook' &&
            'hidden',
        )}
      >
        <div className='page pb-28 lg:pb-8 lg:pl-28'>
          <div className='mx-auto max-w-4xl space-y-4 py-6'>{getScreen()}</div>
          <PinchNav value={activeTab} onChange={setActiveTab} />
        </div>
      </div>
    </PinchOverlayContext.Provider>
  );
}

export default Pinch;

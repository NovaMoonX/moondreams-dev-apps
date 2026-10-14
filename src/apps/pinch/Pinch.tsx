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
import CalendarScreen from '@apps/pinch/components/calendar/CalendarScreen';
import KitchenScreen from '@apps/pinch/components/kitchen/KitchenScreen';
import ProductsSubview from '@apps/pinch/components/kitchen/ProductsSubview';
import StoresSubview from '@apps/pinch/components/kitchen/StoresSubview';
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
import { getLocalMonthKey } from '@apps/pinch/utils/dayKeys';

function Pinch() {
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();
  const [subview, setSubview] = useState<PinchSubview | null>(null);
  const [isStartOpen, setIsStartOpen] = useState(false);
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
  const overlayContext = useMemo(
    () => ({
      subview,
      openSubview: setSubview,
      showShoppingTab,
      closeSubview: () => setSubview(null),
      isStartOpen,
      setIsStartOpen,
    }),
    [subview, isStartOpen, showShoppingTab],
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
        uid={user.uid}
        shownMonth={shownMonth}
        onShownMonthChange={setShownMonth}
      />
    );
  };

  return (
    <PinchOverlayContext.Provider value={overlayContext}>
      {isStartOpen && (
        <RecipeStartDrawer
          onClose={() => setIsStartOpen(false)}
          onPick={(method) => {
            setIsStartOpen(false);
            setSubview({ kind: 'recipe', id: null, method, fromDrawer: true });
          }}
        />
      )}
      {subview?.kind === 'stores' && <StoresSubview uid={user.uid} />}
      {subview?.kind === 'products' && <ProductsSubview uid={user.uid} />}
      {subview?.kind === 'sources' && <SourcesSubview uid={user.uid} />}
      {subview?.kind === 'recipe' && (
        <RecipeSubview uid={user.uid} recipeId={subview.id} />
      )}
      {subview?.kind === 'meal' && (
        <MealSubview uid={user.uid} mealId={subview.id} />
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

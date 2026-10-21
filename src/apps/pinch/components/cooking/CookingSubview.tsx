import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'react-redux';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { PillGroup } from '@/components/PillGroup';
import Subview from '@/components/Subview';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useAppSelector, type RootState } from '@/store';
import { hasDialogOnTop } from '@/utils/dialogUtils';
import CookIngredientsView from '@apps/pinch/components/cooking/CookIngredientsView';
import CookStepView from '@apps/pinch/components/cooking/CookStepView';
import CookTimerStrip from '@apps/pinch/components/cooking/CookTimerStrip';
import {
  COOK_VIEW_OPTIONS,
  MAX_COOK_SERVINGS,
  MIN_COOK_SERVINGS,
} from '@apps/pinch/constants';
import { useCookTimers } from '@apps/pinch/hooks/useCookTimers';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { selectRecipesById } from '@apps/pinch/store/selectors';
import type { CookView, Recipe } from '@apps/pinch/types';

const getStartServings = (recipe: Recipe, servings: number | undefined) => {
  const wanted = servings ?? (recipe.servings > 0 ? recipe.servings : 1);
  return Math.min(MAX_COOK_SERVINGS, Math.max(MIN_COOK_SERVINGS, wanted));
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  target.closest('input, textarea, select, [contenteditable="true"]') !== null;

interface CookingSessionProps {
  recipe: Recipe;
  isRemoved: boolean;
  initialServings: number | undefined;
}

function CookingSession({
  recipe,
  isRemoved,
  initialServings,
}: CookingSessionProps) {
  const { closeSubview } = usePinchOverlay();
  const { confirm } = useActionModal();
  const [view, setView] = useState<CookView>('steps');
  const [stepIndex, setStepIndex] = useState(0);
  const [servings, setServings] = useState(() =>
    getStartServings(recipe, initialServings),
  );
  const [gotOut, setGotOut] = useState<Record<string, boolean>>({});
  const [openedUpdatedAt] = useState(recipe.updatedAt);
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const timers = useCookTimers();
  const wakeLock = useWakeLock(true);

  const lastIndex = recipe.steps.length - 1;
  const index = Math.min(stepIndex, lastIndex);
  const isLast = index >= lastIndex;
  const hasSteps = recipe.steps.length > 0;
  const isStepsView = view === 'steps';

  const scrollToTop = () =>
    rootRef.current
      ?.closest<HTMLElement>('[data-subview-overlay]')
      ?.scrollTo({ top: 0 });

  const goBy = (direction: 1 | -1) => {
    const next = index + direction;
    if (next < 0 || next > lastIndex) {
      return;
    }
    setStepIndex(next);
    scrollToTop();
  };

  const leave = async () => {
    if (timers.liveCount > 0) {
      const count = timers.liveCount;
      const isConfirmed = await confirm({
        title: 'Stop timers and leave?',
        message: `${count} ${count === 1 ? 'timer is' : 'timers are'} still going. Timers only run while this screen is open, so leaving stops ${count === 1 ? 'it' : 'them'}.`,
        confirmText: 'Leave',
        cancelText: 'Stay',
        destructive: true,
      });
      if (!isConfirmed) return;
    }
    closeSubview();
  };

  const handleNext = () => (isLast ? void leave() : goBy(1));

  const toggleGotOut = useCallback(
    (id: string, isOut: boolean) =>
      setGotOut((current) => ({ ...current, [id]: isOut })),
    [],
  );
  const resetGotOut = useCallback(() => setGotOut({}), []);

  const keepFocus = () =>
    window.requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) {
        return;
      }
      (stripRef.current ?? primaryRef.current)?.focus({ preventScroll: true });
    });

  const handleStartTimer = (
    stepNumber: number,
    seconds: number,
    label: string,
  ) => {
    timers.start(stepNumber, seconds, label);
    keepFocus();
  };

  const handleDismissTimer = (id: string) => {
    timers.dismiss(id);
    keepFocus();
  };

  const showView = (next: CookView) => {
    setView(next);
    scrollToTop();
  };

  useEffect(() => {
    if (!isStepsView || !hasSteps) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTyping(event.target) ||
        hasDialogOnTop()
      ) {
        return;
      }
      if (event.key === 'ArrowRight') goBy(1);
      if (event.key === 'ArrowLeft') goBy(-1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const showLockNote = !wakeLock.isSupported || wakeLock.hasFailed;
  const isChanged =
    isRemoved ||
    recipe.isArchived === true ||
    recipe.updatedAt !== openedUpdatedAt;

  return (
    <Subview
      overlay
      title={recipe.title}
      onClose={closeSubview}
      onBack={() => void leave()}
    >
      <div ref={rootRef} className='flex flex-1 flex-col gap-4'>
        <PillGroup
          label='Show'
          options={COOK_VIEW_OPTIONS}
          value={view}
          onChange={showView}
          isThin
        />
        {isStepsView ? (
          hasSteps ? (
            <CookStepView
              steps={recipe.steps}
              index={index}
              timers={timers.timers}
              isTimersFull={timers.isFull}
              onStartTimer={handleStartTimer}
              onSwipe={goBy}
            />
          ) : (
            <p className='text-muted-foreground flex-1 py-2 text-center text-sm'>
              This recipe has no steps yet.
            </p>
          )
        ) : (
          <CookIngredientsView
            recipe={recipe}
            servings={servings}
            gotOut={gotOut}
            onServingsChange={setServings}
            onToggle={toggleGotOut}
            onReset={resetGotOut}
          />
        )}
        <div role='status' className='space-y-1 empty:hidden'>
          {isChanged && (
            <p className='text-muted-foreground text-xs'>
              This recipe was changed or removed elsewhere.
            </p>
          )}
          {showLockNote && (
            <p className='text-muted-foreground text-xs'>
              Your screen may turn off while you cook.
            </p>
          )}
        </div>
        <div className='form-footer space-y-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]!'>
          <div role='status' className='empty:hidden'>
            {timers.isNoticeShown && (
              <p className='text-muted-foreground text-xs'>
                Timers only run while this screen is open.
              </p>
            )}
          </div>
          <CookTimerStrip
            timers={timers.timers}
            listRef={stripRef}
            onTick={timers.settle}
            onPause={timers.pause}
            onResume={timers.resume}
            onDismiss={handleDismissTimer}
          />
          <div className='flex gap-3'>
            {isStepsView ? (
              <>
                <Button
                  type='button'
                  variant='secondary'
                  className={join(
                    'h-14 shrink-0 px-6 text-base',
                    '[@media(max-height:500px)]:h-11',
                  )}
                  aria-label='Back to the previous step'
                  disabled={index <= 0}
                  onClick={() => goBy(-1)}
                >
                  Back
                </Button>
                <Button
                  ref={primaryRef}
                  type='button'
                  className={join(
                    'h-14 min-w-0 flex-1 text-lg',
                    '[@media(max-height:500px)]:h-11',
                  )}
                  disabled={!hasSteps}
                  onClick={handleNext}
                >
                  {isLast && hasSteps ? 'Finish' : 'Next'}
                </Button>
              </>
            ) : (
              <Button
                ref={primaryRef}
                type='button'
                className={join(
                  'h-14 min-w-0 flex-1 text-lg',
                  '[@media(max-height:500px)]:h-11',
                )}
                onClick={() => showView('steps')}
              >
                Back to the steps
              </Button>
            )}
          </div>
        </div>
      </div>
    </Subview>
  );
}

interface CookingSubviewProps {
  recipeId: string;
  servings?: number;
}

function CookingSubview({ recipeId, servings }: CookingSubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const store = useStore<RootState>();
  const live = useAppSelector(selectRecipesById).get(recipeId);
  const [lastSeen, setLastSeen] = useState(live);

  useEffect(
    () =>
      store.subscribe(() => {
        const next = selectRecipesById(store.getState()).get(recipeId);
        if (next) setLastSeen(next);
      }),
    [store, recipeId],
  );

  const recipe = live ?? lastSeen;

  if (!recipe) {
    return (
      <Subview overlay title='Cooking' onClose={closeSubview}>
        <p className='text-muted-foreground py-6 text-center text-sm'>
          This recipe isn't in your kitchen anymore.
        </p>
      </Subview>
    );
  }

  return (
    <CookingSession
      recipe={recipe}
      isRemoved={live === undefined}
      initialServings={servings}
    />
  );
}

export default CookingSubview;

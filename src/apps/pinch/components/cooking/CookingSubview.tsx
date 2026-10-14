import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { PillGroup } from '@/components/PillGroup';
import Subview from '@/components/Subview';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useAppSelector } from '@/store';
import { hasDialogOnTop } from '@/utils/dialogUtils';
import CookIngredientsView from '@apps/pinch/components/cooking/CookIngredientsView';
import CookStepView from '@apps/pinch/components/cooking/CookStepView';
import CookTimerStrip from '@apps/pinch/components/cooking/CookTimerStrip';
import { COOK_VIEW_OPTIONS } from '@apps/pinch/constants';
import { useCookTimers } from '@apps/pinch/hooks/useCookTimers';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { selectRecipesById } from '@apps/pinch/store/selectors';
import type { CookView, Recipe } from '@apps/pinch/types';

const MIN_SERVINGS = 0.5;
const MAX_SERVINGS = 1000;

const getStartServings = (recipe: Recipe, servings: number | undefined) => {
  const wanted = servings ?? (recipe.servings > 0 ? recipe.servings : 1);
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, wanted));
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  target.closest('input, textarea, select, [contenteditable="true"]') !== null;

interface CookingSessionProps {
  recipe: Recipe;
  initialServings: number | undefined;
  onFinish: () => void;
}

function CookingSession({
  recipe,
  initialServings,
  onFinish,
}: CookingSessionProps) {
  const [view, setView] = useState<CookView>('steps');
  const [stepIndex, setStepIndex] = useState(0);
  const [servings, setServings] = useState(() =>
    getStartServings(recipe, initialServings),
  );
  const rootRef = useRef<HTMLDivElement>(null);
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

  const handleNext = () => (isLast ? onFinish() : goBy(1));

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

  return (
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
            onStartTimer={timers.start}
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
          onServingsChange={setServings}
        />
      )}
      {showLockNote && (
        <p className='text-muted-foreground text-xs'>
          Your screen may turn off while you cook.
        </p>
      )}
      <div className='form-footer space-y-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]!'>
        {timers.isNoticeShown && (
          <p className='text-muted-foreground text-xs'>
            Timers only run while this screen is open.
          </p>
        )}
        <CookTimerStrip
          timers={timers.timers}
          onPause={timers.pause}
          onResume={timers.resume}
          onDismiss={timers.dismiss}
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
  );
}

interface CookingSubviewProps {
  recipeId: string;
  servings?: number;
}

/** Nothing here is stored: the step, the ticks and the timers end with the screen. */
function CookingSubview({ recipeId, servings }: CookingSubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const recipe = useAppSelector(selectRecipesById).get(recipeId);

  return (
    <Subview overlay title={recipe?.title ?? 'Cooking'} onClose={closeSubview}>
      {recipe ? (
        <CookingSession
          recipe={recipe}
          initialServings={servings}
          onFinish={closeSubview}
        />
      ) : (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          This recipe isn't in your kitchen anymore.
        </p>
      )}
    </Subview>
  );
}

export default CookingSubview;

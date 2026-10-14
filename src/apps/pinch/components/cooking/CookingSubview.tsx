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
import { getErrorMessage } from '@/utils/errorUtils';
import CookIngredientsView from '@apps/pinch/components/cooking/CookIngredientsView';
import CookStepView from '@apps/pinch/components/cooking/CookStepView';
import CookTimerStrip from '@apps/pinch/components/cooking/CookTimerStrip';
import NoteTextField from '@apps/pinch/components/notes/NoteTextField';
import {
  COOK_VIEW_OPTIONS,
  MAX_COOK_SERVINGS,
  MIN_COOK_SERVINGS,
} from '@apps/pinch/constants';
import { useCookActions } from '@apps/pinch/hooks/useCookActions';
import { useCookNote } from '@apps/pinch/hooks/useCookNote';
import { useCookTimers } from '@apps/pinch/hooks/useCookTimers';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectCooksById,
  selectCookSummaries,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { CookView, Recipe } from '@apps/pinch/types';
import { isCookHistoryFull } from '@apps/pinch/utils/cooks';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

const getStartServings = (recipe: Recipe, servings: number | undefined) => {
  const wanted = servings ?? (recipe.servings > 0 ? recipe.servings : 1);
  return Math.min(MAX_COOK_SERVINGS, Math.max(MIN_COOK_SERVINGS, wanted));
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  target.closest('input, textarea, select, [contenteditable="true"]') !== null;

interface CookingSessionProps {
  uid: string;
  recipe: Recipe;
  isRemoved: boolean;
  initialServings: number | undefined;
}

function CookingSession({
  uid,
  recipe,
  isRemoved,
  initialServings,
}: CookingSessionProps) {
  const { closeSubview, closeSubviewIf } = usePinchOverlay();
  const { confirm } = useActionModal();
  const [view, setView] = useState<CookView>('steps');
  const [stepIndex, setStepIndex] = useState(0);
  const [servings, setServings] = useState(() =>
    getStartServings(recipe, initialServings),
  );
  const [gotOut, setGotOut] = useState<Record<string, boolean>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [cookedId, setCookedId] = useState<string | null>(null);
  const [openedUpdatedAt] = useState(recipe.updatedAt);
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const timers = useCookTimers();
  const wakeLock = useWakeLock(true);
  const { isReady: isCooksReady, markRecipeCooked } = useCookActions(uid);
  const isHistoryFull = useAppSelector((state) =>
    isCookHistoryFull(selectCookSummaries(state).get(recipe.id)?.count ?? 0),
  );

  const isCooked = useAppSelector(
    (state) => cookedId !== null && selectCooksById(state).has(cookedId),
  );
  const closeIfStillOpen = () =>
    closeSubviewIf(
      (current) => current?.kind === 'cook' && current.recipeId === recipe.id,
    );
  const note = useCookNote({
    uid,
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    cookId: isCooked ? cookedId : null,
    onSaved: closeIfStillOpen,
  });

  const lastIndex = recipe.steps.length - 1;
  const index = Math.min(stepIndex, lastIndex);
  const isLast = index >= lastIndex;
  const hasSteps = recipe.steps.length > 0;
  const isStepsView = view === 'steps';
  const isFinishShown = isFinished && isStepsView && hasSteps;
  const canMark = isCooksReady && !isRemoved;

  const scrollToTop = () =>
    rootRef.current
      ?.closest<HTMLElement>('[data-subview-overlay]')
      ?.scrollTo({ top: 0 });

  const goBy = (direction: 1 | -1) => {
    if (isFinished) {
      if (direction === -1 && !isCooked) setIsFinished(false);
      return;
    }
    const next = index + direction;
    if (next < 0 || next > lastIndex) {
      return;
    }
    setStepIndex(next);
    scrollToTop();
  };

  const confirmLeave = async () => {
    if (timers.liveCount === 0) return true;

    const count = timers.liveCount;
    const isConfirmed = await confirm({
      title: 'Stop timers and leave?',
      message: `${count} ${count === 1 ? 'timer is' : 'timers are'} still going. Timers only run while this screen is open, so leaving stops ${count === 1 ? 'it' : 'them'}.`,
      confirmText: 'Leave',
      cancelText: 'Stay',
      destructive: true,
    });
    return isConfirmed;
  };

  const leave = async () => {
    if (note.hasDraft) {
      const isDiscarded = await confirm({
        title: 'Discard this note?',
        message:
          "It isn't saved yet. If you leave now, what you typed is lost.",
        confirmText: 'Discard',
        cancelText: 'Keep editing',
        destructive: true,
      });
      if (!isDiscarded) return;
    }
    if (await confirmLeave()) closeIfStillOpen();
  };

  const focusPrimary = () =>
    window.requestAnimationFrame(() =>
      primaryRef.current?.focus({ preventScroll: true }),
    );

  const handleNext = () => {
    if (!isLast) {
      goBy(1);
      return;
    }
    if (!canMark) {
      void leave();
      return;
    }
    setIsFinished(true);
    scrollToTop();
    focusPrimary();
  };

  const handleMarkCooked = async () => {
    setMarkError(null);
    setIsMarking(true);
    try {
      if (!(await confirmLeave())) {
        setIsMarking(false);
        return;
      }
      const id = await markRecipeCooked(recipe, servings);
      timers.clear();
      note.reset();
      setCookedId(id);
      setIsMarking(false);
      focusPrimary();
    } catch (error) {
      setMarkError(getErrorMessage(error, 'Unable to mark this as cooked.'));
      setIsMarking(false);
    }
  };

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

  const showLockNote =
    !isCooked && (!wakeLock.isSupported || wakeLock.hasFailed);
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
        {!isFinishShown && (
          <PillGroup
            label='Show'
            options={COOK_VIEW_OPTIONS}
            value={view}
            onChange={showView}
            isThin
          />
        )}
        {isFinishShown ? (
          isCooked ? (
            <div className='flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center'>
              <p className='text-2xl leading-snug font-medium'>
                Marked as cooked
              </p>
              <div className='space-y-0.5'>
                <p className='font-medium'>{formatServings(servings)}</p>
                <p className='text-muted-foreground text-sm'>
                  Saved to your cooking history.
                </p>
              </div>
              {note.isOpen ? (
                <div className='w-full max-w-md space-y-2 text-left'>
                  <NoteTextField
                    label='Your note'
                    placeholder='Less vinegar next time, the sauce was ready early'
                    value={note.text}
                    onChange={note.setText}
                    shouldFocus
                  />
                  {note.error && (
                    <p className='text-destructive text-sm' role='alert'>
                      {note.error}
                    </p>
                  )}
                </div>
              ) : (
                note.isAvailable && (
                  <Button
                    type='button'
                    variant='link'
                    className='h-10'
                    onClick={note.open}
                  >
                    Add a note about it
                  </Button>
                )
              )}
            </div>
          ) : (
            <div className='flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center'>
              <p className='text-2xl leading-snug font-medium'>
                Nice work. Mark it as cooked?
              </p>
              <div className='space-y-0.5'>
                <p className='font-medium'>{formatServings(servings)}</p>
                <p className='text-muted-foreground text-sm'>
                  Keeps a record. You can change the date later.
                </p>
              </div>
              {isHistoryFull && (
                <p className='text-muted-foreground text-sm'>
                  This recipe's history is full. Delete an older cook to add
                  more.
                </p>
              )}
              {markError && (
                <p className='text-destructive text-sm' role='alert'>
                  {markError}
                </p>
              )}
              <Button
                type='button'
                variant='tertiary'
                className='h-10'
                onClick={() => setIsFinished(false)}
              >
                Back to the last step
              </Button>
            </div>
          )
        ) : isStepsView ? (
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
            {isFinishShown && isCooked && note.isOpen ? (
              <>
                <Button
                  type='button'
                  variant='secondary'
                  className={join(
                    'h-14 shrink-0 px-6 text-base',
                    '[@media(max-height:500px)]:h-11',
                  )}
                  disabled={note.isSaving}
                  onClick={() => {
                    note.cancel();
                    focusPrimary();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type='button'
                  className={join(
                    'h-14 min-w-0 flex-1 text-lg',
                    '[@media(max-height:500px)]:h-11',
                  )}
                  loading={note.isSaving}
                  disabled={note.isSaving || !note.canSave}
                  onClick={() => void note.save()}
                >
                  Save note
                </Button>
              </>
            ) : isFinishShown && isCooked ? (
              <Button
                ref={primaryRef}
                type='button'
                className={join(
                  'h-14 min-w-0 flex-1 text-lg',
                  '[@media(max-height:500px)]:h-11',
                )}
                onClick={() => void leave()}
              >
                Done
              </Button>
            ) : isFinishShown ? (
              <>
                <Button
                  type='button'
                  variant='secondary'
                  className={join(
                    'h-14 shrink-0 px-6 text-base',
                    '[@media(max-height:500px)]:h-11',
                  )}
                  onClick={() => void leave()}
                >
                  Not now
                </Button>
                <Button
                  ref={primaryRef}
                  type='button'
                  className={join(
                    'h-14 min-w-0 flex-1 text-lg',
                    '[@media(max-height:500px)]:h-11',
                  )}
                  loading={isMarking}
                  disabled={isMarking || isHistoryFull || !canMark}
                  onClick={() => void handleMarkCooked()}
                >
                  I cooked this
                </Button>
              </>
            ) : isStepsView ? (
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
  uid: string;
  recipeId: string;
  servings?: number;
}

function CookingSubview({ uid, recipeId, servings }: CookingSubviewProps) {
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
      uid={uid}
      recipe={recipe}
      isRemoved={live === undefined}
      initialServings={servings}
    />
  );
}

export default CookingSubview;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'react-redux';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { NotebookPen } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import NoteTextField from '@/components/NoteTextField';
import { PillGroup } from '@/components/PillGroup';
import Subview from '@/components/Subview';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useAppDispatch, useAppSelector, type RootState } from '@/store';
import { hasDialogOnTop } from '@/utils/dialogUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import CookIngredientsView from '@apps/pinch/components/cooking/CookIngredientsView';
import CookNotes from '@apps/pinch/components/cooking/CookNotes';
import CookPutAway from '@apps/pinch/components/cooking/CookPutAway';
import CookRecord, {
  type CookRecordStatus,
} from '@apps/pinch/components/cooking/CookRecord';
import CookStepView from '@apps/pinch/components/cooking/CookStepView';
import CookTimerStrip from '@apps/pinch/components/cooking/CookTimerStrip';
import {
  COOK_VIEW_OPTIONS,
  MAX_RECIPE_NOTE_LENGTH,
} from '@apps/pinch/constants';
import { useCookActions } from '@apps/pinch/hooks/useCookActions';
import { useCookNote } from '@apps/pinch/hooks/useCookNote';
import { useCookTimers } from '@apps/pinch/hooks/useCookTimers';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { usePutAway } from '@apps/pinch/hooks/usePutAway';
import {
  selectCooksById,
  selectCookSummaries,
  selectIngredientsById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import { updateCook } from '@apps/pinch/store/actions/cookActions';
import type { CookView, Recipe } from '@apps/pinch/types';
import {
  getCookStartServings,
  getPlannedCookId,
  getStepName,
  isCookHistoryFull,
} from '@apps/pinch/utils/cooks';
import { formatKitchenAmount } from '@apps/pinch/utils/kitchenMeasure';
import { scaleAmount } from '@apps/pinch/utils/quantity';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';
import { matchStepIngredients } from '@apps/pinch/utils/stepIngredients';

/** Taps on Next that land after Finish swapped in Done are ignored for this long, so skimming to the end never leaves at once. */
const DONE_GUARD_MS = 600;

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  target.closest('input, textarea, select, [contenteditable="true"]') !== null;

interface CookingSessionProps {
  uid: string;
  recipe: Recipe;
  isRemoved: boolean;
  /** What the plan has for tonight; null when cooking didn't start from a plan. */
  plannedServings: number | null;
  plannedMealId: string | null;
}

function CookingSession({
  uid,
  recipe,
  isRemoved,
  plannedServings,
  plannedMealId,
}: CookingSessionProps) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const { closeSubview, closeSubviewIf } = usePinchOverlay();
  const { confirm } = useActionModal();
  const [view, setView] = useState<CookView>('steps');
  const [stepIndex, setStepIndex] = useState(0);
  const [servings, setServings] = useState(() =>
    getCookStartServings(recipe.servings, plannedServings),
  );
  const [gotOut, setGotOut] = useState<Record<string, boolean>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [cookedId, setCookedId] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<'PENDING' | 'FAILED' | null>(null);
  const finishedAt = useRef(0);
  const [openedUpdatedAt] = useState(recipe.updatedAt);
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const timers = useCookTimers();
  const ingredientsById = useAppSelector(selectIngredientsById);
  const stepMatches = useMemo(
    () =>
      matchStepIngredients(
        recipe.steps,
        recipe.ingredients.map((line) => {
          const ingredient = ingredientsById.get(line.ingredientId);
          return {
            id: line.id,
            ingredientId: line.ingredientId,
            names: ingredient ? [ingredient.name, ...ingredient.aliases] : [],
          };
        }),
      ),
    [recipe.steps, recipe.ingredients, ingredientsById],
  );
  const rows = useMemo(
    () =>
      recipe.ingredients.map((line) => ({
        id: line.id,
        name:
          ingredientsById.get(line.ingredientId)?.name ?? 'Removed ingredient',
        note: line.note,
        amountText: formatKitchenAmount(
          scaleAmount(line.amount, servings, recipe.servings),
          line.unit,
        ),
      })),
    [recipe.ingredients, recipe.servings, ingredientsById, servings],
  );
  const wakeLock = useWakeLock(true);
  const {
    isReady: isCooksReady,
    markRecipeCooked,
    markPlannedRecipeCooked,
    undoCook,
  } = useCookActions(uid);
  const isHistoryFull = useAppSelector((state) =>
    isCookHistoryFull(selectCookSummaries(state).get(recipe.id)?.count ?? 0),
  );
  const plannedCookId = getPlannedCookId(plannedMealId, recipe.id);
  const plannedCook = useAppSelector((state) =>
    plannedCookId === null
      ? null
      : (selectCooksById(state).get(plannedCookId) ?? null),
  );
  const hasPlannedCook = plannedCook !== null;

  const isCookInStore = useAppSelector(
    (state) => cookedId !== null && selectCooksById(state).has(cookedId),
  );
  const isUndone =
    cookedId !== null && undoState === 'PENDING' && !isCookInStore;
  const isCooked = cookedId !== null && !isUndone;
  const closeIfStillOpen = () =>
    closeSubviewIf(
      (current) =>
        current?.kind === 'cook' &&
        current.recipeId === recipe.id &&
        (current.plannedMealId ?? null) === plannedMealId,
    );
  const isAlreadyMarked = hasPlannedCook && cookedId === null && !isMarking;
  const recordedCookId = isCooked
    ? cookedId
    : isAlreadyMarked
      ? plannedCookId
      : null;
  const isRecorded = recordedCookId !== null;
  const note = useCookNote({
    uid,
    recipeId: recipe.id,
    cookId: recordedCookId,
  });

  const putAway = usePutAway({
    uid,
    recipe,
    servings,
    eatenTonight: plannedMealId === null ? null : plannedServings,
    cookId: recordedCookId,
  });

  const lastIndex = recipe.steps.length - 1;
  const index = Math.min(stepIndex, lastIndex);
  const isLast = index >= lastIndex;
  const hasSteps = recipe.steps.length > 0;
  const isStepsView = view === 'steps';
  const isFinishShown = isFinished && isStepsView && hasSteps;
  const canMark = isCooksReady && !isRemoved;
  const care = getRecipeCare(recipe);
  const isScaled = recipe.servings > 0 && servings !== recipe.servings;
  const stepMatch = stepMatches[index] ?? null;
  const stepRows =
    stepMatch === null
      ? []
      : stepMatch.lineIds
          .map((id) => rows.find((row) => row.id === id))
          .filter((row) => row !== undefined);

  const scrollToTop = () =>
    rootRef.current
      ?.closest<HTMLElement>('[data-subview-overlay]')
      ?.scrollTo({ top: 0 });

  const goBy = (direction: 1 | -1) => {
    if (isFinished) {
      if (direction === -1) setIsFinished(false);
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

  const confirmDiscardOf = (title: string, message: string) =>
    confirm({
      title,
      message,
      confirmText: 'Discard',
      cancelText: 'Keep editing',
      destructive: true,
    });

  const confirmDiscard = async () => {
    if (note.hasDraft) {
      return confirmDiscardOf(
        'Discard this note?',
        "It isn't saved yet. Discarding it loses what you typed.",
      );
    }
    if (putAway.hasDraft) {
      return confirmDiscardOf(
        'Discard this container?',
        "It isn't saved yet. Discarding it loses what you chose.",
      );
    }
    return true;
  };

  const leave = async () => {
    if (!(await confirmDiscard())) return;
    if (await confirmLeave()) closeIfStillOpen();
  };

  const cancelNote = async () => {
    if (!(await confirmDiscard())) return;
    note.cancel();
    focusPrimary();
  };

  const focusPrimary = () =>
    window.requestAnimationFrame(() =>
      primaryRef.current?.focus({ preventScroll: true }),
    );

  const saveServings = async (id: string, next: number) => {
    const cook = selectCooksById(store.getState()).get(id);
    if (!cook || cook.servings === next) return;
    setMarkError(null);
    try {
      await dispatch(
        updateCook({ uid, id, servings: next, cookedAt: cook.cookedAt }),
      ).unwrap();
    } catch (error) {
      setMarkError(getErrorMessage(error, 'Unable to save the servings.'));
    }
  };

  const changeServings = (next: number) => {
    setServings(next);
    if (recordedCookId !== null) void saveServings(recordedCookId, next);
  };

  const markCooked = async () => {
    if (isMarking || isHistoryFull || !canMark) return;
    setMarkError(null);
    setIsMarking(true);
    try {
      const id =
        plannedMealId === null
          ? await markRecipeCooked(recipe, servings, { isToasted: false })
          : await markPlannedRecipeCooked({
              plannedMealId,
              recipe,
              servings,
              cookedAt: Date.now(),
            });
      setUndoState(null);
      setCookedId(id);
      setIsMarking(false);
    } catch (error) {
      setMarkError(getErrorMessage(error, 'Unable to mark this as cooked.'));
      setIsMarking(false);
    }
  };

  const undoMarked = async () => {
    const id = cookedId;
    if (id === null || undoState !== null) return;
    setMarkError(null);
    setUndoState('PENDING');
    try {
      await undoCook(id);
      note.reset();
      setCookedId((current) => (current === id ? null : current));
      setUndoState(null);
    } catch (error) {
      setUndoState('FAILED');
      setMarkError(
        `Couldn't undo that. ${getErrorMessage(error, 'You can delete it from the cooking history.')}`,
      );
    }
  };

  const handleNext = () => {
    if (!isLast) {
      goBy(1);
      return;
    }
    if (!canMark) {
      void leave();
      return;
    }
    finishedAt.current = Date.now();
    setIsFinished(true);
    scrollToTop();
    focusPrimary();
    if (recordedCookId !== null) {
      void saveServings(recordedCookId, servings);
    } else if (!isMarking) {
      void markCooked();
    }
  };

  const handleDone = () => {
    if (Date.now() - finishedAt.current < DONE_GUARD_MS) return;
    void leave();
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
    timers.start(
      stepNumber,
      getStepName(recipe.steps[stepNumber - 1] ?? '') || `Step ${stepNumber}`,
      seconds,
      label,
    );
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

  const getRecordStatus = (): CookRecordStatus => {
    if (isMarking) return 'SAVING';
    if (isCooked) return 'NEW';
    if (isAlreadyMarked) return 'EARLIER';
    return 'NONE';
  };
  const recordStatus = getRecordStatus();
  const getRecordProblem = () => {
    if (markError) return { text: markError, isError: true };
    if (recordStatus === 'NONE' && isHistoryFull) {
      return {
        text: "This recipe's history is full. Delete an older cook to add more.",
        isError: false,
      };
    }
    return null;
  };

  const showLockNote =
    !isRecorded && (!wakeLock.isSupported || wakeLock.hasFailed);
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
        {!isFinishShown && <CookNotes recipeId={recipe.id} />}
        {isFinishShown ? (
          <div className='mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 py-6'>
            <p className='text-center text-2xl leading-snug font-medium'>
              Nice work
            </p>
            {!note.isOpen && !putAway.isOpen && (
              <CookRecord
                status={recordStatus}
                servings={servings}
                onServingsChange={changeServings}
                undoState={
                  isCooked || undoState === 'PENDING'
                    ? (undoState ?? 'READY')
                    : null
                }
                onUndo={() => void undoMarked()}
                onMark={
                  isHistoryFull || undoState === 'PENDING'
                    ? null
                    : () => void markCooked()
                }
                problem={getRecordProblem()}
              />
            )}
            {isRecorded && !note.isOpen && (
              <CookPutAway putAway={putAway} care={care} />
            )}
            {isRecorded && note.isOpen && (
              <div className='bg-muted/50 border-border space-y-2 rounded-2xl border p-4'>
                <NoteTextField
                  label='Your note'
                  placeholder='Less vinegar next time, the sauce was ready early'
                  maxLength={MAX_RECIPE_NOTE_LENGTH}
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
            )}
            {isRecorded && note.isSaved && !putAway.isOpen && (
              <p className='text-muted-foreground text-center text-sm'>
                Note saved.
              </p>
            )}
            {isRecorded &&
              note.isAvailable &&
              !note.isSaved &&
              !note.isOpen &&
              !putAway.isOpen && (
                <ActionGroup>
                  <ActionRow
                    icon={<NotebookPen className='h-4 w-4' />}
                    label='Add a note'
                    subtitle='Shown the next time you cook it'
                    onClick={note.open}
                    isGrouped
                  />
                </ActionGroup>
              )}
            {!note.isOpen && !putAway.isOpen && (
              <Button
                type='button'
                variant='tertiary'
                className='h-10 self-center underline'
                onClick={() => setIsFinished(false)}
              >
                Back to the last step
              </Button>
            )}
          </div>
        ) : isStepsView ? (
          hasSteps ? (
            <CookStepView
              steps={recipe.steps}
              index={index}
              ingredients={stepRows}
              isAmountNoteShown={
                isScaled && stepMatch !== null && stepMatch.hasWrittenAmount
              }
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
            rows={rows}
            hasWrittenAmounts={stepMatches.some(
              (match) => match.hasWrittenAmount,
            )}
            servings={servings}
            plannedServings={plannedServings}
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
              This phone may turn the screen off; timers keep running only while
              this screen is open.
            </p>
          )}
        </div>
        <div className='form-footer space-y-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]!'>
          <div role='status' className='empty:hidden'>
            {timers.isNoticeShown && !showLockNote && (
              <p className='text-muted-foreground text-xs'>
                Keep this screen open: timers stop if you leave it.
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
            {isFinishShown && isRecorded && putAway.isOpen ? (
              <>
                <Button
                  type='button'
                  variant='secondary'
                  className={join(
                    'h-14 shrink-0 px-6 text-base',
                    '[@media(max-height:500px)]:h-11',
                  )}
                  disabled={putAway.isSaving}
                  onClick={putAway.skip}
                >
                  Skip
                </Button>
                <Button
                  type='button'
                  className={join(
                    'h-14 min-w-0 flex-1 text-lg',
                    '[@media(max-height:500px)]:h-11',
                  )}
                  loading={putAway.isSaving}
                  disabled={putAway.isSaving || !putAway.canSave}
                  onClick={() => void putAway.save()}
                >
                  Save
                </Button>
              </>
            ) : isFinishShown && isRecorded && note.isOpen ? (
              <>
                <Button
                  type='button'
                  variant='secondary'
                  className={join(
                    'h-14 shrink-0 px-6 text-base',
                    '[@media(max-height:500px)]:h-11',
                  )}
                  disabled={note.isSaving}
                  onClick={() => void cancelNote()}
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
            ) : isFinishShown ? (
              <Button
                ref={primaryRef}
                type='button'
                className={join(
                  'h-14 min-w-0 flex-1 text-lg',
                  '[@media(max-height:500px)]:h-11',
                )}
                onClick={handleDone}
              >
                Done
              </Button>
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
  plannedMealId: string | null;
}

function CookingSubview({
  uid,
  recipeId,
  servings,
  plannedMealId,
}: CookingSubviewProps) {
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
      plannedServings={plannedMealId === null ? null : (servings ?? null)}
      plannedMealId={plannedMealId}
    />
  );
}

export default CookingSubview;

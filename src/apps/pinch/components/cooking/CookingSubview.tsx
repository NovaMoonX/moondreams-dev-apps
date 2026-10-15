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
import { useMediaQuery } from '@/hooks/useMediaQuery';
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
import { useCookTimers, type CookTimer } from '@apps/pinch/hooks/useCookTimers';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { usePutAway } from '@apps/pinch/hooks/usePutAway';
import {
  selectCooksById,
  selectCookSummaries,
  selectIngredientsById,
  selectPlannedMeals,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import { updateCook } from '@apps/pinch/store/actions/cookActions';
import type { CookView, PlateCookRecipe, Recipe } from '@apps/pinch/types';
import {
  getCookStartServings,
  getPlannedCookId,
  getPlateNext,
  getPlateStart,
  getStepName,
  isCookHistoryFull,
  type PlateCookState,
} from '@apps/pinch/utils/cooks';
import { formatKitchenAmount } from '@apps/pinch/utils/kitchenMeasure';
import { getPlannedMealTitle } from '@apps/pinch/utils/mealFormat';
import { scaleAmount } from '@apps/pinch/utils/quantity';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';
import { matchStepIngredients } from '@apps/pinch/utils/stepIngredients';

/** Taps on Next that land after Finish swapped in Done are ignored for this long, so skimming to the end never leaves at once. */
const DONE_GUARD_MS = 600;

const LIST_FORMAT = new Intl.ListFormat('en-US', { type: 'conjunction' });

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  target.closest('input, textarea, select, [contenteditable="true"]') !== null;

interface CookEntry {
  recipe: Recipe;
  isRemoved: boolean;
  /** What the plan has for tonight; null when cooking didn't start from a plan. */
  plannedServings: number | null;
}

interface CookingSessionProps {
  uid: string;
  /** The recipes this session cooks, in plate order; one for a single recipe. */
  entries: CookEntry[];
  /** The recipe the screen was opened with, which a late close checks it is still showing. */
  openedRecipeId: string;
  plannedMealId: string | null;
  /** The header: the recipe's name, or the plate's when there are several. */
  title: string;
}

function CookingSession({
  uid,
  entries,
  openedRecipeId,
  plannedMealId,
  title,
}: CookingSessionProps) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const { closeSubview, closeSubviewIf, openSubview } = usePinchOverlay();
  const { confirm } = useActionModal();
  const [view, setView] = useState<CookView>('steps');
  const [currentId, setCurrentId] = useState(entries[0].recipe.id);
  const [plate, setPlate] = useState(() =>
    getPlateStart(
      entries.map((entry) => ({
        recipeId: entry.recipe.id,
        recipeServings: entry.recipe.servings,
        plannedServings: entry.plannedServings,
      })),
    ),
  );
  const [openedUpdatedAt] = useState(
    () =>
      new Map(
        entries.map((entry) => [entry.recipe.id, entry.recipe.updatedAt]),
      ),
  );
  const entry =
    entries.find((candidate) => candidate.recipe.id === currentId) ??
    entries[0];
  const { recipe, isRemoved, plannedServings } = entry;
  const { stepIndex, servings, gotOut } = plate[recipe.id] ?? {
    stepIndex: 0,
    servings: getCookStartServings(recipe.servings, plannedServings),
    gotOut: {},
  };
  const isPlate = entries.length > 1;
  const [isFinished, setIsFinished] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  /** The cooks this screen wrote, by recipe: only these can be taken back with Undo. */
  const [cookedIds, setCookedIds] = useState<Record<string, string>>({});
  const [undoState, setUndoState] = useState<'PENDING' | 'FAILED' | null>(null);
  const finishedAt = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const timers = useCookTimers();
  const isWide = useMediaQuery().isAtLeast('lg');
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
    markPlannedPlate,
    undoCooks,
  } = useCookActions(uid);
  const cooksById = useAppSelector(selectCooksById);
  const cookSummaries = useAppSelector(selectCookSummaries);
  const records = useMemo(
    () =>
      entries.map((candidate) => {
        const recipeId = candidate.recipe.id;
        const plannedCookId = getPlannedCookId(plannedMealId, recipeId);
        const writtenId = cookedIds[recipeId] ?? null;
        const isUndone =
          writtenId !== null &&
          undoState === 'PENDING' &&
          !cooksById.has(writtenId);
        const isCooked = writtenId !== null && !isUndone;
        const isAlreadyMarked =
          plannedCookId !== null &&
          cooksById.has(plannedCookId) &&
          writtenId === null &&
          !isMarking;
        const recordedCookId = isCooked
          ? writtenId
          : isAlreadyMarked
            ? plannedCookId
            : null;
        return {
          entry: candidate,
          recipeId,
          servings:
            plate[recipeId]?.servings ??
            getCookStartServings(
              candidate.recipe.servings,
              candidate.plannedServings,
            ),
          isCooked,
          isAlreadyMarked,
          recordedCookId,
          isHistoryFull: isCookHistoryFull(
            cookSummaries.get(recipeId)?.count ?? 0,
          ),
        };
      }),
    [
      entries,
      plannedMealId,
      cookedIds,
      undoState,
      cooksById,
      isMarking,
      plate,
      cookSummaries,
    ],
  );
  const closeIfStillOpen = () =>
    closeSubviewIf(
      (current) =>
        current?.kind === 'cook' &&
        current.recipeId === openedRecipeId &&
        (current.plannedMealId ?? null) === plannedMealId,
    );
  const isRecorded = records.some((record) => record.recordedCookId !== null);
  const note = useCookNote({
    uid,
    entries: records.map((record) => ({
      recipeId: record.recipeId,
      cookId: record.recordedCookId,
    })),
  });

  const putAway = usePutAway({
    uid,
    entries: records.map((record) => ({
      recipe: record.entry.recipe,
      servings: record.servings,
      eatenTonight:
        plannedMealId === null ? null : record.entry.plannedServings,
      cookId: record.recordedCookId,
    })),
  });

  const lastIndex = recipe.steps.length - 1;
  const index = Math.min(stepIndex, lastIndex);
  const hasSteps = recipe.steps.length > 0;
  const next = getPlateNext(
    entries.map((candidate) => ({
      recipeId: candidate.recipe.id,
      stepIndex: plate[candidate.recipe.id]?.stepIndex ?? 0,
      stepCount: candidate.recipe.steps.length,
    })),
    recipe.id,
  );
  const nextRecipe =
    next.kind === 'RECIPE'
      ? (entries.find((candidate) => candidate.recipe.id === next.recipeId)
          ?.recipe ?? null)
      : null;
  const isStepsView = view === 'steps' || isWide;
  const isFinishShown = isFinished && isStepsView && hasSteps;
  const canMark =
    isCooksReady && entries.some((candidate) => !candidate.isRemoved);
  const isScaled = recipe.servings > 0 && servings !== recipe.servings;
  const stepMatch = stepMatches[index] ?? null;
  const stepRows =
    stepMatch === null
      ? []
      : stepMatch.lineIds
          .map((id) => rows.find((row) => row.id === id))
          .filter((row) => row !== undefined);

  const updateRecipe = (recipeId: string, patch: Partial<PlateCookState>) =>
    setPlate((current) => {
      const known = current[recipeId];
      return known
        ? { ...current, [recipeId]: { ...known, ...patch } }
        : current;
    });
  const setStepIndex = (next: number) =>
    updateRecipe(recipe.id, { stepIndex: next });
  const setServings = (next: number) =>
    updateRecipe(recipe.id, { servings: next });

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
        'Discard this box?',
        "It isn't saved yet. Discarding it loses what you chose.",
      );
    }
    return true;
  };

  const leave = async () => {
    if (!(await confirmDiscard())) return;
    if (await confirmLeave()) closeIfStillOpen();
  };

  const applyNote = async (noteId: string) => {
    if (!(await confirmDiscard()) || !(await confirmLeave())) return;
    openSubview({ kind: 'recipe', id: recipe.id, fromNoteId: noteId });
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

  const changeServings = (recipeId: string, next: number) => {
    updateRecipe(recipeId, { servings: next });
    const recordedCookId =
      records.find((record) => record.recipeId === recipeId)?.recordedCookId ??
      null;
    if (recordedCookId !== null) void saveServings(recordedCookId, next);
  };

  const markable = records.filter(
    (record) =>
      record.recordedCookId === null &&
      !record.isHistoryFull &&
      !record.entry.isRemoved,
  );

  const writeCooks = async (
    targets: { recipeId: string; servings: number; entry: CookEntry }[],
  ) => {
    if (plannedMealId !== null) {
      const results = await markPlannedPlate({
        plannedMealId,
        entries: targets.map((target) => ({
          recipeId: target.recipeId,
          servings: target.servings,
        })),
        cookedAt: Date.now(),
      });
      return results
        .filter((result) => result.isNew)
        .map((result) => [result.recipeId, result.id] as const);
    }
    const ids = await Promise.all(
      targets.map((target) =>
        markRecipeCooked(target.entry.recipe, target.servings, {
          isToasted: false,
        }),
      ),
    );
    return targets.map((target, at) => [target.recipeId, ids[at]] as const);
  };

  const markCooked = async () => {
    if (isMarking || !canMark || markable.length === 0) return;
    setMarkError(null);
    setIsMarking(true);
    try {
      const written = await writeCooks(markable);
      setUndoState(null);
      setCookedIds((current) => ({
        ...current,
        ...Object.fromEntries(written),
      }));
      setIsMarking(false);
    } catch (error) {
      setMarkError(getErrorMessage(error, 'Unable to mark this as cooked.'));
      setIsMarking(false);
    }
  };

  const undoMarked = async () => {
    const ids = Object.values(cookedIds);
    if (ids.length === 0 || undoState !== null) return;
    setMarkError(null);
    setUndoState('PENDING');
    try {
      await undoCooks(ids);
      note.reset();
      setCookedIds((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([, id]) => !ids.includes(id)),
        ),
      );
      setUndoState(null);
    } catch (error) {
      setUndoState('FAILED');
      setMarkError(
        `Couldn't undo that. ${getErrorMessage(error, 'You can delete it from the cooking history.')}`,
      );
    }
  };

  const showRecipe = (recipeId: string) => {
    setCurrentId(recipeId);
    scrollToTop();
  };

  const handleNext = () => {
    if (next.kind === 'STEP') {
      goBy(1);
      return;
    }
    if (next.kind === 'RECIPE') {
      showRecipe(next.recipeId);
      focusPrimary();
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
    records.forEach((record) => {
      if (record.recordedCookId !== null) {
        void saveServings(record.recordedCookId, record.servings);
      }
    });
    void markCooked();
  };

  const handleDone = () => {
    if (Date.now() - finishedAt.current < DONE_GUARD_MS) return;
    void leave();
  };

  const toggleGotOut = useCallback(
    (id: string, isOut: boolean) =>
      setPlate((current) => {
        const known = current[recipe.id];
        return known
          ? {
              ...current,
              [recipe.id]: {
                ...known,
                gotOut: { ...known.gotOut, [id]: isOut },
              },
            }
          : current;
      }),
    [recipe.id],
  );
  const resetGotOut = useCallback(
    () =>
      setPlate((current) => {
        const known = current[recipe.id];
        return known
          ? { ...current, [recipe.id]: { ...known, gotOut: {} } }
          : current;
      }),
    [recipe.id],
  );

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
      {
        recipeId: recipe.id,
        recipeTitle: isPlate ? recipe.title : null,
        stepNumber,
        stepName:
          getStepName(recipe.steps[stepNumber - 1] ?? '') ||
          `Step ${stepNumber}`,
      },
      seconds,
      label,
    );
    keepFocus();
  };

  const jumpTo = (timer: CookTimer) => {
    const target = entries.find(
      (candidate) => candidate.recipe.id === timer.recipeId,
    );
    if (!target) return;
    updateRecipe(timer.recipeId, {
      stepIndex: Math.max(
        0,
        Math.min(timer.stepNumber, target.recipe.steps.length) - 1,
      ),
    });
    setCurrentId(timer.recipeId);
    setView('steps');
    setIsFinished(false);
    scrollToTop();
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
    if (records.some((record) => record.isCooked)) return 'NEW';
    if (records.some((record) => record.isAlreadyMarked)) return 'EARLIER';
    return 'NONE';
  };
  const recordStatus = getRecordStatus();
  const getRecordProblem = () => {
    if (markError) return { text: markError, isError: true };
    const full = records.filter(
      (record) => record.recordedCookId === null && record.isHistoryFull,
    );
    if (full.length === 0 || (recordStatus !== 'NONE' && !isPlate)) {
      return null;
    }
    return {
      text: isPlate
        ? `${LIST_FORMAT.format(full.map((record) => record.entry.recipe.title))} ${full.length === 1 ? 'has' : 'have'} a full history. Delete an older cook to add more.`
        : "This recipe's history is full. Delete an older cook to add more.",
      isError: false,
    };
  };
  const recordedEntries = records.filter(
    (record) =>
      record.recordedCookId !== null &&
      (!isPlate || putAway.getEntry(record.recipeId)?.isBulk === true),
  );
  const noteRecipes = records.filter(
    (record) =>
      record.recordedCookId !== null &&
      note.isAvailable(record.recipeId) &&
      !note.isSaved(record.recipeId),
  );
  const savedNoteTitles = records
    .filter((record) => note.isSaved(record.recipeId))
    .map((record) => record.entry.recipe.title);
  const openNoteTitle =
    records.find((record) => record.recipeId === note.openRecipeId)?.entry
      .recipe.title ?? null;

  const showLockNote =
    !isRecorded && (!wakeLock.isSupported || wakeLock.hasFailed);
  const isChanged =
    isRemoved ||
    recipe.isArchived === true ||
    recipe.updatedAt !== openedUpdatedAt.get(recipe.id);

  const notesBlock = (
    <CookNotes
      key={recipe.id}
      recipeId={recipe.id}
      onApply={(noteId) => void applyNote(noteId)}
    />
  );
  const stepContent = hasSteps ? (
    <CookStepView
      steps={recipe.steps}
      index={index}
      ingredients={isWide ? [] : stepRows}
      isAmountNoteShown={
        isScaled && stepMatch !== null && stepMatch.hasWrittenAmount
      }
      timers={timers.timers.filter((timer) => timer.recipeId === recipe.id)}
      isTimersFull={timers.isFull}
      onStartTimer={handleStartTimer}
      onSwipe={goBy}
    />
  ) : (
    <p className='text-muted-foreground flex-1 py-2 text-center text-sm'>
      This recipe has no steps yet.
    </p>
  );
  const ingredientsContent = (
    <CookIngredientsView
      recipe={recipe}
      rows={rows}
      stepLineIds={isWide ? (stepMatch?.lineIds ?? null) : null}
      hasWrittenAmounts={stepMatches.some((match) => match.hasWrittenAmount)}
      servings={servings}
      plannedServings={plannedServings}
      gotOut={gotOut}
      onServingsChange={setServings}
      onToggle={toggleGotOut}
      onReset={resetGotOut}
    />
  );

  return (
    <Subview
      overlay
      className='lg:max-w-5xl'
      title={title}
      onClose={closeSubview}
      onBack={() => void leave()}
    >
      <div ref={rootRef} className='flex flex-1 flex-col gap-4'>
        {isPlate && !isFinishShown && (
          <PillGroup
            label='Recipe'
            options={entries.map((candidate) => ({
              value: candidate.recipe.id,
              label: candidate.recipe.title,
            }))}
            value={recipe.id}
            onChange={showRecipe}
            isThin
          />
        )}
        {!isFinishShown && !isWide && (
          <PillGroup
            label='Show'
            options={COOK_VIEW_OPTIONS}
            value={view}
            onChange={showView}
            isThin
          />
        )}
        {!isFinishShown && !isWide && notesBlock}
        {isFinishShown ? (
          <div className='mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 py-6'>
            <p className='text-center text-2xl leading-snug font-medium'>
              Nice work
            </p>
            {!note.isOpen && !putAway.isOpen && (
              <CookRecord
                status={recordStatus}
                rows={records.map((record) => ({
                  id: record.recipeId,
                  label: isPlate ? record.entry.recipe.title : 'Servings made',
                  servings: record.servings,
                  isRecorded: record.recordedCookId !== null,
                }))}
                caption={isPlate ? 'Servings made' : null}
                onServingsChange={changeServings}
                undoState={
                  records.some((record) => record.isCooked) ||
                  undoState === 'PENDING'
                    ? (undoState ?? 'READY')
                    : null
                }
                onUndo={() => void undoMarked()}
                onMark={
                  markable.length === 0 || undoState === 'PENDING'
                    ? null
                    : () => void markCooked()
                }
                problem={getRecordProblem()}
              />
            )}
            {!note.isOpen &&
              recordedEntries.map((record) => (
                <CookPutAway
                  key={record.recipeId}
                  putAway={putAway}
                  recipeId={record.recipeId}
                  care={getRecipeCare(record.entry.recipe)}
                  caption={isPlate ? record.entry.recipe.title : null}
                />
              ))}
            {isRecorded && note.isOpen && (
              <div className='bg-muted/50 border-border space-y-2 rounded-2xl border p-4'>
                <NoteTextField
                  label={
                    isPlate && openNoteTitle
                      ? `Your note about ${openNoteTitle}`
                      : 'Your note'
                  }
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
            {isRecorded && savedNoteTitles.length > 0 && !putAway.isOpen && (
              <p className='text-muted-foreground text-center text-sm text-balance'>
                {isPlate
                  ? `${savedNoteTitles.length === 1 ? 'Note' : 'Notes'} saved for ${LIST_FORMAT.format(savedNoteTitles)}.`
                  : 'Note saved.'}
              </p>
            )}
            {noteRecipes.length > 0 && !note.isOpen && !putAway.isOpen && (
              <ActionGroup>
                {noteRecipes.map((record) => (
                  <ActionRow
                    key={record.recipeId}
                    icon={<NotebookPen className='h-4 w-4' />}
                    label='Add a note'
                    subtitle={
                      isPlate
                        ? record.entry.recipe.title
                        : 'Shown the next time you cook it'
                    }
                    onClick={() => note.open(record.recipeId)}
                    isGrouped
                  />
                ))}
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
        ) : isWide ? (
          <div className='grid flex-1 grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] items-start gap-10'>
            <div className='flex flex-col gap-4'>
              {notesBlock}
              {stepContent}
            </div>
            <div className='border-border border-l pl-8'>
              {ingredientsContent}
            </div>
          </div>
        ) : isStepsView ? (
          stepContent
        ) : (
          ingredientsContent
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
            onJump={
              isFinishShown && (note.isOpen || putAway.isOpen) ? null : jumpTo
            }
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
                  aria-label={
                    nextRecipe ? `Next: ${nextRecipe.title}` : undefined
                  }
                  disabled={!hasSteps && nextRecipe === null}
                  onClick={handleNext}
                >
                  {nextRecipe ? (
                    <span className='min-w-0 truncate'>
                      Next: {nextRecipe.title}
                    </span>
                  ) : next.kind === 'FINISH' && hasSteps ? (
                    'Finish'
                  ) : (
                    'Next'
                  )}
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
  plate?: PlateCookRecipe[];
}

const pickRecipes = (
  live: Map<string, Recipe>,
  ids: string[],
  fallback: Map<string, Recipe>,
) =>
  new Map(
    ids.flatMap((id) => {
      const recipe = live.get(id) ?? fallback.get(id);
      return recipe ? [[id, recipe] as const] : [];
    }),
  );

function CookingSubview({
  uid,
  recipeId,
  servings,
  plannedMealId,
  plate,
}: CookingSubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const store = useStore<RootState>();
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const plannedMeal = useAppSelector((state) =>
    plannedMealId === null
      ? null
      : (selectPlannedMeals(state).find((meal) => meal.id === plannedMealId) ??
        null),
  );
  const [planned] = useState(() =>
    plate
      ? plate.map((entry) => ({
          recipeId: entry.recipeId,
          plannedServings: entry.servings,
        }))
      : [
          {
            recipeId,
            plannedServings: plannedMealId === null ? null : (servings ?? null),
          },
        ],
  );
  const ids = useMemo(() => planned.map((entry) => entry.recipeId), [planned]);
  const [lastSeen, setLastSeen] = useState(() =>
    pickRecipes(recipesById, ids, new Map()),
  );

  useEffect(
    () =>
      store.subscribe(() => {
        const live = selectRecipesById(store.getState());
        setLastSeen((current) =>
          ids.every(
            (id) => (live.get(id) ?? current.get(id)) === current.get(id),
          )
            ? current
            : pickRecipes(live, ids, current),
        );
      }),
    [store, ids],
  );

  const entries = useMemo(
    () =>
      planned.flatMap((entry) => {
        const live = recipesById.get(entry.recipeId);
        const recipe = live ?? lastSeen.get(entry.recipeId);
        return recipe
          ? [
              {
                recipe,
                isRemoved: live === undefined,
                plannedServings: entry.plannedServings,
              },
            ]
          : [];
      }),
    [planned, recipesById, lastSeen],
  );

  if (entries.length === 0) {
    return (
      <Subview overlay title='Cooking' onClose={closeSubview}>
        <p className='text-muted-foreground py-6 text-center text-sm'>
          {planned.length > 1
            ? "These recipes aren't in your kitchen anymore."
            : "This recipe isn't in your kitchen anymore."}
        </p>
      </Subview>
    );
  }

  const getTitle = () => {
    if (entries.length === 1) return entries[0].recipe.title;
    const plateTitle =
      plannedMeal === null
        ? ''
        : getPlannedMealTitle(plannedMeal, recipesById, ingredientsById);
    return plateTitle || `${entries[0].recipe.title} +${entries.length - 1}`;
  };

  return (
    <CookingSession
      uid={uid}
      entries={entries}
      openedRecipeId={recipeId}
      plannedMealId={plannedMealId}
      title={getTitle()}
    />
  );
}

export default CookingSubview;

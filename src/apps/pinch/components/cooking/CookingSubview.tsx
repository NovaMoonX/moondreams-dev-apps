import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useStore } from 'react-redux';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  ChevronLeft,
  ListChecks,
  NotebookPen,
  Pause,
  Play,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import NoteTextField from '@/components/NoteTextField';
import Subview from '@/components/Subview';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useAppDispatch, useAppSelector, type RootState } from '@/store';
import { generateUuid } from '@/utils';
import { hasDialogOnTop } from '@/utils/dialogUtils';
import {
  findDurations,
  formatClock,
  formatDuration,
} from '@/utils/durationUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import CookDishStrip from '@apps/pinch/components/cooking/CookDishStrip';
import CookIngredientsView from '@apps/pinch/components/cooking/CookIngredientsView';
import CookNoteCard from '@apps/pinch/components/cooking/CookNoteCard';
import CookPantryTake from '@apps/pinch/components/cooking/CookPantryTake';
import CookPutAway from '@apps/pinch/components/cooking/CookPutAway';
import CookRecord, {
  type CookRecordStatus,
} from '@apps/pinch/components/cooking/CookRecord';
import CookStepView, {
  type StepTimerSlot,
} from '@apps/pinch/components/cooking/CookStepView';
import CookTimerStrip from '@apps/pinch/components/cooking/CookTimerStrip';
import CookTimerView from '@apps/pinch/components/cooking/CookTimerView';
import RecipeNotes from '@apps/pinch/components/notes/RecipeNotes';
import {
  CookVoiceButton,
  CookVoiceExplainer,
  CookVoiceLine,
} from '@apps/pinch/components/cooking/CookVoice';
import { MAX_COOK_TIMERS, MAX_RECIPE_NOTE_LENGTH } from '@apps/pinch/constants';
import { useCookActions } from '@apps/pinch/hooks/useCookActions';
import { useCookNote } from '@apps/pinch/hooks/useCookNote';
import {
  getRemainingMs,
  useCookTimers,
  type CookTimer,
} from '@apps/pinch/hooks/useCookTimers';
import {
  runCookCommand,
  useCookVoice,
  type CookActionCommand,
  type CookVoiceActions,
  type CookVoiceResult,
} from '@apps/pinch/hooks/useCookVoice';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { usePantryTake } from '@apps/pinch/hooks/usePantryTake';
import { usePutAway } from '@apps/pinch/hooks/usePutAway';
import {
  selectCooksById,
  selectCookSummaries,
  selectIngredientsById,
  selectPlannedMeals,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import { updateCook } from '@apps/pinch/store/actions/cookActions';
import { announceCookingSession } from '@apps/pinch/lib/cookingSessionPresence';
import {
  clearCookingSession,
  writeCookingSession,
} from '@apps/pinch/lib/cookingSessionStorage';
import type {
  CookingResume,
  CookView,
  PlateCookRecipe,
  Recipe,
  ResumeTimer,
} from '@apps/pinch/types';
import {
  applyResumePositions,
  buildCookingSnapshot,
} from '@apps/pinch/utils/cookSession';
import {
  getCookStartServings,
  getFirstSentence,
  getMeanwhile,
  getPlannedCookId,
  getPlateNext,
  getPlateStart,
  getReadyStepTimers,
  getStepName,
  getTimerNext,
  getTimerRows,
  getTimerSecondary,
  getTimerSlotKey,
  isCookHistoryFull,
  isCookNoteShown,
  type PlateCookState,
} from '@apps/pinch/utils/cooks';
import {
  describeAmounts,
  describeTimersLeft,
  isBeforeDeadline,
  pickTimersToTell,
  pickVoiceTimer,
  toSpokenLabel,
  withTimeLeft,
} from '@apps/pinch/utils/cookVoice';
import { getPlateTitle } from '@apps/pinch/utils/mealFormat';
import { formatKitchenAmount } from '@apps/pinch/utils/kitchenMeasure';
import { scaleAmount } from '@apps/pinch/utils/quantity';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';
import { getRecipeLines } from '@apps/pinch/utils/shopping';
import { matchStepIngredients } from '@apps/pinch/utils/stepIngredients';
import { getRepeatedLineGroups } from '@apps/pinch/utils/ingredientGroups';

/** Taps on Next that land after Finish swapped in Done are ignored for this long, so skimming to the end never leaves at once. */
const DONE_GUARD_MS = 600;
/** A spoken command lands up to a couple of seconds after the words, so "next" or "dismiss" this soon after a Time's up was meant before it. */
const VOICE_DONE_GUARD_MS = 2000;

const LIST_FORMAT = new Intl.ListFormat('en-US', { type: 'conjunction' });
const CHOICE_FORMAT = new Intl.ListFormat('en-US', { type: 'disjunction' });

const done = (show?: string, speak?: string): CookVoiceResult => ({
  ok: true,
  show,
  speak,
});
const refuse = (reason: string, spoken?: string): CookVoiceResult => ({
  ok: false,
  reason,
  spoken,
});
/** A refusal said aloud whatever Read steps aloud is set to, because it answers a question or a ringing timer. */
const answerNo = (reason: string, spoken?: string): CookVoiceResult => ({
  ok: false,
  reason,
  spoken,
  isSpoken: true,
});

const createLiveCount = () => {
  const listeners = new Set<() => void>();
  const store = {
    value: 0,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    get: () => store.value,
    set: (next: number) => {
      if (next === store.value) return;
      store.value = next;
      listeners.forEach((listener) => listener());
    },
  };
  return store;
};

function LeaveMessage({
  count,
}: {
  count: ReturnType<typeof createLiveCount>;
}) {
  const going = useSyncExternalStore(count.subscribe, count.get);
  if (going === 0) {
    return <>Your timer has finished. Leaving closes cooking mode.</>;
  }
  return (
    <>
      {going} {going === 1 ? 'timer is' : 'timers are'} still going. Timers only
      run while this screen is open, so leaving stops{' '}
      {going === 1 ? 'it' : 'them'}.
    </>
  );
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  target.closest('input, textarea, select, [contenteditable="true"]') !== null;

interface RestoredTimer {
  timer: CookTimer;
  reminderId: string | null;
}

const restoreTimers = (
  saved: CookingResume['timers'],
  entries: { recipe: Recipe }[],
) => {
  const isPlate = entries.length > 1;
  const restored = saved.flatMap((timer): RestoredTimer[] => {
    const recipe = entries.find(
      (entry) => entry.recipe.id === timer.recipeId,
    )?.recipe;
    if (!recipe) return [];
    const base = {
      id: generateUuid(),
      recipeId: recipe.id,
      recipeTitle: isPlate ? recipe.title : null,
      stepNumber: timer.stepNumber,
      stepName:
        getStepName(recipe.steps[timer.stepNumber - 1] ?? '') ||
        `Step ${timer.stepNumber}`,
      label: timer.label,
      durationMs: timer.durationMs,
    };
    if (timer.status === 'running') {
      const running: CookTimer = {
        ...base,
        status: 'running',
        startedAt: timer.startedAt,
        endsAt: timer.endsAt,
      };
      return [{ timer: running, reminderId: timer.reminderId }];
    }
    const other: CookTimer =
      timer.status === 'paused'
        ? { ...base, status: 'paused', remainingMs: timer.remainingMs }
        : { ...base, status: 'done', endedAt: timer.endedAt };
    return [{ timer: other, reminderId: null }];
  });
  return {
    timers: restored.map((entry) => entry.timer),
    reminderIds: Object.fromEntries(
      restored.flatMap((entry) =>
        entry.reminderId === null ? [] : [[entry.timer.id, entry.reminderId]],
      ),
    ),
  };
};

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
  /** The planned meal's day, kept in the saved copy; null when it isn't loaded. */
  plannedMealDate: number | null;
  /** The header: the recipe's name, or the plate's when there are several. */
  title: string;
  /** A saved session to pick up where it was left; null for a fresh start. */
  resume: CookingResume | null;
}

function CookingSession({
  uid,
  entries,
  openedRecipeId,
  plannedMealId,
  plannedMealDate,
  title,
  resume,
}: CookingSessionProps) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const { closeSubview, closeSubviewIf, openSubview } = usePinchOverlay();
  const { confirm } = useActionModal();
  const [view, setView] = useState<CookView>('steps');
  const [currentId, setCurrentId] = useState(() =>
    resume && entries.some((entry) => entry.recipe.id === resume.currentId)
      ? resume.currentId
      : entries[0].recipe.id,
  );
  const [plate, setPlate] = useState(() =>
    applyResumePositions(
      getPlateStart(
        entries.map((entry) => ({
          recipeId: entry.recipe.id,
          recipeServings: entry.recipe.servings,
          plannedServings: entry.plannedServings,
        })),
      ),
      resume?.positions ?? {},
      Object.fromEntries(
        entries.map((entry) => [entry.recipe.id, entry.recipe.steps.length]),
      ),
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
  const [gotItNotes, setGotItNotes] = useState<string[]>([]);
  const [isMarking, setIsMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  /** The cooks this screen wrote, by recipe: only these can be taken back with Undo. */
  const [cookedIds, setCookedIds] = useState<Record<string, string>>({});
  const [undoState, setUndoState] = useState<'PENDING' | 'FAILED' | null>(null);
  const finishedAt = useRef(0);
  const guardedUntil = useRef(0);
  const voiceGuardedUntil = useRef(0);
  const hasCoachedNext = useRef(false);
  const missedFocus = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [restored] = useState(() =>
    restoreTimers(resume?.timers ?? [], entries),
  );
  const timers = useCookTimers(restored.timers, restored.reminderIds);
  const { getReminderId, pushRevision } = timers;
  const [sessionId] = useState(generateUuid);
  const [goingCount] = useState(createLiveCount);
  const isWide = useMediaQuery().isAtLeast('lg');
  const ingredientsById = useAppSelector(selectIngredientsById);
  const matchesByRecipe = useMemo(
    () =>
      new Map(
        entries.map((candidate) => [
          candidate.recipe.id,
          matchStepIngredients(
            candidate.recipe.steps,
            candidate.recipe.ingredients.map((line) => {
              const ingredient = ingredientsById.get(line.ingredientId);
              return {
                id: line.id,
                ingredientId: line.ingredientId,
                names: ingredient
                  ? [ingredient.name, ...ingredient.aliases]
                  : [],
                group: line.group ?? null,
              };
            }),
          ),
        ]),
      ),
    [entries, ingredientsById],
  );
  const stepMatches = matchesByRecipe.get(recipe.id) ?? [];
  const getRows = useCallback(
    (target: Recipe, targetServings: number) => {
      const repeatedGroups = getRepeatedLineGroups(target.ingredients);
      const result = target.ingredients.map((line) => ({
        id: line.id,
        name:
          ingredientsById.get(line.ingredientId)?.name ?? 'Removed ingredient',
        note: line.amount === null ? null : line.note,
        amountText:
          line.amount === null
            ? (line.note ?? '')
            : formatKitchenAmount(
                scaleAmount(line.amount, targetServings, target.servings),
                line.unit,
              ),
        isMeasured: line.amount !== null,
        group: line.group ?? null,
        groupLabel: repeatedGroups.get(line.id) ?? null,
      }));
      return result;
    },
    [ingredientsById],
  );
  const rows = useMemo(
    () => getRows(recipe, servings),
    [getRows, recipe, servings],
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

  const pantryTake = usePantryTake(
    uid,
    useMemo(
      () =>
        records
          .filter((record) => record.recordedCookId !== null)
          .flatMap((record) =>
            getRecipeLines(
              record.entry.recipe,
              ingredientsById,
              record.servings,
            ).flatMap((line) =>
              line.amount === null
                ? []
                : [
                    {
                      ingredientId: line.ingredientId,
                      amount: line.amount,
                      unit: line.unit,
                    },
                  ],
            ),
          ),
      [records, ingredientsById],
    ),
  );

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
  const positions = entries.map((candidate) => ({
    recipeId: candidate.recipe.id,
    stepIndex: plate[candidate.recipe.id]?.stepIndex ?? 0,
    stepCount: candidate.recipe.steps.length,
  }));
  const next = getPlateNext(positions, recipe.id);
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
  const stepText = hasSteps ? recipe.steps[index] : '';
  const stepDurations = useMemo(
    () =>
      findDurations(stepText).map(({ seconds }) => ({
        seconds,
        label: formatDuration(seconds),
      })),
    [stepText],
  );
  const withDone = (
    slots: { seconds: number; label: string }[],
    recipeId: string,
    stepNumber: number,
  ): StepTimerSlot[] =>
    slots.map((slot) => ({
      ...slot,
      isDone: timers.finishedSlots.has(
        getTimerSlotKey({ recipeId, stepNumber, label: slot.label }),
      ),
    }));
  const readySlots = withDone(
    getReadyStepTimers(
      timers.timers,
      isStepsView && !isFinishShown && hasSteps
        ? {
            recipeId: recipe.id,
            stepNumber: index + 1,
            durations: stepDurations,
          }
        : null,
    ),
    recipe.id,
    index + 1,
  );
  const isDraftOpen = isFinishShown && (note.isOpen || putAway.isOpen);
  const focused = isDraftOpen ? null : timers.focused;
  const focusedEntry =
    focused === null
      ? null
      : (entries.find(
          (candidate) => candidate.recipe.id === focused.recipeId,
        ) ?? null);
  const focusedSteps = focusedEntry?.recipe.steps ?? [];
  const focusedIndex =
    focused === null
      ? 0
      : Math.max(0, Math.min(focused.stepNumber, focusedSteps.length) - 1);
  const focusedStepText = focusedSteps[focusedIndex] ?? '';
  const timerNext =
    focused === null || isFinishShown ? null : getTimerNext(positions, focused);
  const timerSecondary =
    focused === null ? null : getTimerSecondary(timerNext, focused.status);
  const meanwhileTarget =
    focused === null || focused.status === 'done' || isFinishShown
      ? null
      : getMeanwhile(positions, focused.recipeId, timerNext);
  const meanwhileEntry =
    meanwhileTarget === null
      ? null
      : (entries.find(
          (candidate) => candidate.recipe.id === meanwhileTarget.recipeId,
        ) ?? null);
  const backLabel = isFinishShown
    ? 'Back'
    : isStepsView
      ? `Back to step ${index + 1}`
      : 'Back to ingredients';
  const dishes = entries.map((candidate) => {
    const stepCount = candidate.recipe.steps.length;
    const at = Math.min(
      plate[candidate.recipe.id]?.stepIndex ?? 0,
      stepCount - 1,
    );
    return {
      id: candidate.recipe.id,
      title: candidate.recipe.title,
      status: stepCount === 0 ? 'No steps' : `Step ${at + 1} of ${stepCount}`,
    };
  });

  const spokenStep = `${isPlate ? `${recipe.title}. ` : ''}Step ${index + 1} of ${recipe.steps.length}. ${stepText}`;
  const voice = useCookVoice({
    uid,
    step:
      isStepsView && hasSteps && !isFinishShown && focused === null
        ? { key: `${recipe.id}:${index}`, spoken: spokenStep }
        : null,
    onTurnOn: timers.prepareSound,
  });

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

  useEffect(
    () => goingCount.set(timers.liveCount),
    [goingCount, timers.liveCount],
  );

  useEffect(() => announceCookingSession(sessionId), [sessionId]);

  useEffect(() => {
    if (isFinished) {
      clearCookingSession(uid);
      return;
    }
    writeCookingSession(
      buildCookingSnapshot({
        uid,
        sessionId,
        now: Date.now(),
        open: {
          recipeId: openedRecipeId,
          servings: entries.length === 1 ? entries[0].plannedServings : null,
          plannedMealId,
          plannedMealDate,
          plate:
            entries.length > 1
              ? entries.map((entry) => ({
                  recipeId: entry.recipe.id,
                  servings: entry.plannedServings ?? entry.recipe.servings,
                }))
              : null,
        },
        currentId,
        positions: plate,
        timers: timers.timers.map((timer): ResumeTimer =>
          timer.status === 'running'
            ? { ...timer, reminderId: getReminderId(timer.id) }
            : timer,
        ),
      }),
    );
  }, [
    uid,
    sessionId,
    isFinished,
    entries,
    openedRecipeId,
    plannedMealId,
    plannedMealDate,
    currentId,
    plate,
    timers.timers,
    getReminderId,
    pushRevision,
  ]);

  const ask = async (options: Parameters<typeof confirm>[0]) => {
    const isConfirmed = await confirm(options);
    if (missedFocus.current) {
      missedFocus.current = false;
      focusPrimary();
    }
    return isConfirmed;
  };

  const confirmLeave = async () => {
    if (timers.liveCount === 0) return true;

    const isConfirmed = await ask({
      title: 'Stop timers and leave?',
      message: <LeaveMessage count={goingCount} />,
      confirmText: 'Leave',
      cancelText: 'Stay',
      destructive: true,
    });
    return isConfirmed;
  };

  const confirmDiscardOf = (title: string, message: string) =>
    ask({
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
    if (!(await confirmLeave())) return;
    clearCookingSession(uid);
    closeIfStillOpen();
  };

  const applyNote = async (noteId: string) => {
    if (!(await confirmDiscard()) || !(await confirmLeave())) return;
    clearCookingSession(uid);
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
        // eslint-disable-next-line react-hooks/purity -- runs from a tap; once the voice actions are connected the compiler flags every clock read here
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
    voice.stop();
    // eslint-disable-next-line react-hooks/purity -- runs from a tap; once the voice actions are connected the compiler flags every clock read here
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
    // eslint-disable-next-line react-hooks/purity -- runs from a tap; once the voice actions are connected the compiler flags every clock read here
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

  const startTimer = (
    target: Recipe,
    stepNumber: number,
    seconds: number,
    label: string,
  ) =>
    timers.start(
      {
        recipeId: target.id,
        recipeTitle: isPlate ? target.title : null,
        stepNumber,
        stepName:
          getStepName(target.steps[stepNumber - 1] ?? '') ||
          `Step ${stepNumber}`,
      },
      seconds,
      label,
    );

  const jumpTo = (recipeId: string, stepIndex: number) => {
    const target = entries.find(
      (candidate) => candidate.recipe.id === recipeId,
    );
    if (!target) return;
    timers.unfocus();
    updateRecipe(recipeId, {
      stepIndex: Math.max(
        0,
        Math.min(stepIndex, target.recipe.steps.length - 1),
      ),
    });
    setCurrentId(recipeId);
    setView('steps');
    setIsFinished(false);
    scrollToTop();
  };

  const backToStep = () => {
    timers.unfocus();
    scrollToTop();
  };

  const endTimer = (id: string) => {
    timers.dismiss(id);
    scrollToTop();
  };

  const goNextFromTimer = () => {
    if (focused === null || timerNext === null) return;
    if (focused.status === 'done') timers.dismiss(focused.id);
    if (timerNext.kind === 'STEP') {
      jumpTo(timerNext.recipeId, timerNext.stepIndex);
      return;
    }
    const target = positions.find(
      (position) => position.recipeId === timerNext.recipeId,
    );
    jumpTo(timerNext.recipeId, target?.stepIndex ?? 0);
  };

  const handleTimerSwipe = (direction: 1 | -1) =>
    direction === 1 ? goNextFromTimer() : backToStep();

  const focusKey =
    focused === null ? null : `${focused.id}:${focused.status === 'done'}`;
  const shownFocusKey = useRef(focusKey);
  useEffect(() => {
    if (shownFocusKey.current === focusKey) {
      return;
    }
    const wasShown = shownFocusKey.current !== null;
    shownFocusKey.current = focusKey;
    if (focusKey !== null) {
      // eslint-disable-next-line react-hooks/purity -- runs in an effect; once the voice actions are connected the compiler flags every clock read here
      const shownAt = Date.now();
      guardedUntil.current = shownAt + DONE_GUARD_MS;
      if (focusKey.endsWith(':true')) {
        voiceGuardedUntil.current = shownAt + VOICE_DONE_GUARD_MS;
      }
    }
    if (focusKey !== null && !wasShown) {
      rootRef.current
        ?.closest<HTMLElement>('[data-subview-overlay]')
        ?.scrollTo({ top: 0 });
    }
    const frame = window.requestAnimationFrame(() => {
      if (hasDialogOnTop()) {
        missedFocus.current = true;
        return;
      }
      primaryRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusKey]);

  const showView = (next: CookView) => {
    setView(next);
    scrollToTop();
    focusPrimary();
  };

  useEffect(() => {
    if (focused === null && (!isStepsView || !hasSteps)) {
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
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      if (focused === null) {
        goBy(direction);
        return;
      }
      handleTimerSwipe(direction);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const showStepsView = () => {
    if (!isStepsView) showView('steps');
  };
  const voiceStep =
    focused !== null && focusedEntry !== null
      ? {
          recipe: focusedEntry.recipe,
          stepNumber: focusedIndex + 1,
          text: focusedStepText,
        }
      : { recipe, stepNumber: index + 1, text: stepText };
  const spokenShownStep =
    focused !== null && focusedEntry !== null
      ? `${isPlate ? `${focusedEntry.recipe.title}. ` : ''}Step ${focusedIndex + 1} of ${focusedSteps.length}. ${focusedStepText}`
      : spokenStep;
  const getVoiceTimers = () => withTimeLeft(timers.timers, getRemainingMs);
  const pickTimer = (statuses: CookTimer['status'][], seconds: number | null) =>
    pickVoiceTimer(getVoiceTimers(), {
      statuses,
      label: seconds === null ? null : formatDuration(seconds),
      focusedId: focused?.id ?? null,
    });
  const noTimer = (seconds: number | null, state: string) =>
    refuse(
      seconds === null
        ? `No timer is ${state}.`
        : `No ${formatDuration(seconds)} timer is ${state}.`,
    );
  const capRefusal = refuse(
    `${MAX_COOK_TIMERS} timers are going already.`,
    `${MAX_COOK_TIMERS} timers are going. Another can start once one finishes or is reset.`,
  );

  const showDish = (recipeId: string) => {
    if (focused === null) {
      showRecipe(recipeId);
      return;
    }
    jumpTo(recipeId, plate[recipeId]?.stepIndex ?? 0);
  };
  const getTitle = (recipeId: string) =>
    entries.find((candidate) => candidate.recipe.id === recipeId)?.recipe
      .title ?? 'the next recipe';
  const isRingingInFront = focused?.status === 'done';
  const isAnyRinging = timers.timers.some((timer) => timer.status === 'done');
  const isJustRung = () =>
    isRingingInFront && isBeforeDeadline(voiceGuardedUntil.current);
  const justRang = (goal: string) =>
    answerNo(
      `Just rang: say that again ${goal}.`,
      `The timer just rang. Say that again ${goal}.`,
    );
  const ringingRefusal = answerNo(
    'That timer is ringing. Say “dismiss”.',
    'That timer is ringing. Say dismiss.',
  );
  const finishRefusal = () => {
    if (!hasSteps) return refuse('This recipe has no steps yet.');
    if (next.kind === 'FINISH') {
      return answerNo(
        'Last step: tap Finish yourself.',
        "That's the last step. Tap Finish when you're done.",
      );
    }
    return answerNo(
      'Finish is on the last step.',
      "Finish is on the last step. Tap it yourself when you're done.",
    );
  };
  const getVoiceRows = () =>
    voiceStep.recipe.id === recipe.id
      ? rows
      : getRows(
          voiceStep.recipe,
          plate[voiceStep.recipe.id]?.servings ?? voiceStep.recipe.servings,
        );

  const makeVoiceActions = (): CookVoiceActions => ({
    next: () => {
      if (timerSecondary === 'NEXT') {
        if (isJustRung()) return justRang('to go on');
        const crossesTo =
          timerNext?.kind === 'RECIPE' ? getTitle(timerNext.recipeId) : null;
        goNextFromTimer();
        return done(crossesTo === null ? undefined : `Showing ${crossesTo}`);
      }
      if (timerSecondary === 'BACK') {
        backToStep();
        return done(backLabel);
      }
      if (focused !== null) {
        return answerNo(
          "Time's up: say “dismiss” first.",
          'The timer is ringing. Say dismiss to go back to your step.',
        );
      }
      if (!isStepsView) return refuse('Say “steps” to go back to the steps.');
      if (next.kind === 'FINISH') return finishRefusal();
      if (next.kind === 'STEP') {
        goBy(1);
        return done();
      }
      showRecipe(next.recipeId);
      focusPrimary();
      return done(`Showing ${getTitle(next.recipeId)}`);
    },
    back: () => {
      if (focused !== null) {
        backToStep();
        return done();
      }
      if (!isStepsView) {
        showView('steps');
        return done();
      }
      if (!hasSteps) return refuse('This recipe has no steps yet.');
      if (index <= 0) return refuse("You're on the first step.");
      goBy(-1);
      return done();
    },
    repeat: () =>
      voiceStep.text === ''
        ? refuse('This recipe has no steps yet.')
        : done(undefined, spokenShownStep),
    showIngredients: () => {
      if (focused !== null) backToStep();
      if (isWide) {
        return focused !== null
          ? done()
          : refuse('The ingredients are already beside the steps.');
      }
      if (view !== 'ingredients') showView('ingredients');
      return done();
    },
    showSteps: () => {
      if (focused !== null) backToStep();
      showStepsView();
      return done();
    },
    finish: finishRefusal,
    startTimer: (seconds) => {
      const durations = findDurations(voiceStep.text).map((found) => ({
        seconds: found.seconds,
        label: formatDuration(found.seconds),
      }));
      if (durations.length === 0) return refuse('No timer on this step.');
      const ready = getReadyStepTimers(timers.timers, {
        recipeId: voiceStep.recipe.id,
        stepNumber: voiceStep.stepNumber,
        durations,
      });
      const slot =
        seconds === null
          ? (ready[0] ?? durations[0])
          : durations.find((candidate) => candidate.seconds === seconds);
      if (!slot) {
        return refuse(`No ${formatDuration(seconds ?? 0)} timer on this step.`);
      }
      const existing = timers.timers.find(
        (timer) =>
          timer.recipeId === voiceStep.recipe.id &&
          timer.stepNumber === voiceStep.stepNumber &&
          timer.label === slot.label,
      );
      if (existing?.status === 'running') {
        timers.focus(existing.id);
        return done(`The ${slot.label} timer is already going`);
      }
      if (existing?.status === 'paused') {
        timers.resume(existing.id);
        timers.focus(existing.id);
        return done(`Resumed the ${slot.label} timer`);
      }
      if (existing) timers.dismiss(existing.id);
      if (timers.isFull) return capRefusal;
      const id = startTimer(
        voiceStep.recipe,
        voiceStep.stepNumber,
        slot.seconds,
        slot.label,
      );
      if (id === null) return capRefusal;
      const hasNext =
        getTimerNext(positions, {
          recipeId: voiceStep.recipe.id,
          stepNumber: voiceStep.stepNumber,
        }) !== null;
      const coaching = hasCoachedNext.current
        ? ''
        : ` ${hasNext ? 'Say next step to keep going.' : 'Say back to see the step.'}`;
      hasCoachedNext.current = true;
      return done(
        `Started the ${slot.label} timer`,
        `Started the ${toSpokenLabel(slot.label)} timer.${coaching}`,
      );
    },
    pauseTimer: (seconds) => {
      if (isAnyRinging) return ringingRefusal;
      const timer = pickTimer(['running'], seconds);
      if (timer === null) return noTimer(seconds, 'going');
      timers.pause(timer.id);
      return done(`Paused the ${timer.label} timer`);
    },
    resumeTimer: (seconds) => {
      if (isAnyRinging) return ringingRefusal;
      const timer = pickTimer(['paused'], seconds);
      if (timer === null) return noTimer(seconds, 'paused');
      timers.resume(timer.id);
      return done(`Resumed the ${timer.label} timer`);
    },
    stopTimer: (seconds, scope) => {
      const ringing = pickTimer(['done'], seconds);
      if (ringing !== null) {
        if (ringing.id === focused?.id && isJustRung()) {
          return justRang('to dismiss it');
        }
        endTimer(ringing.id);
        return done(`Dismissed the ${ringing.label} timer`);
      }
      if (scope === 'RINGING') return refuse('No timer is ringing.');
      const timer = pickTimer(['running', 'paused'], seconds);
      if (timer === null) return noTimer(seconds, 'going');
      if (timer.status === 'running') {
        timers.pause(timer.id);
        return done(
          'Paused. Say “stop” again to reset it.',
          'Paused the timer. Say stop again to reset it.',
        );
      }
      endTimer(timer.id);
      return done(`Reset the ${timer.label} timer`);
    },
    timeLeft: () => {
      const told = pickTimersToTell(getVoiceTimers(), focused?.id ?? null);
      if (told.length === 0) return answerNo('No timer is going.');
      const { show, speak } = describeTimersLeft(
        told.map((timer) => ({
          label: timer.label,
          name: timer.stepName,
          status: timer.status,
          remainingMs: timer.remainingMs,
          clock: formatClock(timer.remainingMs),
        })),
      );
      return done(show, speak);
    },
    amount: (lineIds, query) => {
      const voiceRows = getVoiceRows();
      const found = lineIds.flatMap((id) =>
        voiceRows.filter((row) => row.id === id),
      );
      if (found.length === 0) {
        return answerNo(
          `I can't find “${query}” in this recipe's ingredients.`,
          `I can't find ${query} in this recipe's ingredients.`,
        );
      }
      const { show, speak } = describeAmounts(found);
      return done(show, speak);
    },
    switchRecipe: (recipeId, candidates) => {
      if (recipeId === null) {
        const titles = entries
          .filter((candidate) => candidates.includes(candidate.recipe.id))
          .map((candidate) => candidate.recipe.title);
        return answerNo(
          `Which one: ${CHOICE_FORMAT.format(titles)}?`,
          `Say more of the name: ${CHOICE_FORMAT.format(titles)}.`,
        );
      }
      const target = entries.find(
        (candidate) => candidate.recipe.id === recipeId,
      );
      if (!target) return refuse('That dish isn’t on this plate.');
      if (target.recipe.id === recipe.id && focused === null) {
        return done(`You're on ${recipe.title}`);
      }
      showDish(target.recipe.id);
      return done(`Showing ${target.recipe.title}`);
    },
    cycleRecipe: (direction) => {
      if (!isPlate) return refuse('Only one recipe is cooking.');
      const at = entries.findIndex(
        (candidate) => candidate.recipe.id === recipe.id,
      );
      const target =
        entries[(at + direction + entries.length) % entries.length].recipe;
      showDish(target.id);
      return done(`Showing ${target.title}`);
    },
  });
  const voiceStepMatch =
    matchesByRecipe.get(voiceStep.recipe.id)?.[voiceStep.stepNumber - 1] ??
    null;
  const voiceContext = {
    recipes: entries.map((candidate) => ({
      id: candidate.recipe.id,
      title: candidate.recipe.title,
    })),
    shownRecipeId: voiceStep.recipe.id,
    lines: voiceStep.recipe.ingredients.map((line) => {
      const ingredient = ingredientsById.get(line.ingredientId);
      return {
        id: line.id,
        names: ingredient ? [ingredient.name, ...ingredient.aliases] : [],
        isInStep: voiceStepMatch?.lineIds.includes(line.id) ?? false,
      };
    }),
  };
  const { connect: connectVoice } = voice;
  const runVoiceCommand = useEffectEvent((command: CookActionCommand) =>
    runCookCommand(command, makeVoiceActions()),
  );
  useEffect(() => connectVoice(runVoiceCommand, voiceContext));
  const namedLines = voiceContext.lines.filter((line) => line.names.length > 0);
  const stepLines = namedLines.filter((line) => line.isInStep);
  const ingredientExample = (
    [...(stepLines.length > 0 ? stepLines : namedLines)].sort(
      (a, b) => a.names[0].split(' ').length - b.names[0].split(' ').length,
    )[0]?.names[0] ?? 'garlic'
  ).toLowerCase();
  const dishExample = isPlate
    ? (entries
        .find((candidate) => candidate.recipe.id !== recipe.id)
        ?.recipe.title.split(' ')
        .at(-1)
        ?.toLowerCase() ?? null)
    : null;

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
  const hasFollowUps = records.some(
    (record) =>
      note.isSaved(record.recipeId) ||
      (putAway.getEntry(record.recipeId)?.saved.length ?? 0) > 0,
  );
  const savedNoteTitles = records
    .filter((record) => note.isSaved(record.recipeId))
    .map((record) => record.entry.recipe.title);
  const openNoteTitle =
    records.find((record) => record.recipeId === note.openRecipeId)?.entry
      .recipe.title ?? null;

  const getTimerNote = () => {
    if (focused === null || focused.status === 'done') return null;
    if (!wakeLock.isSupported || wakeLock.hasFailed) {
      return 'This screen may turn off. Your timer stays right, but it can only ring while the screen is on.';
    }
    return timers.isNoticeShown
      ? 'Keep this screen open: timers stop if you leave it.'
      : null;
  };
  const isChanged =
    isRemoved ||
    recipe.isArchived === true ||
    recipe.updatedAt !== openedUpdatedAt.get(recipe.id);

  const dishStrip =
    isPlate && !isFinishShown && focused === null ? (
      <CookDishStrip dishes={dishes} value={recipe.id} onChange={showRecipe} />
    ) : null;
  const isDishStripInStep = isStepsView && hasSteps && !isWide;
  const noteCard = isCookNoteShown(index, gotItNotes, recipe.id) ? (
    <CookNoteCard
      key={recipe.id}
      recipeId={recipe.id}
      onGotIt={() => setGotItNotes((current) => [...current, recipe.id])}
      onApply={(noteId) => void applyNote(noteId)}
    />
  ) : null;
  const notesDoor = (
    <RecipeNotes
      recipeId={recipe.id}
      onAdd={null}
      onEdit={null}
      onApply={(noteId) => void applyNote(noteId)}
    />
  );
  const ingredientsButton = isWide ? null : (
    <Button
      type='button'
      variant='secondary'
      className='h-10 shrink-0 gap-2 px-4 text-sm'
      onClick={() => showView('ingredients')}
    >
      <ListChecks className='h-4 w-4' aria-hidden='true' />
      Ingredients
    </Button>
  );
  const stepContent = hasSteps ? (
    <CookStepView
      key={`steps-${recipe.id}`}
      steps={recipe.steps}
      index={index}
      ingredients={isWide ? [] : stepRows}
      isAmountNoteShown={
        isScaled && stepMatch !== null && stepMatch.hasWrittenAmount
      }
      timerSlots={readySlots}
      isTimersFull={timers.isFull}
      action={ingredientsButton}
      aside={noteCard}
      dishes={isDishStripInStep ? dishStrip : null}
      onStartTimer={(stepNumber, seconds, label) =>
        startTimer(recipe, stepNumber, seconds, label)
      }
      onSwipe={goBy}
    />
  ) : (
    <div className='flex flex-1 flex-col items-center gap-3 py-2'>
      <p className='text-muted-foreground text-center text-sm'>
        This recipe has no steps yet.
      </p>
      {ingredientsButton}
    </div>
  );
  const getUpNext = () => {
    if (timerNext === null) return null;
    const target = entries.find(
      (candidate) => candidate.recipe.id === timerNext.recipeId,
    );
    if (!target) return null;
    const stepIndex =
      timerNext.kind === 'STEP'
        ? timerNext.stepIndex
        : Math.min(
            plate[target.recipe.id]?.stepIndex ?? 0,
            target.recipe.steps.length - 1,
          );
    const text = getFirstSentence(target.recipe.steps[stepIndex] ?? '');
    if (!text) return null;
    return {
      caption:
        timerNext.kind === 'STEP'
          ? `Up next · Step ${stepIndex + 1}`
          : `Up next · ${target.recipe.title}`,
      text,
    };
  };
  const getTimerContent = () => {
    if (focused === null) return null;
    const focusedRecipe = focusedEntry?.recipe ?? null;
    const focusedServings =
      focusedEntry === null
        ? 0
        : (plate[focusedEntry.recipe.id]?.servings ??
          getCookStartServings(
            focusedEntry.recipe.servings,
            focusedEntry.plannedServings,
          ));
    const focusedRows =
      focusedRecipe === null
        ? []
        : focusedRecipe.id === recipe.id
          ? rows
          : getRows(focusedRecipe, focusedServings);
    const match =
      focusedRecipe === null
        ? null
        : (matchesByRecipe.get(focusedRecipe.id)?.[focusedIndex] ?? null);
    const stepRowsOfTimer =
      match === null
        ? []
        : match.lineIds
            .map((id) => focusedRows.find((row) => row.id === id))
            .filter((row) => row !== undefined);
    const isFocusedScaled =
      focusedRecipe !== null &&
      focusedRecipe.servings > 0 &&
      focusedServings !== focusedRecipe.servings;
    return (
      <CookTimerView
        key={focused.id}
        timer={focused}
        recipeTitle={isPlate ? (focusedRecipe?.title ?? null) : null}
        stepNumber={focusedIndex + 1}
        stepCount={Math.max(1, focusedSteps.length)}
        stepText={focusedStepText}
        stepRows={stepRowsOfTimer}
        isAmountNoteShown={
          isFocusedScaled && match !== null && match.hasWrittenAmount
        }
        others={getTimerRows(timers.timers, focused.id)}
        readySlots={
          timers.isFull
            ? []
            : withDone(
                getReadyStepTimers(timers.timers, {
                  recipeId: focused.recipeId,
                  stepNumber: focused.stepNumber,
                  durations: findDurations(focusedStepText).map(
                    ({ seconds }) => ({
                      seconds,
                      label: formatDuration(seconds),
                    }),
                  ),
                }),
                focused.recipeId,
                focused.stepNumber,
              )
        }
        upNext={getUpNext()}
        meanwhile={
          meanwhileTarget === null || meanwhileEntry === null
            ? null
            : {
                title: meanwhileEntry.recipe.title,
                stepNumber: meanwhileTarget.stepIndex + 1,
                stepCount: meanwhileEntry.recipe.steps.length,
              }
        }
        note={getTimerNote()}
        onTick={timers.settle}
        onPause={timers.pause}
        onResume={timers.resume}
        onReset={endTimer}
        onFocus={timers.focus}
        onMeanwhile={handleMeanwhile}
        onStart={(seconds, label) => {
          if (focusedRecipe !== null) {
            startTimer(focusedRecipe, focused.stepNumber, seconds, label);
          }
        }}
        onSwipe={handleTimerSwipe}
      />
    );
  };
  const focusedVerb =
    focused?.status === 'running'
      ? 'Pause'
      : focused?.status === 'paused'
        ? 'Resume'
        : 'Dismiss';
  const isGuarded = () => Date.now() < guardedUntil.current;
  const handleFocusedAction = () => {
    if (focused === null || isGuarded()) return;
    if (focused.status === 'running') timers.pause(focused.id);
    else if (focused.status === 'paused') timers.resume(focused.id);
    else endTimer(focused.id);
  };
  const handleMeanwhile = () => {
    if (meanwhileTarget !== null) {
      jumpTo(meanwhileTarget.recipeId, meanwhileTarget.stepIndex);
    }
  };
  const handleSecondary = () => {
    if (timerSecondary === 'BACK') {
      backToStep();
      return;
    }
    if (focused?.status === 'done' && isGuarded()) return;
    goNextFromTimer();
  };
  const getSecondaryLabels = () => {
    if (timerSecondary === 'BACK') {
      return {
        text: backLabel,
        aria:
          isPlate && isStepsView
            ? `${backLabel} of ${recipe.title}`
            : undefined,
      };
    }
    if (timerNext?.kind === 'RECIPE') {
      const title =
        entries.find((candidate) => candidate.recipe.id === timerNext.recipeId)
          ?.recipe.title ?? 'the next recipe';
      return { text: 'Next recipe', aria: `Next recipe: ${title}` };
    }
    return { text: 'Next', aria: undefined };
  };
  const secondaryLabels = getSecondaryLabels();
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
      isTitleWrapped
      className='lg:max-w-5xl [@media(max-height:500px)]:max-w-4xl'
      title={title}
      headerAction={
        voice.isSupported && !isFinishShown ? (
          <CookVoiceButton voice={voice} />
        ) : null
      }
      onClose={closeSubview}
      onBack={() =>
        focused !== null
          ? backToStep()
          : isStepsView
            ? void leave()
            : showView('steps')
      }
    >
      <div
        ref={rootRef}
        className='flex flex-1 flex-col gap-4 [@media(max-height:500px)]:gap-2'
      >
        {!isDishStripInStep && dishStrip}
        {focused !== null ? (
          getTimerContent()
        ) : isFinishShown ? (
          <div className='mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 py-6 [@media(max-height:600px)]:gap-3 [@media(max-height:600px)]:py-2'>
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
                  !hasFollowUps &&
                  (records.some((record) => record.isCooked) ||
                    undoState === 'PENDING')
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
            {!note.isOpen && !putAway.isOpen && isRecorded && (
              <CookPantryTake take={pantryTake} />
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
                variant='secondary'
                className='border-border h-10 gap-1 self-center border'
                onClick={() => setIsFinished(false)}
              >
                <ChevronLeft className='h-4 w-4' />
                Back to the last step
              </Button>
            )}
          </div>
        ) : isWide ? (
          <div className='grid flex-1 grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] items-start gap-10'>
            <div className='flex flex-col gap-4'>{stepContent}</div>
            <div className='border-border space-y-6 border-l pl-8'>
              {ingredientsContent}
              {notesDoor}
            </div>
          </div>
        ) : isStepsView ? (
          stepContent
        ) : (
          <div className='space-y-6'>
            {ingredientsContent}
            {notesDoor}
          </div>
        )}
        <div role='status' className='space-y-1 empty:hidden'>
          {isChanged && focused === null && (
            <p className='text-muted-foreground text-xs'>
              This recipe was changed or removed elsewhere.
            </p>
          )}
        </div>
        <div className='form-footer pb-[calc(0.75rem+env(safe-area-inset-bottom))]!'>
          <div
            className={join(
              'flex flex-col gap-2 [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:gap-3',
              focused !== null &&
                'lg:[@media(min-height:501px)]:mx-auto lg:[@media(min-height:501px)]:max-w-xl',
            )}
          >
            {!isFinishShown && (
              <CookVoiceLine
                voice={voice}
                ingredientExample={ingredientExample}
                dishExample={dishExample}
                className='[@media(max-height:500px)]:max-w-44 [@media(max-height:500px)]:shrink-0'
              />
            )}
            <CookTimerStrip
              timers={focused === null ? getTimerRows(timers.timers, null) : []}
              className='[@media(max-height:500px)]:min-w-0 [@media(max-height:500px)]:flex-1 [@media(max-height:500px)]:self-center'
              onTick={timers.settle}
              onFocus={isDraftOpen ? null : timers.focus}
            />
            <div className='flex gap-3 [@media(max-height:500px)]:min-w-0 [@media(max-height:500px)]:flex-1'>
              {focused !== null ? (
                <>
                  {timerSecondary !== null && (
                    <Button
                      type='button'
                      variant='secondary'
                      className={join(
                        'h-14 shrink-0 px-5 text-base',
                        '[@media(max-height:500px)]:h-11',
                      )}
                      aria-label={secondaryLabels.aria}
                      onClick={handleSecondary}
                    >
                      {secondaryLabels.text}
                    </Button>
                  )}
                  <Button
                    ref={primaryRef}
                    type='button'
                    className={join(
                      'h-14 min-w-0 flex-1 gap-2 text-lg',
                      '[@media(max-height:500px)]:h-11',
                    )}
                    aria-label={`${focusedVerb} the ${focused.label} timer`}
                    onClick={handleFocusedAction}
                  >
                    {focused.status === 'running' && (
                      <Pause className='h-5 w-5' aria-hidden='true' />
                    )}
                    {focused.status === 'paused' && (
                      <Play className='h-5 w-5' aria-hidden='true' />
                    )}
                    {focusedVerb}
                  </Button>
                </>
              ) : isFinishShown && isRecorded && putAway.isOpen ? (
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
      </div>
      <CookVoiceExplainer voice={voice} ingredientExample={ingredientExample} />
    </Subview>
  );
}

interface CookingSubviewProps {
  uid: string;
  recipeId: string;
  servings?: number;
  plannedMealId: string | null;
  plate?: PlateCookRecipe[];
  resume?: CookingResume;
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
  resume,
}: CookingSubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const store = useStore<RootState>();
  const recipesById = useAppSelector(selectRecipesById);
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
    const name = plannedMeal?.name?.trim() ?? '';
    return (
      name || getPlateTitle(entries.map((entry) => entry.recipe.title)).title
    );
  };

  return (
    <CookingSession
      uid={uid}
      entries={entries}
      openedRecipeId={recipeId}
      plannedMealId={plannedMealId}
      plannedMealDate={plannedMeal?.date ?? null}
      title={getTitle()}
      resume={resume ?? null}
    />
  );
}

export default CookingSubview;

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
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
  Pause,
  Play,
  Timer,
} from 'lucide-react';

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
import { formatDateShort } from '@/utils/formatUtils';
import CookDishStrip from '@apps/pinch/components/cooking/CookDishStrip';
import CookCaptureView from '@apps/pinch/components/cooking/CookCaptureView';
import CookIngredientsView from '@apps/pinch/components/cooking/CookIngredientsView';
import CookTimerBuzz from '@apps/pinch/components/cooking/CookTimerBuzz';
import CookPantryTake from '@apps/pinch/components/cooking/CookPantryTake';
import CookPutAway from '@apps/pinch/components/cooking/CookPutAway';
import CookRecord, {
  type CookRecordStatus,
} from '@apps/pinch/components/cooking/CookRecord';
import CookReview, {
  type CookReviewEntry,
} from '@apps/pinch/components/cooking/CookReview';
import CookResultCard from '@apps/pinch/components/cooking/CookResultCard';
import type { DockView } from '@apps/pinch/components/cooking/CookStepDock';
import CookStepView, {
  type StepTimerSlot,
} from '@apps/pinch/components/cooking/CookStepView';
import CookRecipeEdit from '@apps/pinch/components/cooking/CookRecipeEdit';
import CookTimerStrip from '@apps/pinch/components/cooking/CookTimerStrip';
import CookTimersView from '@apps/pinch/components/cooking/CookTimersView';
import CookTimerView from '@apps/pinch/components/cooking/CookTimerView';
import RecipeNotes from '@apps/pinch/components/notes/RecipeNotes';
import {
  CookVoiceButton,
  CookVoiceExplainer,
  CookVoiceLine,
} from '@apps/pinch/components/cooking/CookVoice';
import {
  COOK_CHOICE_MS,
  KITCHEN_TIMER_NAME,
  MAX_COOK_TIMERS,
} from '@apps/pinch/constants';
import { useCookActions } from '@apps/pinch/hooks/useCookActions';
import { useCookCapture } from '@apps/pinch/hooks/useCookCapture';
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
  selectNotesById,
  selectNotesByRecipe,
  selectPlannedMeals,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import { updateCook } from '@apps/pinch/store/actions/cookActions';
import { attachNotesToCook } from '@apps/pinch/store/actions/noteActions';
import { announceCookingSession } from '@apps/pinch/lib/cookingSessionPresence';
import {
  clearCookingSession,
  writeCookingSession,
} from '@apps/pinch/lib/cookingSessionStorage';
import type {
  CookingResume,
  CookView,
  PinchSubview,
  PlateCookRecipe,
  Recipe,
  RecipeNote,
  ResumeTimer,
} from '@apps/pinch/types';
import {
  applyResumePositions,
  buildCookingSnapshot,
} from '@apps/pinch/utils/cookSession';
import {
  getLastTimeNote,
  getSpokenEntries,
  groupEntriesByStep,
  resolveNoteStep,
} from '@apps/pinch/utils/notes';
import {
  EMPTY_KITCHEN_TIMER_DRAFT,
  getCookStartServings,
  getDraftSeconds,
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
  toKitchenTimerName,
  type KitchenTimerDraft,
  type PlateCookState,
} from '@apps/pinch/utils/cooks';
import {
  describeAmounts,
  describeTimerGuess,
  describeTimerQuestion,
  describeTimersLeft,
  isBeforeDeadline,
  pickTimersToTell,
  resolveVoiceTimers,
  toSpokenLabel,
  withTimeLeft,
  type CookTimerAnswer,
  type CookTimerTarget,
  type CookVoiceChoice,
  type CookEntryKind,
  type CookVoiceTimer,
} from '@apps/pinch/utils/cookVoice';
import { getPlateTitle } from '@apps/pinch/utils/mealFormat';
import { formatKitchenAmount } from '@apps/pinch/utils/kitchenMeasure';
import { scaleAmount } from '@apps/pinch/utils/quantity';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';
import { getRecipeLines } from '@apps/pinch/utils/shopping';
import { matchStepIngredients } from '@apps/pinch/utils/stepIngredients';
import { getRepeatedLineGroups } from '@apps/pinch/utils/ingredientGroups';

/** Taps on Next that land after Finish swapped in Done are ignored for this long, so skimming to the end never leaves at once. */
interface ChangeTarget {
  recipeId: string;
  ids: string[];
  texts: string[];
  title: string;
}

const DONE_GUARD_MS = 600;
/** A spoken command lands up to a couple of seconds after the words, so "next" or "dismiss" this soon after a Time's up was meant before it. */
const VOICE_DONE_GUARD_MS = 2000;

type PendingTimerVerb = 'PAUSE' | 'RESUME' | 'STOP' | 'EXTEND' | 'RENAME';

interface TimerArg {
  ms: number;
  name: string;
}

const NO_ARG: TimerArg = { ms: 0, name: '' };
const NO_RECIPE_NOTES: RecipeNote[] = [];
/** How long "undo that" can take back what was just dictated. */
const UNDO_DICTATION_MS = 60_000;
/** What the mic still does while a tip, note or change is being typed: only the ways out and the timers. */
const VOICE_WHILE_WRITING = new Set<CookActionCommand['kind']>([
  'PAUSE_TIMER',
  'RESUME_TIMER',
  'STOP_TIMER',
  'EXTEND_TIMER',
  'RENAME_TIMER',
  'TIME_LEFT',
  'START_TIMER',
  'TIMER_ANSWER',
]);
const ENTRY_WORDS: Record<CookEntryKind, string> = {
  TIP: 'tip',
  NOTE: 'note',
  CHANGE: 'change',
};

/** A question the voice asked and is waiting on: which of these timers, or how long a new one runs. */
type PendingQuestion =
  | {
      kind: 'TIMER';
      ids: string[];
      verb: PendingTimerVerb;
      ms: number;
      name: string;
      isConfirm?: boolean;
    }
  | { kind: 'LENGTH'; name: string | null }
  /** Waiting for the words of a tip, note or change to write for the step on screen. */
  | { kind: 'DICTATE'; entryKind: CookEntryKind; recipeId: string; stepIndex: number };

const TIMER_VERB_WORDS: Record<PendingTimerVerb, string> = {
  PAUSE: 'pause',
  RESUME: 'resume',
  STOP: 'stop',
  EXTEND: 'extend',
  RENAME: 'rename',
};

const isNamedKitchenTimer = (timer: {
  recipeId: string | null;
  stepName: string;
}) => timer.recipeId === null && timer.stepName !== KITCHEN_TIMER_NAME;

/** A timer as the line under the mic names it: "Pasta water timer", or "10 min timer" when it has no name of its own. */
const showTimerName = (timer: {
  recipeId: string | null;
  stepName: string;
  label: string;
}) =>
  isNamedKitchenTimer(timer)
    ? `${timer.stepName} timer`
    : `${timer.label} timer`;

const getTimerNames = (timer: CookTimer) =>
  [timer.stepName, timer.recipeTitle ?? ''].filter((name) => name !== '');

/** A timer as it is said aloud: "the pasta water timer", "the 10 minute timer". */
const saidTimerName = (timer: {
  recipeId: string | null;
  stepName: string;
  label: string;
}) =>
  isNamedKitchenTimer(timer)
    ? `${timer.stepName.toLowerCase()} timer`
    : `${toSpokenLabel(timer.label)} timer`;

const toVoiceTimerRef = (timer: CookTimer): CookVoiceTimer => ({
  id: timer.id,
  names: getTimerNames(timer),
  label: timer.label,
});

const MAX_TOLD_TIMERS = 4;

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
    const recipe =
      timer.recipeId === null
        ? null
        : entries.find((entry) => entry.recipe.id === timer.recipeId)?.recipe;
    if (recipe === undefined) return [];
    const base = {
      id: generateUuid(),
      recipeId: recipe?.id ?? null,
      recipeTitle: isPlate && recipe ? recipe.title : null,
      stepNumber: timer.stepNumber,
      stepName: recipe
        ? getStepName(recipe.steps[timer.stepNumber - 1] ?? '') ||
          `Step ${timer.stepNumber}`
        : (timer.name ?? KITCHEN_TIMER_NAME),
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
  const { closeSubview, closeSubviewIf, replaceSubviewIf } = usePinchOverlay();
  const { confirm } = useActionModal();
  const [view, setView] = useState<CookView>('steps');
  const [timerDraft, setTimerDraft] = useState<KitchenTimerDraft>(
    EMPTY_KITCHEN_TIMER_DRAFT,
  );
  const [pending, setPending] = useState<PendingQuestion | null>(null);
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
  const [edit, setEdit] = useState<{
    recipeId: string;
    /** The planned changes the form applies; empty changes the recipe with none planned. */
    changeIds: string[];
    token: string;
    isFromFinish: boolean;
  } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editedIds, setEditedIds] = useState<string[]>([]);
  const [followUps, setFollowUps] = useState<
    Record<string, 'NOTHING' | 'CHANGED'>
  >({});
  const editDirtyRef = useRef(false);
  const editBackStepRef = useRef<(() => boolean) | null>(null);
  const isAskingToLeaveEdit = useRef(false);
  const scrollBeforeEdit = useRef(0);
  const isEditing = edit !== null;
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
  const [dockOpen, setDockOpen] = useState<{ key: string; view: DockView } | null>(null);
  const [isMarking, setIsMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  /** The cooks this screen wrote, by recipe: only these can be taken back with Undo. */
  const [cookedIds, setCookedIds] = useState<Record<string, string>>({});
  const [undoState, setUndoState] = useState<'PENDING' | 'FAILED' | null>(null);
  const finishedAt = useRef(0);
  const guardedUntil = useRef(0);
  const voiceGuardedUntil = useRef(0);
  const hasCoachedNext = useRef(false);
  const hasCoachedUndo = useRef(false);
  const lastDictated = useRef<{
    id: string;
    at: number;
    recipeId: string;
    stepIndex: number;
  } | null>(null);
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
  const isStillOpen = (current: PinchSubview | null) =>
    current?.kind === 'cook' &&
    current.recipeId === openedRecipeId &&
    (current.plannedMealId ?? null) === plannedMealId;
  const closeIfStillOpen = () => closeSubviewIf(isStillOpen);
  const isRecorded = records.some((record) => record.recordedCookId !== null);
  const capture = useCookCapture({
    uid,
    initialCaptured: resume?.captured ?? [],
    getCookId: (recipeId) =>
      records.find((record) => record.recipeId === recipeId)?.recordedCookId ??
      null,
    getSteps: (recipeId) =>
      entries.find((candidate) => candidate.recipe.id === recipeId)?.recipe
        .steps ?? [],
  });
  const notesById = useAppSelector(selectNotesById);
  const notesByRecipe = useAppSelector(selectNotesByRecipe);

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
  const isTimersView = view === 'timers';
  const isStepsView = view === 'steps' || (isWide && !isTimersView);
  const isFinishShown = isFinished && isStepsView && (hasSteps || isRecorded);
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
  const isDraftOpen = capture.isOpen || (isFinishShown && putAway.isOpen);
  const focused = isDraftOpen || isEditing ? null : timers.focused;
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
      : isTimersView
        ? 'Back to timers'
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
  /** The tips, planned changes and notes for a step (the whole recipe's too on the first); the note the first step leads with is left out unless asked for, since its card is on screen. */
  const getEntriesAt = (target: Recipe, at: number, withLastTime: boolean) => {
    const all = notesByRecipe.get(target.id) ?? NO_RECIPE_NOTES;
    const groups = groupEntriesByStep(all, target.steps);
    const lastTimeId = withLastTime
      ? null
      : (getLastTimeNote(all, target.steps)?.id ?? null);
    return [
      ...(at === 0 ? groups.wholeRecipe : []),
      ...(groups.byStep.get(at) ?? []),
    ].filter((entry) => entry.id !== lastTimeId);
  };
  /** What is read after a step when the person asked for it, one view at a time so each is on screen while it is read: the note the cook leads with on the first step, every tip, and what was written for that very step. The whole recipe's older notes wait for "read the notes". */
  const getSpokenSegments = (at: number) => {
    const all = notesByRecipe.get(recipe.id) ?? NO_RECIPE_NOTES;
    const lastTime = getLastTimeNote(all, recipe.steps);
    const spokenEntries = getEntriesAt(recipe, at, true).filter(
      (entry) =>
        entry.kind === 'TIP' ||
        resolveNoteStep(entry, recipe.steps) === at ||
        entry.id === lastTime?.id,
    );
    const lastEntries = spokenEntries.filter((entry) => entry.id === lastTime?.id);
    const rest = spokenEntries.filter((entry) => entry.id !== lastTime?.id);
    return [
      { view: 'LAST' as const, text: getSpokenEntries(lastEntries, 'NOTES', formatDateShort) },
      { view: 'TIP' as const, text: getSpokenEntries(rest, 'TIPS', formatDateShort) },
      { view: 'NOTE' as const, text: getSpokenEntries(rest, 'NOTES', formatDateShort) },
      { view: 'CHANGE' as const, text: getSpokenEntries(rest, 'CHANGES', formatDateShort) },
    ].flatMap((segment) =>
      segment.text === null ? [] : [{ view: segment.view, text: segment.text }],
    );
  };
  const stepEntries = getEntriesAt(recipe, index, false);
  const isOnStep = focused === null && isStepsView && hasSteps && !isFinishShown;
  const dockKey = `${recipe.id}:${index}`;
  const shownView = dockOpen?.key === dockKey ? dockOpen.view : null;
  const showDockView = (view: DockView | null) =>
    setDockOpen(view === null ? null : { key: dockKey, view });
  const voice = useCookVoice({
    uid,
    onShowView: (view) => showDockView(view),
    step:
      isStepsView &&
      hasSteps &&
      !isFinishShown &&
      !isEditing &&
      !capture.isOpen &&
      focused === null
        ? {
            key: `${recipe.id}:${index}`,
            spoken: spokenStep,
            notesSegments: getSpokenSegments(index),
          }
        : null,
    onTurnOn: timers.prepareSound,
    isAlarmRinging: timers.timers.some((timer) => timer.status === 'done'),
    runningTimers: timers.timers.filter((timer) => timer.status === 'running')
      .length,
    lastRingAt: timers.timers.reduce<number | null>(
      (latest, timer) =>
        timer.status === 'done' && (latest === null || timer.endedAt > latest)
          ? timer.endedAt
          : latest,
      null,
    ),
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
      ?.closest<HTMLElement>('[data-subview-scroller]')
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

  const tyingToCook = useRef(new Set<string>());
  useEffect(() => {
    records.forEach((record) => {
      if (record.recordedCookId === null) return;
      const recipeNotes = notesByRecipe.get(record.recipeId) ?? NO_RECIPE_NOTES;
      const pending = capture.captured.filter((id) => {
        const note = recipeNotes.find((found) => found.id === id);
        return (
          note !== undefined &&
          !tyingToCook.current.has(id) &&
          note.kind !== 'TIP' &&
          (note.cookId == null || !cooksById.has(note.cookId))
        );
      });
      if (pending.length === 0) return;
      pending.forEach((id) => tyingToCook.current.add(id));
      void dispatch(
        attachNotesToCook({
          uid,
          recipeId: record.recipeId,
          cookId: record.recordedCookId,
          noteIds: pending,
        }),
      ).finally(() =>
        pending.forEach((id) => tyingToCook.current.delete(id)),
      );
    });
  }, [records, capture.captured, notesByRecipe, cooksById, dispatch, uid]);

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
        captured: capture.captured,
        timers: timers.timers.map((timer): ResumeTimer => {
          const name = timer.recipeId === null ? timer.stepName : null;
          return timer.status === 'running'
            ? { ...timer, name, reminderId: getReminderId(timer.id) }
            : { ...timer, name };
        }),
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
    capture.captured,
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

  /** On Done, once for each recipe with a change still planned until one says yes: the next screen is that recipe's form with the changes applied. "Not now" leaves them planned. */
  const askToUpdate = async (
    targets: ChangeTarget[],
  ): Promise<ChangeTarget | null> => {
    const [first, ...rest] = targets;
    if (first === undefined) return null;

    const name = isPlate ? first.title : 'the recipe';
    const planned =
      first.texts.length === 1
        ? `You planned this change: “${first.texts[0]}”`
        : `You planned ${first.texts.length} changes.`;
    const isConfirmed = await ask({
      title: `Update ${name}?`,
      message: `${planned} Update ${name} with ${first.texts.length === 1 ? 'it' : 'them'} now? Not now keeps ${first.texts.length === 1 ? 'it' : 'them'} planned.`,
      confirmText: 'Update now',
      cancelText: 'Not now',
    });
    return isConfirmed ? first : askToUpdate(rest);
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
    if (capture.hasDraft && capture.draft?.noteId != null) {
      return confirmDiscardOf(
        'Discard your changes?',
        'The entry stays as it was saved.',
      );
    }
    if (capture.hasDraft) {
      return confirmDiscardOf(
        'Discard this entry?',
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

  const leaveNow = (then?: PinchSubview) => {
    clearCookingSession(uid);
    if (then === undefined) closeIfStillOpen();
    else replaceSubviewIf(isStillOpen, then);
  };

  const leave = async () => {
    if (!(await confirmDiscard())) return;
    if (!(await confirmLeave())) return;
    leaveNow();
  };

  const getOverlay = () =>
    rootRef.current?.closest<HTMLElement>('[data-subview-scroller]') ?? null;

  const startEdit = async (recipeId: string, changeIds: string[]) => {
    if (isEditing || !(await confirmDiscard())) return;
    const target = entries.find(
      (candidate) => candidate.recipe.id === recipeId,
    );
    if (!target) return;
    voice.stop();
    setDockOpen(null);
    scrollBeforeEdit.current = getOverlay()?.scrollTop ?? 0;
    editDirtyRef.current = false;
    setEditTitle(target.recipe.title);
    setEdit({
      recipeId,
      changeIds,
      token: generateUuid(),
      isFromFinish: isFinished,
    });
  };

  const leaveEdit = async () => {
    if (editBackStepRef.current?.()) return;
    if (isAskingToLeaveEdit.current) return;
    if (editDirtyRef.current) {
      isAskingToLeaveEdit.current = true;
      const isConfirmed = await ask({
        title: 'Discard your changes?',
        message: "They aren't saved yet. Going back to cooking loses them.",
        confirmText: 'Discard',
        cancelText: 'Keep editing',
        destructive: true,
      }).finally(() => {
        isAskingToLeaveEdit.current = false;
      });
      if (!isConfirmed) return;
    }
    setEdit(null);
  };

  const finishEdit = (saved: NonNullable<typeof edit>) => {
    setEditedIds((current) =>
      current.includes(saved.recipeId) ? current : [...current, saved.recipeId],
    );
    if (saved.isFromFinish) {
      setFollowUps((current) => ({ ...current, [saved.recipeId]: 'CHANGED' }));
    }
    setEdit((current) => (current?.token === saved.token ? null : current));
  };

  const chooseNothing = (recipeId: string) =>
    setFollowUps((current) => ({ ...current, [recipeId]: 'NOTHING' }));

  useLayoutEffect(() => {
    if (edit === null) {
      getOverlay()?.scrollTo({ top: scrollBeforeEdit.current });
    }
  }, [edit]);

  const cancelCapture = async () => {
    if (!(await confirmDiscard())) return;
    capture.cancel();
    focusPrimary();
  };

  const deleteCaptured = async () => {
    const kind = capture.draft?.kind;
    if (kind === undefined) return;
    const word = kind === 'CHANGE' ? 'change' : kind === 'TIP' ? 'tip' : 'note';
    const isConfirmed = await ask({
      title: `Delete this ${word}?`,
      message: `It comes off the recipe's notes. This can't be undone.`,
      confirmText: 'Delete',
      cancelText: 'Keep it',
      destructive: true,
    });
    if (isConfirmed) {
      await capture.remove();
      focusPrimary();
    }
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
      setFollowUps({});
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

  const handleDone = async () => {
    // eslint-disable-next-line react-hooks/purity -- runs from a tap; once the voice actions are connected the compiler flags every clock read here
    if (Date.now() - finishedAt.current < DONE_GUARD_MS) return;
    if (!(await confirmDiscard())) return;
    if (!(await confirmLeave())) return;
    const target = await askToUpdate(changeTargets);
    leaveNow(
      target === null
        ? undefined
        : { kind: 'recipe', id: target.recipeId, fromChangeIds: target.ids },
    );
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

  /** A timer the person named for something no step mentions; it runs in the background and never takes the screen. */
  const startKitchenTimer = (name: string, seconds: number) =>
    timers.start(
      {
        recipeId: null,
        recipeTitle: null,
        stepNumber: 0,
        stepName: toKitchenTimerName(name),
      },
      seconds,
      formatDuration(seconds),
      false,
    );
  const draftSeconds = getDraftSeconds(timerDraft);
  const handleStartDraft = () => {
    if (draftSeconds === null || timers.isFull) return;
    if (startKitchenTimer(timerDraft.name, draftSeconds) !== null) {
      setTimerDraft(EMPTY_KITCHEN_TIMER_DRAFT);
    }
  };
  const getStartNote = () => {
    if (timers.isFull) {
      return `${MAX_COOK_TIMERS} timers are going. Another can start once one finishes or is reset.`;
    }
    if (draftSeconds !== null) return null;
    return timerDraft.length === 'OTHER'
      ? 'Type whole minutes, up to 1,440.'
      : 'Pick a length to start.';
  };

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
        ?.closest<HTMLElement>('[data-subview-scroller]')
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

  const handleShowTimers = () => {
    timers.unfocus();
    showView('timers');
  };

  useEffect(() => {
    if (
      isEditing ||
      capture.isOpen ||
      (focused === null && (!isStepsView || !hasSteps))
    ) {
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

  useEffect(() => {
    if (pending === null) return;
    const timeoutId = window.setTimeout(() => setPending(null), COOK_CHOICE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [pending]);
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
  const getVoiceTimers = () =>
    withTimeLeft(timers.timers, getRemainingMs).map((timer) => ({
      ...timer,
      names: getTimerNames(timer),
      endedAt: timer.status === 'done' ? timer.endedAt : undefined,
    }));
  type VoiceTimer = ReturnType<typeof getVoiceTimers>[number];
  const noTimer = (target: CookTimerTarget, state: string) => {
    if (target.name !== null) {
      return answerNo(`No ${target.name} timer is ${state}.`);
    }
    return target.seconds === null
      ? refuse(`No timer is ${state}.`)
      : refuse(`No ${formatDuration(target.seconds)} timer is ${state}.`);
  };
  const capRefusal = answerNo(
    `${MAX_COOK_TIMERS} timers are going already.`,
    `${MAX_COOK_TIMERS} timers are already going. Reset or finish one first.`,
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

  const askWhich = (
    verb: PendingTimerVerb,
    asked: VoiceTimer[],
    arg: TimerArg,
    missed: string | null = null,
  ): CookVoiceResult => {
    setPending({
      kind: 'TIMER',
      ids: asked.map((timer) => timer.id),
      verb,
      ...arg,
    });
    const { show, speak } = describeTimerQuestion(
      asked.map((timer) => ({
        name:
          timer.recipeId === null && !isNamedKitchenTimer(timer)
            ? `${timer.label} timer`
            : timer.stepName,
        label: timer.label,
      })),
      TIMER_VERB_WORDS[verb],
      missed,
    );
    return done(show, speak);
  };
  const askGuess = (
    verb: PendingTimerVerb,
    guess: VoiceTimer,
    arg: TimerArg,
    missed: string,
  ): CookVoiceResult => {
    setPending({
      kind: 'TIMER',
      ids: [guess.id],
      verb,
      isConfirm: true,
      ...arg,
    });
    const { show, speak } = describeTimerGuess(guess.stepName, missed);
    return done(show, speak);
  };
  const askLength = (name: string | null): CookVoiceResult => {
    setPending({ kind: 'LENGTH', name });
    return done(
      name === null ? 'How long?' : `How long for ${name}?`,
      name === null
        ? 'How long should the timer run?'
        : `How long for the ${name} timer?`,
    );
  };
  const startKitchenByVoice = (
    name: string | null,
    seconds: number,
  ): CookVoiceResult => {
    if (timers.isFull) return capRefusal;
    const id = startKitchenTimer(name ?? '', seconds);
    if (id === null) return capRefusal;
    const label = formatDuration(seconds);
    const shownName = name === null ? null : toKitchenTimerName(name);
    return done(
      `Started the ${shownName === null ? label : shownName} timer`,
      `Started a ${toSpokenLabel(label)}${shownName === null ? '' : ` ${shownName.toLowerCase()}`} timer.`,
    );
  };
  const applyToTimer = (
    verb: PendingTimerVerb,
    id: string,
    arg: TimerArg,
  ): CookVoiceResult => {
    const timer = getVoiceTimers().find((candidate) => candidate.id === id);
    if (!timer) return refuse('That timer is gone.');
    const name = showTimerName(timer);
    const spoken = saidTimerName(timer);
    if (verb === 'PAUSE') {
      if (timer.status !== 'running')
        return refuse(`The ${name} isn't running.`);
      timers.pause(id);
      return done(`Paused the ${name}`, `Paused the ${spoken}.`);
    }
    if (verb === 'RESUME') {
      if (timer.status !== 'paused') return refuse(`The ${name} isn't paused.`);
      timers.resume(id);
      return done(`Resumed the ${name}`, `Resumed the ${spoken}.`);
    }
    if (verb === 'EXTEND') {
      if (!timers.extend(id, arg.ms)) {
        return timer.status === 'done' && timers.isFull
          ? capRefusal
          : refuse('A timer can run for a day at most.');
      }
      const added = formatDuration(arg.ms / 1000);
      return done(
        `Added ${added} to the ${name}`,
        `Added ${toSpokenLabel(added)} to the ${spoken}.`,
      );
    }
    if (verb === 'RENAME') {
      const newName = toKitchenTimerName(arg.name);
      timers.rename(id, newName);
      return done(
        `Renamed the ${name} to ${newName}`,
        `Renamed the ${spoken} to ${newName}.`,
      );
    }
    if (timer.status === 'done') {
      if (timer.id === focused?.id && isJustRung()) {
        return justRang('to dismiss it');
      }
      endTimer(id);
      return done(`Dismissed the ${name}`, `Dismissed the ${spoken}.`);
    }
    if (timer.status === 'running') {
      timers.pause(id);
      return done(
        'Paused. Say “stop” again to reset it.',
        `Paused the ${spoken}. Say stop again to reset it.`,
      );
    }
    endTimer(id);
    return done(`Reset the ${name}`, `Reset the ${spoken}.`);
  };
  const applyToAll = (
    verb: PendingTimerVerb,
    ids: string[],
    arg: TimerArg,
  ): CookVoiceResult => {
    if (ids.length === 1) return applyToTimer(verb, ids[0], arg);
    const results = ids.map((id) => applyToTimer(verb, id, arg));
    const count = results.filter((result) => result.ok).length;
    if (count === 0) return results[0];
    const text =
      verb === 'PAUSE'
        ? `Paused ${count} timers`
        : verb === 'RESUME'
          ? `Resumed ${count} timers`
          : `Added ${formatDuration(arg.ms / 1000)} to ${count} timers`;
    return done(text, `${text}.`);
  };
  /** Stop on several: ring first (dismissed), else what runs is paused, else what is paused is reset, the same two taps "stop" takes on one. */
  const stopAll = (list: VoiceTimer[]): CookVoiceResult => {
    const ringing = list.filter((timer) => timer.status === 'done');
    const running = list.filter((timer) => timer.status === 'running');
    const act =
      ringing.length > 0 ? ringing : running.length > 0 ? running : list;
    if (act.length === 1) return applyToTimer('STOP', act[0].id, NO_ARG);
    if (ringing.length > 0 && isRingingInFront && isJustRung()) {
      return justRang('to dismiss them');
    }
    act.forEach((timer) => applyToTimer('STOP', timer.id, NO_ARG));
    if (ringing.length > 0) {
      return done(
        `Dismissed ${act.length} timers`,
        `Dismissed ${act.length} timers.`,
      );
    }
    return running.length > 0
      ? done(
          `Paused ${act.length} timers. Say “stop all” again to reset them.`,
          `Paused ${act.length} timers. Say stop all again to reset them.`,
        )
      : done(`Reset ${act.length} timers`, `Reset ${act.length} timers.`);
  };
  const applyResolution = (
    verb: PendingTimerVerb,
    resolution: ReturnType<typeof resolveVoiceTimers<VoiceTimer>>,
    arg: TimerArg,
    target: CookTimerTarget,
    state: string,
  ): CookVoiceResult => {
    if (resolution.kind === 'NONE') return noTimer(target, state);
    if (resolution.kind === 'GUESS') {
      return askGuess(verb, resolution.timer, arg, target.name ?? '');
    }
    if (resolution.kind === 'ASK') {
      return askWhich(verb, resolution.timers, arg, resolution.missed ?? null);
    }
    if (resolution.kind === 'ONE') {
      return applyToTimer(verb, resolution.timer.id, arg);
    }
    return verb === 'STOP'
      ? stopAll(resolution.timers)
      : applyToAll(
          verb,
          resolution.timers.map((timer) => timer.id),
          arg,
        );
  };
  const resolveTimers = (
    statuses: CookTimer['status'][],
    target: CookTimerTarget,
  ) =>
    resolveVoiceTimers(getVoiceTimers(), {
      statuses,
      target,
      focusedId: focused?.id ?? null,
    });
  const isUntargeted = (target: CookTimerTarget) =>
    target.seconds === null && target.name === null && !target.isAll;

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
    showTimers: () => {
      timers.unfocus();
      if (view !== 'timers') showView('timers');
      return done();
    },
    startTimer: (seconds, name) => {
      if (name === null) {
        const durations = findDurations(voiceStep.text).map((found) => ({
          seconds: found.seconds,
          label: formatDuration(found.seconds),
        }));
        const ready = getReadyStepTimers(timers.timers, {
          recipeId: voiceStep.recipe.id,
          stepNumber: voiceStep.stepNumber,
          durations,
        });
        const slot =
          seconds === null
            ? (ready[0] ?? durations[0])
            : durations.find((candidate) => candidate.seconds === seconds);
        if (slot) {
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
        }
      }
      return seconds === null
        ? askLength(name)
        : startKitchenByVoice(name, seconds);
    },
    pauseTimer: (target) => {
      if (isAnyRinging && isUntargeted(target)) return ringingRefusal;
      return applyResolution(
        'PAUSE',
        resolveTimers(['running'], target),
        NO_ARG,
        target,
        'going',
      );
    },
    resumeTimer: (target) => {
      if (isAnyRinging && isUntargeted(target)) return ringingRefusal;
      return applyResolution(
        'RESUME',
        resolveTimers(['paused'], target),
        NO_ARG,
        target,
        'paused',
      );
    },
    stopTimer: (target, scope) => {
      const ringing = resolveTimers(['done'], target);
      if (ringing.kind !== 'NONE') {
        return applyResolution('STOP', ringing, NO_ARG, target, 'going');
      }
      if (scope === 'RINGING') return refuse('No timer is ringing.');
      return applyResolution(
        'STOP',
        resolveTimers(['running', 'paused'], target),
        NO_ARG,
        target,
        'going',
      );
    },
    extendTimer: (seconds, target) =>
      applyResolution(
        'EXTEND',
        resolveTimers(['running', 'paused', 'done'], target),
        { ms: seconds * 1000, name: '' },
        target,
        'going',
      ),
    renameTimer: (target, name) =>
      applyResolution(
        'RENAME',
        resolveTimers(['running', 'paused', 'done'], target),
        { ms: 0, name },
        target,
        'going',
      ),
    timeLeft: (target) => {
      const all = getVoiceTimers();
      const getTold = () => {
        if (isUntargeted(target)) {
          return pickTimersToTell(all, focused?.id ?? null);
        }
        const resolution = resolveVoiceTimers(all, {
          statuses: ['running', 'paused', 'done'],
          target,
          focusedId: null,
        });
        if (resolution.kind === 'NONE') return [];
        const list =
          resolution.kind === 'ONE' || resolution.kind === 'GUESS'
            ? [resolution.timer]
            : resolution.timers;
        return [
          ...list.filter((timer) => timer.status === 'done'),
          ...list
            .filter((timer) => timer.status === 'running')
            .sort((a, b) => a.remainingMs - b.remainingMs),
          ...list.filter((timer) => timer.status === 'paused'),
        ];
      };
      const told = getTold();
      if (told.length === 0) {
        return isUntargeted(target) || target.isAll
          ? answerNo('No timer is going.')
          : noTimer(target, 'going');
      }
      const { show, speak } = describeTimersLeft(
        told.slice(0, MAX_TOLD_TIMERS).map((timer) => ({
          label: timer.label,
          name: timer.stepName,
          callName: isNamedKitchenTimer(timer) ? timer.stepName : null,
          status: timer.status,
          remainingMs: timer.remainingMs,
          clock: formatClock(timer.remainingMs),
        })),
        Math.max(0, told.length - MAX_TOLD_TIMERS),
      );
      return done(show, speak);
    },
    answerTimer: (answer: CookTimerAnswer) => {
      const question = pending;
      setPending(null);
      if (answer.kind === 'NEVER_MIND')
        return done('Okay, never mind.', 'Okay.');
      if (question === null) return refuse('Nothing was asked.');
      if (answer.kind === 'LENGTH') {
        return question.kind === 'LENGTH'
          ? startKitchenByVoice(question.name, answer.seconds)
          : refuse('That was not a length.');
      }
      if (question.kind !== 'TIMER') return refuse('That was not a timer.');
      const live = getVoiceTimers().filter(
        (timer) =>
          answer.ids.includes(timer.id) && question.ids.includes(timer.id),
      );
      if (live.length === 0) return refuse('That timer is gone.');
      const arg = { ms: question.ms, name: question.name };
      if (live.length > 1 && !answer.isAll) {
        return askWhich(question.verb, live, arg);
      }
      return question.verb === 'STOP'
        ? stopAll(live)
        : applyToAll(
            question.verb,
            live.map((timer) => timer.id),
            arg,
          );
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
    readTips: () => {
      const text = getSpokenEntries(
        getEntriesAt(voiceStep.recipe, voiceStep.stepNumber - 1, true),
        'TIPS',
        formatDateShort,
      );
      if (text === null) return answerNo('No tips for this step.');
      if (isOnStep && stepEntries.some((entry) => entry.kind === 'TIP')) {
        showDockView('TIP');
      }
      return done('Reading the tips', text);
    },
    readNotes: () => {
      const text = getSpokenEntries(
        getEntriesAt(voiceStep.recipe, voiceStep.stepNumber - 1, true),
        'NOTES',
        formatDateShort,
      );
      if (text === null) return answerNo('No notes for this step.');
      if (isOnStep && stepEntries.some((entry) => entry.kind === 'NOTE')) {
        showDockView('NOTE');
      }
      return done('Reading the notes', text);
    },
    readChanges: () => {
      const text = getSpokenEntries(
        getEntriesAt(voiceStep.recipe, voiceStep.stepNumber - 1, true),
        'CHANGES',
        formatDateShort,
      );
      if (text === null) return answerNo('No planned changes for this step.');
      if (isOnStep && stepEntries.some((entry) => entry.kind === 'CHANGE')) {
        showDockView('CHANGE');
      }
      return done('Reading the changes', text);
    },
    showEntries: (kind) => {
      const word = ENTRY_WORDS[kind];
      if (!isOnStep) return refuse('Go to a step to see that.');
      const count = stepEntries.filter((entry) => entry.kind === kind).length;
      if (count === 0) {
        return answerNo(`No ${word}s for this step.`);
      }
      showDockView(kind);
      const label = `${count} ${count === 1 ? word : `${word}s`}`;
      return done(`Showing ${label}`, `Showing ${label}.`);
    },
    closeEntries: () => {
      if (shownView === null) return answerNo('Nothing is open.');
      showDockView(null);
      return done('Closed');
    },
    addEntry: (kind) => {
      if (focused !== null || !isStepsView || !hasSteps || isFinishShown) {
        return refuse('Go to a step to add that.');
      }
      if (capture.isOpen) return refuse('Finish writing this one first.');
      if (!capture.isAvailable(recipe.id) || isRemoved) {
        return refuse("Your notes aren't ready, or this recipe's are full.");
      }
      setPending({
        kind: 'DICTATE',
        entryKind: kind,
        recipeId: recipe.id,
        stepIndex: index,
      });
      const word = ENTRY_WORDS[kind];
      return done(`Say your ${word}`, `Go ahead. Say your ${word}.`);
    },
    dictation: (text) => {
      const question = pending;
      setPending(null);
      if (question === null || question.kind !== 'DICTATE') {
        return refuse('Nothing was asked.');
      }
      if (!isDictationHere(question)) return refuse('That step is no longer open.');
      const word = ENTRY_WORDS[question.entryKind];
      const id = generateUuid();
      lastDictated.current = {
        id,
         
        at: Date.now(),
        recipeId: question.recipeId,
        stepIndex: question.stepIndex,
      };
      void capture
        .quickAdd({
          id,
          recipeId: question.recipeId,
          kind: question.entryKind,
          text,
          stepIndex: question.stepIndex,
        })
        .catch(() => {
          lastDictated.current = null;
          voice.speak(`Sorry, I couldn't save that ${word}.`);
        });
      const coaching = hasCoachedUndo.current ? '' : ' Say undo that to take it back.';
      hasCoachedUndo.current = true;
      return done(
        `Saved your ${word} for step ${question.stepIndex + 1}`,
        `Saved your ${word} for step ${question.stepIndex + 1}: ${text.length > 80 ? `${text.slice(0, 80)}…` : text}.${coaching}`,
      );
    },
    undoEntry: () => {
      const last = lastDictated.current;
      const written = last === null ? undefined : notesById.get(last.id);
      // Only what the voice just wrote, still as it wrote it, on the step it is on: never an entry turned into a tweak or edited since.
      if (
        last === null ||
        written === undefined ||
        written.kind === 'TWEAK' ||
        written.updatedAt !== written.createdAt ||
         
        Date.now() - last.at > UNDO_DICTATION_MS ||
        isFinishShown ||
        last.recipeId !== recipe.id ||
        last.stepIndex !== index
      ) {
        return refuse('There is nothing to undo.');
      }
      lastDictated.current = null;
      void capture
        .removeById(last.id)
        .catch(() => voice.speak("Sorry, I couldn't take that back."));
      return done('Took that back', 'Okay, I took that back.');
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
  /** A dictation waits only for the step it was asked on, with the composer closed, nothing ringing and no timer on screen: anything else the person did since means they are not saying a tip. */
  const isDictationHere = (question: { recipeId: string; stepIndex: number }) =>
    question.recipeId === recipe.id &&
    question.stepIndex === index &&
    isStepsView &&
    focused === null &&
    !capture.isOpen &&
    !isAnyRinging &&
    !isFinishShown &&
    !isEditing;
  const getVoiceChoice = (): CookVoiceChoice | null => {
    if (!voice.isOn || pending === null) return null;
    if (pending.kind === 'LENGTH') return { kind: 'LENGTH' };
    if (pending.kind === 'DICTATE') {
      return isDictationHere(pending)
        ? { kind: 'DICTATE', entryKind: pending.entryKind }
        : null;
    }
    const asked = pending.ids.flatMap((id) =>
      timers.timers.filter((timer) => timer.id === id),
    );
    return asked.length === 0
      ? null
      : {
          kind: 'TIMER',
          timers: asked.map(toVoiceTimerRef),
          isConfirm: pending.isConfirm === true,
        };
  };
  const voiceContext = {
    recipes: entries.map((candidate) => ({
      id: candidate.recipe.id,
      title: candidate.recipe.title,
    })),
    shownRecipeId: voiceStep.recipe.id,
    timers: timers.timers.map(toVoiceTimerRef),
    choice: getVoiceChoice(),
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
    capture.isOpen && !VOICE_WHILE_WRITING.has(command.kind)
      ? refuse('Finish writing this one first.')
      : runCookCommand(command, makeVoiceActions()),
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
  const followUpRecords = records.filter(
    (record) => record.recordedCookId !== null,
  );
  const getReviewEntries = (
    recipeId: string,
    isIncludingEarlier = false,
  ): CookReviewEntry[] => {
    const steps =
      entries.find((candidate) => candidate.recipe.id === recipeId)?.recipe
        .steps ?? [];
    const toEntry = (found: RecipeNote) => ({
      note: found,
      stepAt: resolveNoteStep(found, steps),
    });
    const written = capture.captured.flatMap((id) => {
      const found = notesById.get(id);
      return found !== undefined &&
        found.recipeId === recipeId &&
        found.kind !== 'TWEAK'
        ? [toEntry(found)]
        : [];
    });
    if (!isIncludingEarlier) return written;
    const earlier = (notesByRecipe.get(recipeId) ?? NO_RECIPE_NOTES)
      .filter(
        (found) =>
          found.kind === 'CHANGE' && !capture.captured.includes(found.id),
      )
      .map(toEntry)
      .reverse();
    return [...earlier, ...written];
  };
  /** The recipes with a change still planned: Done asks about each in turn whether to update it now. */
  const changeTargets = followUpRecords.flatMap((record) => {
    const changes = getReviewEntries(record.recipeId, true).filter(
      (entry) => entry.note.kind === 'CHANGE',
    );
    return changes.length === 0
      ? []
      : [
          {
            recipeId: record.recipeId,
            ids: changes.map((entry) => entry.note.id),
            texts: changes.map((entry) => entry.note.text ?? ''),
            title: record.entry.recipe.title,
          },
        ];
  });
  const hasFollowUps = records.some(
    (record) =>
      getReviewEntries(record.recipeId).length > 0 ||
      followUps[record.recipeId] === 'CHANGED' ||
      (putAway.getEntry(record.recipeId)?.saved.length ?? 0) > 0,
  );
  const getFollowUpDone = (recipeId: string) =>
    followUps[recipeId] === 'CHANGED' ? 'Recipe changed.' : null;
  const openCaptureTitle =
    entries.find((candidate) => candidate.recipe.id === capture.draft?.recipeId)
      ?.recipe.title ?? null;

  const getTimerNote = () => {
    if (focused === null || focused.status === 'done') return null;

    const parts = [
      timers.isNoticeShown
        ? 'Keep this screen open: timers stop if you leave it.'
        : null,
      !wakeLock.isSupported || wakeLock.hasFailed
        ? 'This browser can’t keep the screen awake, so it may dim.'
        : null,
    ].filter((part) => part !== null);
    return parts.length === 0 ? null : parts.join(' ');
  };
  const isEditedHere = editedIds.includes(recipe.id);
  const isChanged =
    isRemoved ||
    recipe.isArchived === true ||
    (!isEditedHere && recipe.updatedAt !== openedUpdatedAt.get(recipe.id));

  const dishStrip =
    isPlate && !isFinishShown && focused === null ? (
      <CookDishStrip dishes={dishes} value={recipe.id} onChange={showRecipe} />
    ) : null;
  const isDishStripInStep = isStepsView && hasSteps && !isWide;
  const readEntries = (kind: 'TIP' | 'NOTE' | 'CHANGE') =>
    voice.speak(
      getSpokenEntries(
        stepEntries.filter((entry) => entry.kind === kind),
        kind === 'TIP' ? 'TIPS' : kind === 'NOTE' ? 'NOTES' : 'CHANGES',
        formatDateShort,
      ) ?? '',
    );
  const openStepCapture = () =>
    capture.open({ recipeId: recipe.id, stepIndex: index, kind: 'TIP' });
  const lastTime =
    !isWide && index === 0
      ? {
          recipeId: recipe.id,
          isDismissed: !isCookNoteShown(index, gotItNotes, recipe.id),
          onGotIt: () => setGotItNotes((current) => [...current, recipe.id]),
        }
      : null;
  const notesDoor = (
    <RecipeNotes
      recipeId={recipe.id}
      onAdd={null}
      onEdit={null}
      onApplyChange={(noteId) => void startEdit(recipe.id, [noteId])}
    />
  );
  const timersButton = (
    <Button
      type='button'
      variant='secondary'
      size='icon'
      rounded='full'
      className='size-10 shrink-0'
      aria-label={timers.liveCount > 0 ? `Timers, ${timers.liveCount} going` : 'Timers'}
      onClick={handleShowTimers}
    >
      <Timer className='h-4 w-4' aria-hidden='true' />
    </Button>
  );
  const ingredientsButton = isWide ? null : (
    <Button
      type='button'
      variant='secondary'
      className='h-10 shrink-0 gap-2 px-4 text-sm max-[379px]:w-10 max-[379px]:px-0'
      aria-label='Ingredients'
      onClick={() => showView('ingredients')}
    >
      <ListChecks className='h-4 w-4' aria-hidden='true' />
      <span className='max-[379px]:hidden'>Ingredients</span>
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
      action={
        <div className='flex shrink-0 items-center gap-2'>
          {timersButton}
          {ingredientsButton}
        </div>
      }
      lastTime={lastTime}
      entries={stepEntries}
      onEditEntry={capture.edit}
      onApplyChange={(id) => void startEdit(recipe.id, [id])}
      onReadEntries={voice.isSupported ? readEntries : null}
      shownView={shownView}
      onShowView={showDockView}
      onAddEntry={
        capture.isAvailable(recipe.id) && !isRemoved ? openStepCapture : null
      }
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
        step={
          focusedRecipe === null
            ? null
            : {
                number: focusedIndex + 1,
                count: Math.max(1, focusedSteps.length),
                text: focusedStepText,
                rows: stepRowsOfTimer,
                isAmountNoteShown:
                  isFocusedScaled && match !== null && match.hasWrittenAmount,
              }
        }
        others={getTimerRows(timers.timers, focused.id)}
        readySlots={
          timers.isFull || focused.recipeId === null
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
        buzz={focused.status === 'running' ? <CookTimerBuzz uid={uid} /> : null}
        onTick={timers.settle}
        backLabel={timerSecondary === 'BACK' ? secondaryLabels.text : null}
        onBack={backToStep}
        isFull={timers.isFull}
        onPause={timers.pause}
        onResume={timers.resume}
        onExtend={(id, ms) => void timers.extend(id, ms)}
        onReset={endTimer}
        onFocus={timers.focus}
        onShowAll={handleShowTimers}
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
      className={
        isEditing
          ? undefined
          : 'lg:max-w-5xl [@media(max-height:500px)]:max-w-4xl'
      }
      title={isEditing ? editTitle : title}
      headerAction={
        voice.isSupported && !isFinishShown && !isEditing ? (
          <CookVoiceButton voice={voice} />
        ) : null
      }
      onClose={closeSubview}
      onBack={() => {
        if (isEditing) {
          void leaveEdit();
        } else if (capture.isOpen) {
          void cancelCapture();
        } else if (focused !== null) {
          backToStep();
        } else if (isStepsView && shownView !== null) {
          showDockView(null);
        } else if (isStepsView) {
          void leave();
        } else {
          showView('steps');
        }
      }}
    >
      <div
        ref={rootRef}
        className={join(
          'flex flex-1 flex-col gap-4 [@media(max-height:500px)]:gap-2',
          isEditing && 'hidden!',
        )}
      >
        {!isDishStripInStep && dishStrip}
        {focused !== null ? (
          getTimerContent()
        ) : capture.isOpen && !isFinishShown ? (
          <CookCaptureView
            capture={capture}
            steps={recipe.steps}
            caption={isPlate ? recipe.title : null}
            backLabel='Back to the step'
            onBack={() => void cancelCapture()}
            onDelete={() => void deleteCaptured()}
          />
        ) : isTimersView ? (
          <CookTimersView
            timers={getTimerRows(timers.timers, null)}
            draft={timerDraft}
            isFull={timers.isFull}
            onDraftChange={setTimerDraft}
            onBack={() => showView('steps')}
            onTick={timers.settle}
            onFocus={timers.focus}
            onPause={timers.pause}
            onResume={timers.resume}
            onExtend={(id, ms) => void timers.extend(id, ms)}
            onEnd={endTimer}
          />
        ) : isFinishShown ? (
          <div className='mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 py-6 [@media(max-height:600px)]:gap-3 [@media(max-height:600px)]:py-2'>
            <p className='text-center text-2xl leading-snug font-medium'>
              Nice work
            </p>
            {!capture.isOpen && !putAway.isOpen && (
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
            {!capture.isOpen &&
              !putAway.isOpen &&
              followUpRecords.map((record) => (
                <CookResultCard
                  key={record.recipeId}
                  uid={uid}
                  cookId={record.recordedCookId ?? ''}
                  caption={isPlate ? record.entry.recipe.title : null}
                />
              ))}
            {!capture.isOpen && !putAway.isOpen && isRecorded && (
              <CookPantryTake take={pantryTake} />
            )}
            {!capture.isOpen &&
              recordedEntries.map((record) => (
                <CookPutAway
                  key={record.recipeId}
                  putAway={putAway}
                  recipeId={record.recipeId}
                  care={getRecipeCare(record.entry.recipe)}
                  caption={isPlate ? record.entry.recipe.title : null}
                />
              ))}
            {isRecorded && capture.isOpen && (
              <CookCaptureView
                capture={capture}
                steps={
                  entries.find(
                    (candidate) =>
                      candidate.recipe.id === capture.draft?.recipeId,
                  )?.recipe.steps ?? []
                }
                caption={isPlate ? openCaptureTitle : null}
                backLabel='Back'
                onBack={() => void cancelCapture()}
                onDelete={() => void deleteCaptured()}
              />
            )}
            {!capture.isOpen &&
              !putAway.isOpen &&
              followUpRecords.map((record) => {
                const reviewEntries = getReviewEntries(record.recipeId, true);
                const plannedChanges = reviewEntries.filter(
                  (entry) => entry.note.kind === 'CHANGE',
                );
                return (
                  <CookReview
                    key={record.recipeId}
                    caption={isPlate ? record.entry.recipe.title : null}
                    entries={reviewEntries}
                    canAdd={capture.isAvailable(record.recipeId)}
                    isNothingChosen={followUps[record.recipeId] === 'NOTHING'}
                    doneText={getFollowUpDone(record.recipeId)}
                    plannedChangeCount={plannedChanges.length}
                    onAdd={() =>
                      capture.open({
                        recipeId: record.recipeId,
                        stepIndex: null,
                        kind: 'NOTE',
                      })
                    }
                    onEdit={capture.edit}
                    onChangeRecipe={() => void startEdit(record.recipeId, [])}
                    onNothing={() => chooseNothing(record.recipeId)}
                  />
                );
              })}
            {!capture.isOpen && !putAway.isOpen && (
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
          {isEditedHere && !isChanged && focused === null && !isFinishShown && (
            <p className='text-muted-foreground text-xs'>
              Cooking now follows your changes.
            </p>
          )}
        </div>
        <div
          className={join(
            'form-footer pb-[calc(0.75rem+env(safe-area-inset-bottom))]!',
            isWide &&
              !isFinishShown &&
              !isTimersView &&
              focused === null &&
              'grid grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] gap-x-10',
          )}
        >
          <div
            className={join(
              'flex flex-col gap-2 [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:gap-3',
              focused !== null &&
                'lg:[@media(min-height:501px)]:mx-auto lg:[@media(min-height:501px)]:max-w-xl',
              isFinishShown &&
                focused === null &&
                'lg:[@media(min-height:501px)]:mx-auto lg:[@media(min-height:501px)]:max-w-md',
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
            {isTimersView && focused === null && getStartNote() !== null && (
              <p role='status' className='text-muted-foreground text-xs'>
                {getStartNote()}
              </p>
            )}
            <CookTimerStrip
              timers={
                focused === null && !isTimersView
                  ? getTimerRows(timers.timers, null)
                  : []
              }
              className='[@media(max-height:500px)]:min-w-0 [@media(max-height:500px)]:flex-1 [@media(max-height:500px)]:self-center'
              onTick={timers.settle}
              onFocus={isDraftOpen ? null : timers.focus}
            />
            <div className='flex gap-3 [@media(max-height:500px)]:min-w-0 [@media(max-height:500px)]:flex-1'>
              {focused !== null ? (
                <>
                  {timerSecondary === 'NEXT' && (
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
              ) : capture.isOpen && (isRecorded || !isFinishShown) ? (
                <>
                  <Button
                    type='button'
                    variant='secondary'
                    className={join(
                      'h-14 shrink-0 px-6 text-base',
                      '[@media(max-height:500px)]:h-11',
                    )}
                    disabled={capture.isSaving}
                    onClick={() => void cancelCapture()}
                  >
                    Cancel
                  </Button>
                  <Button
                    type='button'
                    className={join(
                      'h-14 min-w-0 flex-1 text-lg',
                      '[@media(max-height:500px)]:h-11',
                    )}
                    loading={capture.isSaving}
                    disabled={capture.isSaving || !capture.canSave}
                    onClick={() => void capture.save()}
                  >
                    Save
                  </Button>
                </>
              ) : isFinishShown ? (
                <>
                  <Button
                    ref={primaryRef}
                    type='button'
                    className={join(
                      'h-14 min-w-0 flex-1 text-lg',
                      '[@media(max-height:500px)]:h-11',
                    )}
                    onClick={() => void handleDone()}
                  >
                    Done
                  </Button>
                </>
              ) : isTimersView ? (
                <>
                  <Button
                    ref={primaryRef}
                    type='button'
                    className={join(
                      'h-14 min-w-0 flex-1 gap-2 text-lg',
                      '[@media(max-height:500px)]:h-11',
                    )}
                    disabled={draftSeconds === null || timers.isFull}
                    onClick={handleStartDraft}
                  >
                    <Play className='h-5 w-5' aria-hidden='true' />
                    Start timer
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
      {edit !== null && (
        <CookRecipeEdit
          key={edit.token}
          uid={uid}
          recipeId={edit.recipeId}
          changeIds={edit.changeIds}
          isDirtyRef={editDirtyRef}
          backStepRef={editBackStepRef}
          onTitleChange={setEditTitle}
          onLeave={() => void leaveEdit()}
          onSaved={() => finishEdit(edit)}
        />
      )}
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

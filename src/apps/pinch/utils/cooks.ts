import type { DevicePushState } from '@/lib/notifications/devicePush';
import { toDateInputValue } from '@/utils/dateInputUtils';
import {
  ALERT_REPEAT_MS,
  MAX_ALERT_REPEATS,
  MAX_COOK_TIMERS,
  MAX_COOKED_SERVINGS,
  MAX_STEP_TIMERS,
  MIN_COOK_SERVINGS,
  SOFT_MAX_COOKS_PER_RECIPE,
} from '@apps/pinch/constants';
import type {
  Cook,
  MealItem,
  PlateCookRecipe,
  Recipe,
} from '@apps/pinch/types';
import { getLocalTodayDate } from '@apps/pinch/utils/dayKeys';

export interface CookSummary {
  count: number;
  lastCookedAt: number;
}

export interface MarkableRecipe {
  recipe: Recipe;
  servings: number;
}

export const getCookId = (plannedMealId: string, recipeId: string) =>
  `${plannedMealId}__${recipeId}`;

/** The cook that cooking started from a planned meal marks, null for any other start. */
export const getPlannedCookId = (
  plannedMealId: string | null,
  recipeId: string,
) => (plannedMealId === null ? null : getCookId(plannedMealId, recipeId));

const byNewest = (a: Cook, b: Cook) =>
  b.cookedAt - a.cookedAt ||
  b.createdAt - a.createdAt ||
  a.id.localeCompare(b.id);

export const groupCooksByRecipe = (cooks: Cook[]) => {
  const result = [...cooks].sort(byNewest).reduce((byRecipe, cook) => {
    const list = byRecipe.get(cook.recipeId);
    if (list) {
      list.push(cook);
    } else {
      byRecipe.set(cook.recipeId, [cook]);
    }
    return byRecipe;
  }, new Map<string, Cook[]>());

  return result;
};

export const getCookSummaries = (cooks: Cook[]) => {
  const result = cooks.reduce((summaries, cook) => {
    const known = summaries.get(cook.recipeId);
    summaries.set(cook.recipeId, {
      count: (known?.count ?? 0) + 1,
      lastCookedAt: Math.max(known?.lastCookedAt ?? -Infinity, cook.cookedAt),
    });
    return summaries;
  }, new Map<string, CookSummary>());

  return result;
};

export const isCookHistoryFull = (count: number) =>
  count >= SOFT_MAX_COOKS_PER_RECIPE;

export const isValidCookServings = (servings: number) =>
  Number.isFinite(servings) && servings > 0 && servings <= MAX_COOKED_SERVINGS;

/** Now on today, local noon on a day already past, null on a day still ahead. */
export const getPlannedCookedAt = (plannedDate: number, now = Date.now()) => {
  const today = getLocalTodayDate(now);
  if (plannedDate > today) return null;
  if (plannedDate === today) return now;

  const [year, month, day] = toDateInputValue(plannedDate)
    .split('-')
    .map(Number);
  const result = new Date(year, month - 1, day, 12).getTime();

  return result;
};

export const getMarkableRecipes = (
  items: MealItem[],
  recipesById: Map<string, Recipe>,
) => {
  const byRecipe = items.reduce((acc, item) => {
    const recipe = item.kind === 'RECIPE' ? recipesById.get(item.refId) : null;
    if (recipe) {
      acc.set(recipe.id, {
        recipe,
        servings: Math.min(
          MAX_COOKED_SERVINGS,
          (acc.get(recipe.id)?.servings ?? 0) + item.servings,
        ),
      });
    }
    return acc;
  }, new Map<string, MarkableRecipe>());

  return [...byRecipe.values()];
};

export const mergePlannedCook = (existing: Cook | null, incoming: Cook) =>
  existing === null
    ? { isNew: true, cook: incoming }
    : { isNew: false, cook: existing };

/** The rules want every key on the merged document, so an edit writes back the one an older cook lacks. */
export const getMissingCookFields = (existing: object) =>
  'plannedMealId' in existing ? {} : { plannedMealId: null };

export const getCookServings = (servings: number) =>
  servings > 0 ? Math.min(servings, MAX_COOKED_SERVINGS) : 1;

/** What cooking starts at: the recipe as written, or the plan's count when it asks for more than the recipe makes. */
export const getCookStartServings = (
  recipeServings: number,
  plannedServings: number | null,
) =>
  Math.min(
    MAX_COOKED_SERVINGS,
    Math.max(recipeServings > 0 ? recipeServings : 1, plannedServings ?? 0),
  );

/** Where one recipe of a cooking session is: the step on screen, its servings and what has been ticked as got out. */
export interface PlateCookState {
  stepIndex: number;
  servings: number;
  gotOut: Record<string, boolean>;
}

/** The recipes a planned plate cooks together: each one with steps among `cookRecipeIds`, once, in plate order, with the servings its items plan for tonight. */
export const getPlateCookRecipes = (
  items: Pick<MealItem, 'kind' | 'refId' | 'servings'>[],
  recipesById: Map<string, Pick<Recipe, 'steps'>>,
  cookRecipeIds: string[],
) => {
  const allowed = new Set(cookRecipeIds);
  const byRecipe = items.reduce((acc, item) => {
    const recipe =
      item.kind === 'RECIPE' && allowed.has(item.refId)
        ? recipesById.get(item.refId)
        : undefined;
    if (recipe && recipe.steps.length > 0) {
      acc.set(
        item.refId,
        Math.min(
          MAX_COOKED_SERVINGS,
          (acc.get(item.refId) ?? 0) + item.servings,
        ),
      );
    }
    return acc;
  }, new Map<string, number>());

  const result: PlateCookRecipe[] = [...byRecipe].map(
    ([recipeId, servings]) => ({ recipeId, servings }),
  );
  return result;
};

/** Every recipe of a session starts on its first step with nothing ticked, at its own servings (or the plan's when that is more). */
export const getPlateStart = (
  entries: {
    recipeId: string;
    recipeServings: number;
    plannedServings: number | null;
  }[],
) => {
  const result: Record<string, PlateCookState> = Object.fromEntries(
    entries.map(({ recipeId, recipeServings, plannedServings }) => [
      recipeId,
      {
        stepIndex: 0,
        servings: getCookStartServings(recipeServings, plannedServings),
        gotOut: {},
      },
    ]),
  );
  return result;
};

export type PlateNext =
  { kind: 'STEP' } | { kind: 'RECIPE'; recipeId: string } | { kind: 'FINISH' };

/** What the wide button does: the next step, then the next recipe still short of its last step, and Finish only once every recipe is on its last. */
export const getPlateNext = (
  recipes: { recipeId: string; stepIndex: number; stepCount: number }[],
  currentId: string,
): PlateNext => {
  const isWaiting = (recipe: { stepIndex: number; stepCount: number }) =>
    recipe.stepCount > 0 &&
    Math.min(recipe.stepIndex, recipe.stepCount - 1) < recipe.stepCount - 1;
  const at = recipes.findIndex((recipe) => recipe.recipeId === currentId);
  if (at >= 0 && isWaiting(recipes[at])) {
    return { kind: 'STEP' };
  }

  const waiting = [...recipes.slice(at + 1), ...recipes.slice(0, at)].find(
    isWaiting,
  );
  const result: PlateNext = waiting
    ? { kind: 'RECIPE', recipeId: waiting.recipeId }
    : { kind: 'FINISH' };
  return result;
};

/** A timer's name: its step's first words, after its recipe's name when the session cooks several. */
export const getTimerCaption = (timer: {
  stepName: string;
  recipeTitle: string | null;
}) =>
  timer.recipeTitle === null
    ? timer.stepName
    : `${timer.recipeTitle} · ${timer.stepName}`;

export type TimerPushAction = 'keep' | 'leave' | 'cancel';

/** What a timer's scheduled push needs now: `keep` while the timer runs to the deadline it was scheduled for and pushes are on, `leave` when it ended while the page was hidden (the push is what reaches the person), else `cancel` (the page rings by itself, or the timer was paused, reset or changed). */
export const getTimerPushAction = (
  timer: { status: string; endsAt?: number } | undefined,
  scheduledEndsAt: number,
  context: { isOn: boolean; isHidden: boolean },
): TimerPushAction => {
  if (
    context.isOn &&
    timer?.status === 'running' &&
    timer.endsAt === scheduledEndsAt
  ) {
    return 'keep';
  }
  return timer?.status === 'done' && context.isHidden ? 'leave' : 'cancel';
};

type PushClock =
  { status: 'running'; endsAt: number } | { status: 'paused' | 'done' };

/** Only a timer still ahead of its deadline gets a push; one picked up past its end has rung already. */
export const needsTimerPush = (
  timer: PushClock,
  now: number,
): timer is Extract<PushClock, { status: 'running' }> =>
  timer.status === 'running' && timer.endsAt > now;

export type TimerBuzzOffer = 'none' | 'ask' | 'blocked' | 'unsupported';

/** What the timer view offers about a push for when the screen is off: nothing while this device's state is unread or once it can be reached with timer pushes on, else a way in, whose sheet says what stands in the way when the browser can't do it. */
export const getTimerBuzzOffer = (
  device: DevicePushState | null,
  isTimersOn: boolean,
): TimerBuzzOffer => {
  if (device === null || (device === 'on' && isTimersOn)) return 'none';
  return device === 'blocked' || device === 'unsupported' ? device : 'ask';
};

/** Running and paused timers count against the session's cap; a finished one waits for Dismiss and doesn't. */
export const countLiveTimers = (timers: { status: string }[]) =>
  timers.filter((timer) => timer.status !== 'done').length;

export const canStartTimer = (timers: { status: string }[]) =>
  countLiveTimers(timers) < MAX_COOK_TIMERS;

/** The times a step mentions (the first `MAX_STEP_TIMERS`) that have no timer yet, each a card with Start; a started one lives in the timer view or the pill row instead, so no timer shows in two places. */
export const getReadyStepTimers = (
  timers: { recipeId: string; stepNumber: number; label: string }[],
  shown: {
    recipeId: string;
    stepNumber: number;
    durations: { seconds: number; label: string }[];
  } | null,
) => {
  const result = (shown?.durations.slice(0, MAX_STEP_TIMERS) ?? []).filter(
    (duration) =>
      !timers.some(
        (timer) =>
          timer.recipeId === shown?.recipeId &&
          timer.stepNumber === shown.stepNumber &&
          timer.label === duration.label,
      ),
  );
  return result;
};

type FocusableTimer = { id: string } & (
  | { status: 'running'; endsAt: number }
  | { status: 'paused' }
  | { status: 'done'; endedAt: number }
);

/** The timer the timer view shows: the Time's up that has waited longest (it stays in front until dismissed, and a later finish queues behind it whatever started first), else the one the person started or tapped, which keeps focus while paused, else the running one ending soonest. */
export const getFocusedTimerId = (
  timers: FocusableTimer[],
  pickedId: string | null,
) => {
  const picked = timers.find((timer) => timer.id === pickedId) ?? null;
  const getFocused = () => {
    const firstDone = timers.reduce<FocusableTimer | null>(
      (best, timer) =>
        timer.status === 'done' &&
        (best?.status !== 'done' || timer.endedAt < best.endedAt)
          ? timer
          : best,
      null,
    );
    if (firstDone) return firstDone;
    if (picked) return picked;
    const soonest = timers.reduce<FocusableTimer | null>(
      (best, timer) =>
        timer.status === 'running' &&
        (best?.status !== 'running' || timer.endsAt < best.endsAt)
          ? timer
          : best,
      null,
    );
    return soonest ?? timers[0] ?? null;
  };
  const result = getFocused()?.id ?? null;
  return result;
};

/** When each timer in `finished` rang, in the order they rang: its deadline, kept past `lastEndedAt` (the latest Time's up already waiting) so a clock stepped back never lets a later finish rank before one that is showing. */
export const getEndedAts = (
  finished: { id: string; endsAt: number }[],
  lastEndedAt: number,
) => {
  const ordered = [...finished].sort((a, b) => a.endsAt - b.endsAt);
  const result = ordered.reduce<{ last: number; ends: Map<string, number> }>(
    (acc, timer) => {
      const at = Math.max(timer.endsAt, acc.last + 1);
      return { last: at, ends: new Map([...acc.ends, [timer.id, at]]) };
    },
    { last: lastEndedAt, ends: new Map() },
  ).ends;
  return result;
};

/** How long ago a Time's up rang, to the minute: "Rang just now" under one. */
export const getRangAgo = (ageMs: number) => {
  const minutes = Math.floor(Math.max(0, ageMs) / 60_000);
  if (minutes < 1) return 'Rang just now';
  if (minutes < 60) return `Rang ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `Rang ${hours} h ago` : `Rang ${hours} h ${rest} min ago`;
};

export interface AlertRing {
  id: string;
  lastAt: number;
  repeats: number;
}

/** The Time's ups whose next repeat is due: a minute after each last buzzed, and never past `MAX_ALERT_REPEATS`. */
export const getAlertRepeatsDue = (rings: AlertRing[], now: number) =>
  rings
    .filter(
      (ring) =>
        ring.repeats < MAX_ALERT_REPEATS &&
        ring.lastAt + ALERT_REPEAT_MS <= now,
    )
    .map((ring) => ring.id);

/** When the soonest repeat of an undismissed Time's up is due, or null once every one has used its repeats. */
export const getNextAlertRepeatAt = (rings: AlertRing[]) => {
  const due = rings
    .filter((ring) => ring.repeats < MAX_ALERT_REPEATS)
    .map((ring) => ring.lastAt + ALERT_REPEAT_MS);
  const result = due.length === 0 ? null : Math.min(...due);
  return result;
};

/** A timer's slot on a step: the same recipe, step and length, whichever timer ran there. */
export const getTimerSlotKey = (timer: {
  recipeId: string;
  stepNumber: number;
  label: string;
}) => `${timer.recipeId}:${timer.stepNumber}:${timer.label}`;

export interface TimerFocus {
  /** Whether the timer view is up; false while the timers run in the background. */
  isShown: boolean;
  /** The timer the person started or tapped last; a finished one still comes first. */
  pickedId: string | null;
}

/** A finish brings the timer view up over whatever shows, and keeps what the person was watching so Dismiss returns to it. */
export const getFocusAfterFinish = (focus: TimerFocus): TimerFocus => ({
  isShown: true,
  pickedId: focus.isShown ? focus.pickedId : null,
});

/** Ending the timer in focus (Reset or Dismiss) shows the next finished one, else the one still picked, else closes the view; ending another timer changes nothing. */
export const getFocusAfterDismiss = (
  timers: FocusableTimer[],
  focus: TimerFocus,
  id: string,
): TimerFocus => {
  if (getFocusedTimerId(timers, focus.pickedId) !== id) {
    return focus;
  }
  const rest = timers.filter((timer) => timer.id !== id);
  const pickedId = focus.pickedId === id ? null : focus.pickedId;
  const result = {
    isShown:
      focus.isShown &&
      rest.some((timer) => timer.status === 'done' || timer.id === pickedId),
    pickedId,
  };
  return result;
};

/** Every timer but the one in focus, finished ones first, then in the order they started, so pausing one never moves it under the finger. */
export const getTimerRows = <T extends { id: string; status: string }>(
  timers: T[],
  focusedId: string | null,
) => {
  const others = timers.filter((timer) => timer.id !== focusedId);
  const result = [
    ...others.filter((timer) => timer.status === 'done'),
    ...others.filter((timer) => timer.status !== 'done'),
  ];
  return result;
};

export type TimerNext =
  | { kind: 'STEP'; recipeId: string; stepIndex: number }
  | { kind: 'RECIPE'; recipeId: string };

/** What follows a timer's step, for "Up next": its recipe's next step, or on that recipe's last step the next recipe still short of its own last; nothing once the person is already on that step or past it, or every recipe is on its last. */
export const getTimerNext = (
  recipes: { recipeId: string; stepIndex: number; stepCount: number }[],
  timer: { recipeId: string; stepNumber: number },
): TimerNext | null => {
  const own = recipes.find((recipe) => recipe.recipeId === timer.recipeId);
  if (!own || own.stepIndex >= timer.stepNumber) {
    return null;
  }
  if (timer.stepNumber < own.stepCount) {
    return {
      kind: 'STEP',
      recipeId: own.recipeId,
      stepIndex: timer.stepNumber,
    };
  }

  const next = getPlateNext(
    recipes.map((recipe) =>
      recipe.recipeId === own.recipeId
        ? { ...recipe, stepIndex: Math.max(0, recipe.stepCount - 1) }
        : recipe,
    ),
    own.recipeId,
  );
  const result = next.kind === 'RECIPE' ? next : null;
  return result;
};

export type TimerSecondary = 'NEXT' | 'BACK' | null;

/** The footer's secondary beside Pause, Resume or Dismiss: Next only while the timer's next step is still ahead of the person; otherwise a live timer offers a way back to the step they were on (a peek from a pill), and a Time's up over a later step offers nothing, so two buttons never end at the same screen. */
export const getTimerSecondary = (
  next: TimerNext | null,
  status: 'running' | 'paused' | 'done',
): TimerSecondary => {
  if (next !== null) return 'NEXT';
  return status === 'done' ? null : 'BACK';
};

/** On a plate, the other recipe still short of its last step while the timer's runs (waiting is the moment to start it), with the step it would open on; nothing on a lone recipe, when "Up next" already names that recipe or when no other recipe has a step to do. */
export const getMeanwhile = (
  recipes: { recipeId: string; stepIndex: number; stepCount: number }[],
  timerRecipeId: string,
  next: TimerNext | null,
) => {
  const own = recipes.find((recipe) => recipe.recipeId === timerRecipeId);
  if (recipes.length < 2 || !own) {
    return null;
  }

  const other = getPlateNext(
    recipes.map((recipe) =>
      recipe.recipeId === own.recipeId
        ? { ...recipe, stepIndex: Math.max(0, recipe.stepCount - 1) }
        : recipe,
    ),
    own.recipeId,
  );
  const target =
    other.kind === 'RECIPE'
      ? recipes.find((recipe) => recipe.recipeId === other.recipeId)
      : undefined;
  if (
    !target ||
    (next?.kind === 'RECIPE' && next.recipeId === target.recipeId)
  ) {
    return null;
  }

  const result = {
    recipeId: target.recipeId,
    stepIndex: Math.min(target.stepIndex, target.stepCount - 1),
  };
  return result;
};

/** A whole serving a tap, and a half only below one. */
export const stepCookServings = (current: number, direction: 1 | -1) => {
  if (direction === 1) {
    return Math.min(
      MAX_COOKED_SERVINGS,
      current < 1 ? 1 : Math.floor(current) + 1,
    );
  }
  const next = Math.ceil(current) - 1;
  return next >= 1 ? next : MIN_COOK_SERVINGS;
};

const TRAILING_LITTLE_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'for',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

/** A step up to its first sentence end (a stop, question or exclamation mark before a capital or a digit) or its first line break, for "Up next". */
export const getFirstSentence = (text: string) => {
  const trimmed = text.trim();
  const end = trimmed.search(/[.!?](?=\s+[\p{Lu}\d])|\n/u);
  const result = end < 0 ? trimmed : trimmed.slice(0, end + 1).trim();
  return result;
};

/** A step's first few words ("Brown the beef"), so two timers are told apart by what is cooking, cut before a little word or a number left at the end ("Simmer for 2 minutes" is "Simmer"). */
export const getStepName = (step: string) => {
  const words = step
    .replace(/[^\p{L}\p{N}'\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  const kept = words.reduceRight<string[]>(
    (acc, word) =>
      acc.length === 0 &&
      (TRAILING_LITTLE_WORDS.has(word.toLowerCase()) || /^\p{N}+$/u.test(word))
        ? acc
        : [word, ...acc],
    [],
  );

  return kept.join(' ');
};

const SUMMARY_NAMED_LINES = 3;
const SUMMARY_FORMAT = new Intl.ListFormat('en-US', { type: 'conjunction' });

/** What the tray under a step says before it is opened: how many lines the step names, and the first three of them with their amounts ("Soy sauce ¼ cup, Garlic 4, Black pepper 1 tsp, and 2 more"). */
export const getAmountsSummary = (
  rows: { name: string; amountText: string }[],
) => {
  const named = rows
    .slice(0, SUMMARY_NAMED_LINES)
    .map((row) => [row.name, row.amountText].filter(Boolean).join(' '));
  const more = rows.length - named.length;
  const result = {
    count: rows.length,
    caption: `For this step · ${rows.length} ${rows.length === 1 ? 'item' : 'items'}`,
    text: SUMMARY_FORMAT.format(more > 0 ? [...named, `${more} more`] : named),
  };
  return result;
};

/** The recipe's note card shows where the cook starts (the first step) until the person says "Got it" for this cook. */
export const isCookNoteShown = (
  stepIndex: number,
  dismissedRecipeIds: string[],
  recipeId: string,
) => stepIndex === 0 && !dismissedRecipeIds.includes(recipeId);

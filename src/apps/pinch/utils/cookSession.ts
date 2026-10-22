import { MAX_COOK_TIMERS, MAX_KITCHEN_TIMER_NAME } from '@apps/pinch/constants';
import type {
  CookingResume,
  PlateCookRecipe,
  Recipe,
  ResumeTimer,
} from '@apps/pinch/types';
import { isValidCookServings } from '@apps/pinch/utils/cooks';
import { getPlateTitle } from '@apps/pinch/utils/mealFormat';

export const COOKING_SESSION_VERSION = 1;
export const COOKING_SESSION_MAX_AGE_MS = 12 * 3_600_000;
const MAX_SAVED_TIMERS = MAX_COOK_TIMERS * 2;
const MAX_SAVED_RECIPES = 20;
const CLOCK_SLACK_MS = 5 * 60_000;

/** What opened the screen, so picking a session up opens it the same way. */
export interface CookingOpen {
  recipeId: string;
  servings: number | null;
  plannedMealId: string | null;
  /** The day of the planned meal (a stored date), so a later pick-up can tell a meal that is gone from one outside the days loaded; null when it wasn't known. */
  plannedMealDate: number | null;
  plate: PlateCookRecipe[] | null;
}

export interface CookingSnapshot {
  version: number;
  uid: string;
  sessionId: string;
  savedAt: number;
  open: CookingOpen;
  resume: CookingResume;
}

export const getCookingSessionKey = (uid: string) =>
  `pinch:${uid}:cooking-session`;

/** Copies a timer field by field, so nothing a timer carries beyond these leaves the screen. */
export const toResumeTimer = (timer: ResumeTimer): ResumeTimer => {
  const base = {
    recipeId: timer.recipeId,
    stepNumber: timer.stepNumber,
    name: timer.name,
    label: timer.label,
    durationMs: timer.durationMs,
  };
  if (timer.status === 'running') {
    return {
      ...base,
      status: 'running',
      startedAt: timer.startedAt,
      endsAt: timer.endsAt,
      reminderId: timer.reminderId,
    };
  }
  if (timer.status === 'paused') {
    return { ...base, status: 'paused', remainingMs: timer.remainingMs };
  }
  return { ...base, status: 'done', endedAt: timer.endedAt };
};

/** The pushes a saved session still has scheduled, for the ones that go unused when it is let go. */
export const getTimerReminderIds = (timers: ResumeTimer[]) =>
  timers.flatMap((timer) =>
    timer.status === 'running' && timer.reminderId !== null
      ? [timer.reminderId]
      : [],
  );

export const buildCookingSnapshot = (input: {
  uid: string;
  sessionId: string;
  now: number;
  open: CookingOpen;
  currentId: string;
  positions: Record<string, { stepIndex: number; servings: number }>;
  timers: ResumeTimer[];
}): CookingSnapshot => ({
  version: COOKING_SESSION_VERSION,
  uid: input.uid,
  sessionId: input.sessionId,
  savedAt: input.now,
  open: {
    recipeId: input.open.recipeId,
    servings: input.open.servings,
    plannedMealId: input.open.plannedMealId,
    plannedMealDate: input.open.plannedMealDate,
    plate:
      input.open.plate === null
        ? null
        : input.open.plate.map((entry) => ({
            recipeId: entry.recipeId,
            servings: entry.servings,
          })),
  },
  resume: {
    currentId: input.currentId,
    positions: Object.fromEntries(
      Object.entries(input.positions).map(([id, position]) => [
        id,
        { stepIndex: position.stepIndex, servings: position.servings },
      ]),
    ),
    timers: input.timers.map(toResumeTimer),
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string =>
  typeof value === 'string' && value !== '';
const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const isCount = (value: unknown, max: number): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= max;

const isReminderId = (value: unknown): value is string =>
  typeof value === 'string' && /^[\w-]{1,64}$/.test(value);

const parseTimer = (value: unknown): ResumeTimer | null => {
  if (!isRecord(value)) return null;
  // A kitchen timer has no dish and is named; a session saved before them has neither key.
  const isKitchen = value.recipeId === null;
  const name = value.name === undefined ? null : value.name;
  if (
    !(isKitchen || isText(value.recipeId)) ||
    !(
      name === null ||
      (typeof name === 'string' &&
        name !== '' &&
        name.length <= MAX_KITCHEN_TIMER_NAME)
    ) ||
    (isKitchen && name === null) ||
    !isCount(value.stepNumber, 10_000) ||
    (isKitchen ? value.stepNumber !== 0 : value.stepNumber < 1) ||
    typeof value.label !== 'string' ||
    !isTime(value.durationMs) ||
    !(
      value.reminderId === undefined ||
      value.reminderId === null ||
      isReminderId(value.reminderId)
    )
  ) {
    return null;
  }
  const base = {
    recipeId: isKitchen ? null : (value.recipeId as string),
    stepNumber: value.stepNumber,
    name: isKitchen ? name : null,
    label: value.label,
    durationMs: value.durationMs,
  };
  if (
    value.status === 'running' &&
    isTime(value.startedAt) &&
    isTime(value.endsAt)
  ) {
    return {
      ...base,
      status: 'running',
      startedAt: value.startedAt,
      endsAt: value.endsAt,
      reminderId: isReminderId(value.reminderId) ? value.reminderId : null,
    };
  }
  if (
    value.status === 'paused' &&
    typeof value.remainingMs === 'number' &&
    Number.isFinite(value.remainingMs) &&
    value.remainingMs >= 0
  ) {
    return { ...base, status: 'paused', remainingMs: value.remainingMs };
  }
  if (value.status === 'done' && isTime(value.endedAt)) {
    return { ...base, status: 'done', endedAt: value.endedAt };
  }
  return null;
};

const parsePlate = (value: unknown): PlateCookRecipe[] | null => {
  if (!Array.isArray(value) || value.length > MAX_SAVED_RECIPES) return null;
  const entries = value.flatMap((entry): PlateCookRecipe[] =>
    isRecord(entry) &&
    isText(entry.recipeId) &&
    typeof entry.servings === 'number' &&
    isValidCookServings(entry.servings)
      ? [{ recipeId: entry.recipeId, servings: entry.servings }]
      : [],
  );
  return entries.length === value.length ? entries : null;
};

const parsePositions = (value: unknown) => {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  const positions = entries.flatMap(([id, position]) =>
    isRecord(position) &&
    isCount(position.stepIndex, 10_000) &&
    typeof position.servings === 'number' &&
    isValidCookServings(position.servings)
      ? [
          [
            id,
            { stepIndex: position.stepIndex, servings: position.servings },
          ] as const,
        ]
      : [],
  );
  return positions.length === entries.length &&
    positions.length <= MAX_SAVED_RECIPES
    ? Object.fromEntries(positions)
    : null;
};

const parseTimers = (value: unknown) => {
  if (!Array.isArray(value) || value.length > MAX_SAVED_TIMERS) return null;
  const timers = value.flatMap((entry): ResumeTimer[] => {
    const timer = parseTimer(entry);
    return timer === null ? [] : [timer];
  });
  return timers.length === value.length ? timers : null;
};

const parseOpen = (value: unknown): CookingOpen | null => {
  if (!isRecord(value) || !isText(value.recipeId)) return null;
  const { servings, plannedMealId } = value;
  const plate = value.plate === null ? null : parsePlate(value.plate);
  if (
    (servings !== null &&
      !(typeof servings === 'number' && isValidCookServings(servings))) ||
    (plannedMealId !== null && !isText(plannedMealId)) ||
    (value.plate !== null && plate === null)
  ) {
    return null;
  }
  return {
    recipeId: value.recipeId,
    servings: servings,
    plannedMealId: plannedMealId,
    plannedMealDate: isTime(value.plannedMealDate)
      ? value.plannedMealDate
      : null,
    plate,
  };
};

/** The saved session, or null when there is none, it is not this person's, it is too old, or anything in it is not what was written. */
export const parseCookingSnapshot = (
  raw: string | null,
  uid: string,
  now: number,
): CookingSnapshot | null => {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.version !== COOKING_SESSION_VERSION ||
      value.uid !== uid ||
      !isText(value.sessionId) ||
      !isTime(value.savedAt) ||
      value.savedAt > now + CLOCK_SLACK_MS ||
      now - value.savedAt > COOKING_SESSION_MAX_AGE_MS
    ) {
      return null;
    }
    const open = parseOpen(value.open);
    const resume = isRecord(value.resume) ? value.resume : null;
    const currentId = resume?.currentId;
    const positions = resume ? parsePositions(resume.positions) : null;
    const timers = resume ? parseTimers(resume.timers) : null;
    if (
      open === null ||
      !isText(currentId) ||
      positions === null ||
      timers === null
    ) {
      return null;
    }
    return {
      version: COOKING_SESSION_VERSION,
      uid,
      sessionId: value.sessionId,
      savedAt: value.savedAt,
      open,
      resume: { currentId, positions, timers },
    };
  } catch {
    return null;
  }
};

export interface CookingResumePlan {
  open: {
    recipeId: string;
    servings?: number;
    plannedMealId: string | null;
    plate?: PlateCookRecipe[];
  };
  resume: CookingResume;
  /** What the prompt names: the plate, the dish on screen and where it is. */
  title: string;
  dishTitle: string | null;
  stepNumber: number;
  stepCount: number;
}

/** The planned meals the screen has loaded: their ids, and the days the calendar's listener covers (null before it has). */
export interface LoadedPlannedMeals {
  ids: Set<string>;
  window: { start: number; end: number } | null;
}

/** A planned meal is let go only when it is provably gone: its day is inside the days loaded and it isn't there. One outside them, or of an unknown day, is kept, and Finish writes its cooks without needing the meal. */
export const isPlannedMealGone = (
  plannedMealId: string,
  plannedMealDate: number | null,
  loaded: LoadedPlannedMeals,
) =>
  !loaded.ids.has(plannedMealId) &&
  loaded.window !== null &&
  plannedMealDate !== null &&
  plannedMealDate >= loaded.window.start &&
  plannedMealDate < loaded.window.end;

/** The session as it can be opened now: recipes that are gone, archived or have no steps are dropped (nothing left means nothing to pick up), a planned meal that is gone is let go, and every step and timer is held to what the recipes have. */
export const resolveCookingResume = (
  snapshot: CookingSnapshot,
  recipesById: Map<string, Pick<Recipe, 'title' | 'steps' | 'isArchived'>>,
  planned: LoadedPlannedMeals,
): CookingResumePlan | null => {
  const listed = snapshot.open.plate ?? [
    { recipeId: snapshot.open.recipeId, servings: snapshot.open.servings ?? 0 },
  ];
  const kept = listed.filter((entry) => {
    const recipe = recipesById.get(entry.recipeId);
    return (
      recipe !== undefined &&
      recipe.isArchived !== true &&
      recipe.steps.length > 0
    );
  });
  if (kept.length === 0) return null;

  const stepCounts = new Map(
    kept.map((entry) => [
      entry.recipeId,
      recipesById.get(entry.recipeId)?.steps.length ?? 0,
    ]),
  );
  const first = kept[0];
  const plannedMealId =
    snapshot.open.plannedMealId !== null &&
    !isPlannedMealGone(
      snapshot.open.plannedMealId,
      snapshot.open.plannedMealDate,
      planned,
    )
      ? snapshot.open.plannedMealId
      : null;
  const currentId = stepCounts.has(snapshot.resume.currentId)
    ? snapshot.resume.currentId
    : first.recipeId;
  const positions = Object.fromEntries(
    kept.flatMap((entry) => {
      const position = snapshot.resume.positions[entry.recipeId];
      const count = stepCounts.get(entry.recipeId) ?? 1;
      return position
        ? [
            [
              entry.recipeId,
              {
                stepIndex: Math.min(position.stepIndex, count - 1),
                servings: position.servings,
              },
            ] as const,
          ]
        : [];
    }),
  );
  const timers = snapshot.resume.timers.filter(
    (timer) =>
      timer.recipeId === null ||
      timer.stepNumber <= (stepCounts.get(timer.recipeId) ?? 0),
  );
  const isPlate = kept.length > 1;
  const current = recipesById.get(currentId);
  const title = isPlate
    ? getPlateTitle(
        kept.map((entry) => recipesById.get(entry.recipeId)?.title ?? ''),
      ).title
    : (current?.title ?? '');
  return {
    open: {
      recipeId: first.recipeId,
      ...(isPlate || snapshot.open.plate !== null
        ? { plate: kept }
        : snapshot.open.servings === null
          ? {}
          : { servings: snapshot.open.servings }),
      plannedMealId,
    },
    resume: { currentId, positions, timers },
    title,
    dishTitle: isPlate ? (current?.title ?? null) : null,
    stepNumber: (positions[currentId]?.stepIndex ?? 0) + 1,
    stepCount: stepCounts.get(currentId) ?? 1,
  };
};

/** Every recipe's step and servings from a saved session laid over where a fresh one would start; a step beyond the recipe's last is held to it. */
export const applyResumePositions = <
  T extends { stepIndex: number; servings: number },
>(
  start: Record<string, T>,
  positions: Record<string, { stepIndex: number; servings: number }>,
  stepCounts: Record<string, number>,
) => {
  const result: Record<string, T> = Object.fromEntries(
    Object.entries(start).map(([id, state]) => {
      const saved = positions[id];
      return [
        id,
        saved
          ? {
              ...state,
              stepIndex: Math.max(
                0,
                Math.min(saved.stepIndex, (stepCounts[id] ?? 1) - 1),
              ),
              servings: isValidCookServings(saved.servings)
                ? saved.servings
                : state.servings,
            }
          : state,
      ];
    }),
  );
  return result;
};

const MINUTE_MS = 60_000;

/** The prompt's second line about the timers: one that rang (the first to ring), else the running one ending soonest, else one that is paused, else nothing. */
export const getResumeTimerLine = (
  timers: ResumeTimer[],
  now: number,
  formatClock: (ms: number) => string,
) => {
  const rangAt = timers.flatMap((timer) =>
    timer.status === 'done'
      ? [timer.endedAt]
      : timer.status === 'running' && timer.endsAt <= now
        ? [timer.endsAt]
        : [],
  );
  if (rangAt.length > 0) {
    const minutes = Math.floor((now - Math.min(...rangAt)) / MINUTE_MS);
    return minutes < 1
      ? 'A timer just rang'
      : `A timer rang ${minutes} min ago`;
  }
  const left = timers.flatMap((timer) =>
    timer.status === 'running' ? [timer.endsAt - now] : [],
  );
  if (left.length > 0) return `Timer ${formatClock(Math.min(...left))} left`;
  const paused = timers.flatMap((timer) =>
    timer.status === 'paused' ? [timer.remainingMs] : [],
  );
  if (paused.length > 0) {
    return `Timer paused with ${formatClock(Math.min(...paused))} left`;
  }
  return null;
};

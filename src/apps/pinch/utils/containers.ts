import { formatList } from '@/utils/formatUtils';
import {
  BULK_MEAL_SERVINGS,
  CONTAINER_EAT_SOON_DAYS,
  CONTAINER_FREEZER_DAYS,
  CONTAINER_FRIDGE_DAYS,
  CONTAINER_PLACE_LABELS,
  CONTAINER_SITTING_SERVINGS,
  CONTAINER_THAWED_DAYS,
  MAX_CONTAINER_HISTORY,
  MAX_CONTAINER_NOTE_LENGTH,
  MAX_CONTAINER_SERVINGS,
  MAX_CONTAINER_TITLE_LENGTH,
  MAX_EAT_BY_DATE,
  MIN_EAT_BY_DATE,
  SOFT_MAX_CONTAINERS,
} from '@apps/pinch/constants';
import type {
  Container,
  ContainerEvent,
  ContainerEventKind,
  ContainerPlace,
  Meal,
  MealItem,
  Recipe,
  RecipeCare,
} from '@apps/pinch/types';
import {
  DAY_MS,
  formatDayShort,
  getLocalTodayDate,
  getPlannedDayKey,
} from '@apps/pinch/utils/dayKeys';
import { formatCareDays } from '@apps/pinch/utils/recipeCare';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

export type EatByState = 'PAST' | 'SOON' | 'LATER';

export type ContainerFields = Partial<
  Pick<Container, 'servings' | 'status' | 'place' | 'eatBy'>
> &
  Pick<Container, 'history' | 'updatedAt'>;

export type ContainerPlan = { fields: ContainerFields } | { error: string };

export interface StockSummary {
  fridge: number;
  freezer: number;
  containers: number;
  nearestEatBy: number | null;
}

export type EatByMove = 'FRIDGE' | 'FREEZER' | 'THAW';

export interface EatByDefault {
  eatBy: number;
  days: number;
  isFromRecipe: boolean;
}

export const isValidContainerServings = (servings: number) =>
  Number.isInteger(servings) &&
  servings >= 1 &&
  servings <= MAX_CONTAINER_SERVINGS;

export const isValidEatBy = (eatBy: number) =>
  Number.isInteger(eatBy) &&
  eatBy % DAY_MS === 0 &&
  eatBy >= MIN_EAT_BY_DATE &&
  eatBy <= MAX_EAT_BY_DATE;

export const isContainerListFull = (inStockCount: number) =>
  inStockCount >= SOFT_MAX_CONTAINERS;

export const getDaysLeft = (eatBy: number, now = Date.now()) =>
  Math.round((eatBy - getLocalTodayDate(now)) / DAY_MS);

export const getEatByState = (eatBy: number, now = Date.now()): EatByState => {
  const days = getDaysLeft(eatBy, now);
  if (days < 0) return 'PAST';
  return days <= CONTAINER_EAT_SOON_DAYS ? 'SOON' : 'LATER';
};

export const getEatByPhrase = (eatBy: number, now = Date.now()) => {
  const days = getDaysLeft(eatBy, now);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return formatDayShort(getPlannedDayKey(eatBy), now);
};

export const getEatByDefault = (
  move: EatByMove,
  care: RecipeCare | null,
  now = Date.now(),
): EatByDefault => {
  const recipeDays =
    (move === 'FREEZER' ? care?.freezerDays : care?.fridgeDays) ?? null;
  const getDays = () => {
    if (move === 'THAW') {
      return Math.min(
        CONTAINER_THAWED_DAYS,
        recipeDays ?? CONTAINER_THAWED_DAYS,
      );
    }
    return (
      recipeDays ??
      (move === 'FREEZER' ? CONTAINER_FREEZER_DAYS : CONTAINER_FRIDGE_DAYS)
    );
  };
  const days = getDays();
  const result = {
    eatBy: getLocalTodayDate(now) + days * DAY_MS,
    days,
    isFromRecipe:
      recipeDays !== null &&
      (move !== 'THAW' || recipeDays < CONTAINER_THAWED_DAYS),
  };

  return result;
};

export const getEatByHint = (move: EatByMove, preset: EatByDefault) => {
  if (preset.isFromRecipe) {
    return `Your call. Taken from the ${move === 'FREEZER' ? 'freezer' : 'fridge'} time in your recipe.`;
  }
  if (move === 'THAW') {
    return `Your call. Once thawed, this starts at ${formatCareDays(preset.days)}.`;
  }
  return `Your call. A starting point of ${formatCareDays(preset.days)}; change it to what you trust.`;
};

export const getMoveForPlace = (
  place: ContainerPlace,
  from: ContainerPlace | null,
): EatByMove => {
  if (place === 'FREEZER') return 'FREEZER';
  return from === 'FREEZER' ? 'THAW' : 'FRIDGE';
};

export const isBulkMeal = (input: {
  servings: number;
  care: RecipeCare | null;
  hasStock: boolean;
}) =>
  input.servings >= BULK_MEAL_SERVINGS ||
  input.care?.freezerDays != null ||
  input.hasStock;

export const getPutAwayServings = (
  servings: number,
  eatenTonight: number | null,
) => {
  const left = Math.floor(
    servings - (eatenTonight ?? CONTAINER_SITTING_SERVINGS),
  );
  return Math.min(MAX_CONTAINER_SERVINGS, Math.max(1, left));
};

const getDroppedIndex = (history: ContainerEvent[]) => {
  const oldestOf = (kind: ContainerEventKind) =>
    history.findIndex(
      (event, index) =>
        index > 0 && index < history.length - 1 && event.kind === kind,
    );
  return (
    ['EAT' as const, 'EDIT' as const]
      .map(oldestOf)
      .find((index) => index !== -1) ?? 1
  );
};

/** Past the cap the oldest EAT goes first, then the oldest EDIT: the place events are what the freeze count and the thaw line read. */
export const appendEvent = (
  history: ContainerEvent[],
  event: ContainerEvent,
): ContainerEvent[] => {
  const next = [...history, event];
  if (next.length <= MAX_CONTAINER_HISTORY) return next;

  const dropped = getDroppedIndex(next);
  return next.filter((_, index) => index !== dropped);
};

export const makeEvent = (
  kind: ContainerEventKind,
  at: number,
  details: {
    servings?: number | null;
    place?: ContainerPlace | null;
    note?: string | null;
  } = {},
): ContainerEvent => ({
  kind,
  at,
  servings: details.servings ?? null,
  place: details.place ?? null,
  note: details.note?.slice(0, MAX_CONTAINER_NOTE_LENGTH) ?? null,
});

const getPlaceEvent = (
  place: ContainerPlace,
  at: number,
  servings: number,
  isThaw = false,
) =>
  makeEvent(place === 'FREEZER' ? 'FREEZE' : isThaw ? 'THAW' : 'FRIDGE', at, {
    servings,
    place,
  });

export interface NewContainerInput {
  id: string;
  title: string;
  recipeId: string | null;
  mealId: string | null;
  cookId: string | null;
  servings: number;
  place: ContainerPlace;
  eatBy: number;
}

export const buildContainer = (
  input: NewContainerInput,
  now: number,
): Container => ({
  ...input,
  title: input.title.trim().slice(0, MAX_CONTAINER_TITLE_LENGTH),
  status: 'IN_STOCK',
  history: [
    ...(input.cookId === null
      ? []
      : [makeEvent('MADE', now, { servings: input.servings })]),
    getPlaceEvent(input.place, now, input.servings),
  ],
  createdAt: now,
  updatedAt: now,
});

export const getNewContainerProblem = (
  input: Omit<NewContainerInput, 'id'>,
  inStockCount: number,
) => {
  if (input.title.trim() === '') return 'Name what you are putting away.';
  if (input.recipeId !== null && input.mealId !== null) {
    return 'Pick a recipe or a meal, not both.';
  }
  if (!isValidContainerServings(input.servings)) {
    return `Pick a number of servings from 1 to ${MAX_CONTAINER_SERVINGS}.`;
  }
  if (!isValidEatBy(input.eatBy)) return 'Pick a day to eat it by.';
  if (isContainerListFull(inStockCount)) {
    return `You have ${SOFT_MAX_CONTAINERS} containers in stock. Finish or delete one to add more.`;
  }
  return null;
};

const FINISHED = 'This one is already finished.';

export const planEat = (
  container: Container,
  count: number | 'ALL',
  now: number,
): ContainerPlan => {
  if (container.status !== 'IN_STOCK') return { error: FINISHED };

  const eaten = count === 'ALL' ? container.servings : count;
  if (!isValidContainerServings(eaten)) {
    return { error: 'Pick how many you ate.' };
  }
  if (eaten > container.servings) {
    return {
      error: `Only ${formatServings(container.servings)} ${container.servings === 1 ? 'is' : 'are'} left, so nothing was changed.`,
    };
  }

  const history = appendEvent(
    container.history,
    makeEvent('EAT', now, { servings: eaten }),
  );
  const isLast = eaten === container.servings;

  return {
    fields: isLast
      ? { status: 'DONE', history, updatedAt: now }
      : { servings: container.servings - eaten, history, updatedAt: now },
  };
};

export const planToss = (container: Container, now: number): ContainerPlan =>
  container.status !== 'IN_STOCK'
    ? { error: FINISHED }
    : {
        fields: {
          status: 'DONE',
          history: appendEvent(
            container.history,
            makeEvent('TOSS', now, { servings: container.servings }),
          ),
          updatedAt: now,
        },
      };

export const planMove = (
  container: Container,
  to: ContainerPlace,
  eatBy: number,
  now: number,
): ContainerPlan => {
  if (container.status !== 'IN_STOCK') return { error: FINISHED };
  if (container.place === to) {
    return {
      error: `It is already in the ${CONTAINER_PLACE_LABELS[to].toLowerCase()}, so nothing was changed.`,
    };
  }
  if (!isValidEatBy(eatBy)) return { error: 'Pick a day to eat it by.' };

  return {
    fields: {
      place: to,
      eatBy,
      history: appendEvent(
        container.history,
        getPlaceEvent(
          to,
          now,
          container.servings,
          container.place === 'FREEZER',
        ),
      ),
      updatedAt: now,
    },
  };
};

export const planEatBy = (
  container: Container,
  eatBy: number,
  now: number,
): ContainerPlan => {
  if (container.status !== 'IN_STOCK') return { error: FINISHED };
  if (!isValidEatBy(eatBy)) return { error: 'Pick a day to eat it by.' };
  if (eatBy === container.eatBy) {
    return { error: 'That is already the eat-by date.' };
  }

  const getDay = (date: number) => formatDayShort(getPlannedDayKey(date), now);

  return {
    fields: {
      eatBy,
      history: appendEvent(
        container.history,
        makeEvent('EDIT', now, {
          note: `Eat by ${getDay(container.eatBy)} → ${getDay(eatBy)}`,
        }),
      ),
      updatedAt: now,
    },
  };
};

/** Only while the EAT or TOSS is still the last event, so a later change is never rewound. */
export const planUndoEnd = (
  container: Container,
  at: number,
  now: number,
): ContainerPlan => {
  const last = container.history.at(-1);
  if (
    !last ||
    last.at !== at ||
    (last.kind !== 'EAT' && last.kind !== 'TOSS') ||
    last.servings === null
  ) {
    return { error: 'That has changed since, so it could not be undone.' };
  }

  const servings =
    container.status === 'DONE'
      ? last.servings
      : container.servings + last.servings;
  if (!isValidContainerServings(servings)) {
    return { error: 'That has changed since, so it could not be undone.' };
  }

  return {
    fields: {
      servings,
      status: 'IN_STOCK',
      history: container.history.slice(0, -1),
      updatedAt: now,
    },
  };
};

export const getLastPlaceEvent = (history: ContainerEvent[]) =>
  history.filter((event) => event.place !== null).at(-1);

export const getFreezeCount = (history: ContainerEvent[]) =>
  history.filter((event) => event.kind === 'FREEZE').length;

export const getFreezeLine = (history: ContainerEvent[]) => {
  const count = getFreezeCount(history);
  if (count < 2) return null;
  return count === 2 ? 'Frozen twice' : `Frozen ${count} times`;
};

export const getEventText = (event: ContainerEvent) => {
  const amount = event.servings === null ? '' : formatServings(event.servings);
  switch (event.kind) {
    case 'MADE':
      return amount === '' ? 'Made' : `Made ${amount}`;
    case 'FRIDGE':
      return amount === ''
        ? 'Put in the fridge'
        : `Put in the fridge · ${amount}`;
    case 'FREEZE':
      return amount === ''
        ? 'Put in the freezer'
        : `Put in the freezer · ${amount}`;
    case 'THAW':
      return amount === ''
        ? 'Thawed in the fridge'
        : `Thawed in the fridge · ${amount}`;
    case 'EAT':
      return amount === '' ? 'Ate some' : `Ate ${amount}`;
    case 'TOSS':
      return amount === '' ? 'Threw it out' : `Threw out ${amount}`;
    default:
      return event.note ?? 'Changed';
  }
};

export const getEndText = (container: Container) => {
  const last = container.history.at(-1);
  return last?.kind === 'TOSS' ? 'Threw it out' : 'Ate it all';
};

/** The first event always carries the portions. */
export const getStartServings = (container: Container) =>
  container.history[0]?.servings ?? null;

export const byEatBy = (a: Container, b: Container) =>
  a.eatBy - b.eatBy || a.createdAt - b.createdAt || a.id.localeCompare(b.id);

export const getStockMaps = (containers: Container[]) =>
  containers.reduce(
    (maps, container) => {
      if (container.status !== 'IN_STOCK') return maps;

      const map =
        container.recipeId !== null
          ? maps.byRecipe
          : container.mealId !== null
            ? maps.byMeal
            : null;
      const key = container.recipeId ?? container.mealId;
      if (map === null || key === null) return maps;

      const known = map.get(key);
      map.set(key, {
        fridge:
          (known?.fridge ?? 0) +
          (container.place === 'FRIDGE' ? container.servings : 0),
        freezer:
          (known?.freezer ?? 0) +
          (container.place === 'FREEZER' ? container.servings : 0),
        containers: (known?.containers ?? 0) + 1,
        nearestEatBy: Math.min(
          known?.nearestEatBy ?? Infinity,
          container.eatBy,
        ),
      });
      return maps;
    },
    {
      byRecipe: new Map<string, StockSummary>(),
      byMeal: new Map<string, StockSummary>(),
    },
  );

export const hasStockIn = (
  summary: StockSummary | undefined,
  place: ContainerPlace,
) =>
  summary !== undefined &&
  (place === 'FRIDGE' ? summary.fridge : summary.freezer) > 0;

export const getStockParts = (summary: StockSummary) =>
  [
    summary.fridge > 0 && {
      place: 'FRIDGE' as const,
      servings: summary.fridge,
    },
    summary.freezer > 0 && {
      place: 'FREEZER' as const,
      servings: summary.freezer,
    },
  ].filter((part) => part !== false);

export const getStockDueText = (summary: StockSummary, now = Date.now()) => {
  if (summary.nearestEatBy === null) return null;

  const state = getEatByState(summary.nearestEatBy, now);
  if (state === 'LATER') return null;
  return state === 'PAST'
    ? 'past its date'
    : `eat by ${getEatByPhrase(summary.nearestEatBy, now)}`;
};

export interface PreparedSummary {
  fridgeServings: number;
  freezerServings: number;
  containerCount: number;
  soonCount: number;
  pastCount: number;
}

export const getPreparedSummary = (
  containers: Container[],
  now = Date.now(),
): PreparedSummary =>
  containers.reduce<PreparedSummary>(
    (summary, container) => {
      if (container.status !== 'IN_STOCK') return summary;

      const state = getEatByState(container.eatBy, now);
      return {
        fridgeServings:
          summary.fridgeServings +
          (container.place === 'FRIDGE' ? container.servings : 0),
        freezerServings:
          summary.freezerServings +
          (container.place === 'FREEZER' ? container.servings : 0),
        containerCount: summary.containerCount + 1,
        soonCount: summary.soonCount + (state === 'SOON' ? 1 : 0),
        pastCount: summary.pastCount + (state === 'PAST' ? 1 : 0),
      };
    },
    {
      fridgeServings: 0,
      freezerServings: 0,
      containerCount: 0,
      soonCount: 0,
      pastCount: 0,
    },
  );

export const getPlacesText = (summary: {
  fridgeServings: number;
  freezerServings: number;
}) => {
  const parts = [
    summary.fridgeServings > 0 && {
      amount: summary.fridgeServings,
      where: 'the fridge',
    },
    summary.freezerServings > 0 && {
      amount: summary.freezerServings,
      where: 'the freezer',
    },
  ].filter((part) => part !== false);

  return parts
    .map((part, index) =>
      index === 0
        ? `${formatServings(part.amount)} in ${part.where}`
        : `${part.amount} in ${part.where}`,
    )
    .join(', ');
};

export const getDueText = (soonCount: number, pastCount: number) =>
  [
    soonCount > 0 && `${soonCount} to eat soon`,
    pastCount > 0 &&
      `${pastCount} past ${pastCount === 1 ? 'its' : 'their'} date`,
  ]
    .filter((part) => part !== false)
    .join(', ');

export const getPutAwayText = (containers: Container[]) => {
  const total = containers.reduce(
    (sum, container) => sum + (getStartServings(container) ?? 0),
    0,
  );
  return total > 0 ? `Put away ${formatServings(total)}` : null;
};

export const getSavedText = (
  container: Pick<Container, 'servings' | 'place' | 'eatBy'>,
  now = Date.now(),
) =>
  `Saved ${formatServings(container.servings)} in the ${CONTAINER_PLACE_LABELS[container.place].toLowerCase()}, eat by ${getEatByPhrase(container.eatBy, now)}`;

export const getContainerTitle = (
  container: Container,
  recipesById: Map<string, Recipe>,
  mealsById: Map<string, Meal>,
) =>
  (container.recipeId === null
    ? undefined
    : recipesById.get(container.recipeId)?.title) ??
  (container.mealId === null
    ? undefined
    : mealsById.get(container.mealId)?.name) ??
  container.title;

export const getStockPlaceCounts = (
  ids: string[],
  stock: Map<string, StockSummary>,
): Record<ContainerPlace, number> =>
  ids.reduce(
    (counts, id) => {
      const summary = stock.get(id);
      return {
        FRIDGE: counts.FRIDGE + (hasStockIn(summary, 'FRIDGE') ? 1 : 0),
        FREEZER: counts.FREEZER + (hasStockIn(summary, 'FREEZER') ? 1 : 0),
      };
    },
    { FRIDGE: 0, FREEZER: 0 },
  );

export const getStockTitle = (summary: StockSummary) =>
  summary.fridge > 0 && summary.freezer > 0
    ? 'In your fridge and freezer'
    : `In your ${summary.fridge > 0 ? 'fridge' : 'freezer'}`;

export const getStockDetail = (summary: StockSummary, now = Date.now()) => {
  const places =
    summary.fridge > 0 && summary.freezer > 0
      ? getPlacesText({
          fridgeServings: summary.fridge,
          freezerServings: summary.freezer,
        })
      : formatServings(summary.fridge + summary.freezer);
  const nearest =
    summary.nearestEatBy === null
      ? null
      : `eat by ${getEatByPhrase(summary.nearestEatBy, now)}`;

  return [places, nearest].filter((part) => part !== null).join(', ');
};

export const getServingsToEat = (
  container: Container,
  meal: { items: MealItem[] },
) => {
  const planned =
    container.recipeId === null
      ? 1
      : meal.items
          .filter(
            (item) =>
              item.kind === 'RECIPE' && item.refId === container.recipeId,
          )
          .reduce((sum, item) => sum + item.servings, 0);

  return Math.min(container.servings, Math.max(1, Math.round(planned)));
};

export interface StockedItem {
  name: string;
  summary: StockSummary;
}

/** Informational only: the app never subtracts stock from the list. */
export const getShoppingStockLine = (
  stocked: StockedItem[],
  isNamed: boolean,
) => {
  if (stocked.length === 0) return null;
  if (stocked.length > 1) {
    return `You already have prepared servings of ${formatList(stocked.map((entry) => entry.name))}.`;
  }

  const [{ name, summary }] = stocked;
  const places = [
    summary.fridge > 0 && `${summary.fridge} in the fridge`,
    summary.freezer > 0 && `${summary.freezer} in the freezer`,
  ].filter((part) => part !== false);
  const head = `${formatServings(summary.fridge + summary.freezer)}${isNamed ? ` of ${name}` : ''}`;
  const quantity =
    places.length === 1
      ? `${head} in the ${summary.fridge > 0 ? 'fridge' : 'freezer'}`
      : `${head} (${places.join(' and ')})`;

  return `You already have ${quantity}.`;
};

export const groupContainersByCook = (containers: Container[]) =>
  containers.reduce((byCook, container) => {
    if (container.cookId !== null) {
      byCook.set(container.cookId, [
        ...(byCook.get(container.cookId) ?? []),
        container,
      ]);
    }
    return byCook;
  }, new Map<string, Container[]>());

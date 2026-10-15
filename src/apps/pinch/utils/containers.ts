import { toLocalDateInputValue } from '@/utils/dateInputUtils';
import { formatList } from '@/utils/formatUtils';
import {
  BULK_MEAL_SERVINGS,
  CONTAINER_EAT_SOON_DAYS,
  CONTAINER_FREEZER_DATE_DAYS,
  CONTAINER_FREEZER_DAYS,
  CONTAINER_FRIDGE_DAYS,
  CONTAINER_PLACE_LABELS,
  CONTAINER_SITTING_SERVINGS,
  CONTAINER_THAWED_DAYS,
  MAX_CONTAINERS_PER_PUT_AWAY,
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
  fridgeEatBy: number | null;
  freezerEatBy: number | null;
}

export interface StockSource {
  kind: 'recipe' | 'meal';
  id: string;
  servings: number;
}

export interface MealStock extends StockSummary {
  sources: StockSource[];
}

export type EatByMove = 'FRIDGE' | 'FREEZER' | 'THAW';

export interface EatByDefault {
  eatBy: number;
  days: number;
  isFromRecipe: boolean;
  isKept: boolean;
  wasPast: boolean;
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

export const isContainerListFull = (inStockCount: number, adding = 1) =>
  inStockCount + adding > SOFT_MAX_CONTAINERS;

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

/** The one eat-by item a row shows: tinted when it is due, plain otherwise. */
export const getEatByLabel = (eatBy: number, now = Date.now()) => {
  const days = getDaysLeft(eatBy, now);
  if (days < 0) return 'Past its date';
  if (days === 0) return 'Eat today';
  const label = `Eat by ${getEatByPhrase(eatBy, now)}`;
  return label;
};

/** When it last went into the freezer, which is what a freezer row leads with. */
export const getFrozenAt = (
  container: Pick<Container, 'history' | 'createdAt'>,
) =>
  container.history.filter((event) => event.kind === 'FREEZE').at(-1)?.at ??
  container.createdAt;

/** "Frozen Oct 5", the frozen instant's local day through the cached day formatters. */
export const getFrozenText = (
  container: Pick<Container, 'history' | 'createdAt'>,
  now = Date.now(),
) =>
  `Frozen ${formatDayShort(toLocalDateInputValue(getFrozenAt(container)), now)}`;

/** A fridge row always names its eat-by; a freezer row only once it is past or within a week. */
export const isEatByShown = (
  container: Pick<Container, 'place' | 'eatBy'>,
  now = Date.now(),
) =>
  container.place === 'FRIDGE' ||
  getDaysLeft(container.eatBy, now) <= CONTAINER_FREEZER_DATE_DAYS;

export const getEatByDefault = (
  move: EatByMove,
  care: RecipeCare | null,
  now = Date.now(),
  currentEatBy: number | null = null,
): EatByDefault => {
  const today = getLocalTodayDate(now);
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
  const fresh = today + days * DAY_MS;
  const wasPast = currentEatBy !== null && currentEatBy < today;
  const getEatBy = () => {
    if (currentEatBy === null) return fresh;
    if (wasPast) return currentEatBy;
    return move === 'THAW' ? Math.min(currentEatBy, fresh) : fresh;
  };
  const eatBy = getEatBy();
  const isKept = eatBy !== fresh;

  const result = {
    eatBy,
    days: Math.round((eatBy - today) / DAY_MS),
    isFromRecipe:
      !isKept &&
      recipeDays !== null &&
      (move !== 'THAW' || recipeDays < CONTAINER_THAWED_DAYS),
    isKept,
    wasPast,
  };

  return result;
};

export const getEatByHint = (move: EatByMove, preset: EatByDefault) => {
  if (preset.wasPast) return 'Your call. The date stays as it was.';
  if (preset.isKept) {
    return 'Your call. It already had an earlier date, so that stays.';
  }
  if (preset.isFromRecipe) {
    return `Your call. Taken from the ${move === 'FREEZER' ? 'freezer' : 'fridge'} time in your recipe.`;
  }
  if (move === 'THAW') {
    return `Your call. Once thawed, this starts at ${formatCareDays(preset.days)}.`;
  }
  return `Your call. A starting point of ${formatCareDays(preset.days)}; change it to what you trust.`;
};

/** Quiet facts about a move, in plain words and with no claim about safety. */
export const getMoveNotes = (
  container: Pick<Container, 'history'>,
  move: EatByMove,
  preset: EatByDefault,
) => {
  const frozen = getFreezeCount(container.history);
  const frozenText =
    frozen === 1 ? 'once' : frozen === 2 ? 'twice' : `${frozen} times`;
  return [
    preset.wasPast && 'It was past its date before it was moved.',
    move === 'FREEZER' &&
      frozen > 0 &&
      `It's been frozen ${frozenText} before.`,
  ].filter((note) => note !== false);
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

export const getPutAwayServings = (left: number) =>
  Math.min(MAX_CONTAINER_SERVINGS, Math.max(1, Math.floor(left)));

/** How the default is worked out, so it never looks like a guess: "6 left after the 2 you're eating tonight". */
export const getPutAwayBasis = (input: {
  made: number;
  eatenTonight: number | null;
  saved: number;
}) => {
  const left = Math.max(
    0,
    Math.floor(
      input.made -
        (input.eatenTonight ?? CONTAINER_SITTING_SERVINGS) -
        input.saved,
    ),
  );
  const parts = [
    input.eatenTonight === null
      ? `about ${CONTAINER_SITTING_SERVINGS} for tonight`
      : `the ${input.eatenTonight} you're eating tonight`,
    input.saved > 0 && `the ${input.saved} already put away`,
  ].filter((part) => part !== false);

  return `${left > 0 ? left : 'Nothing'} left after ${parts.join(' and ')}`;
};

const getDroppedIndex = (history: ContainerEvent[]) => {
  const firstPlace = Math.max(
    0,
    history.findIndex((event) => event.place !== null),
  );
  const oldestAfter = (
    start: number,
    matches: (event: ContainerEvent) => boolean,
  ) =>
    history.findIndex(
      (event, index) =>
        index > start && index < history.length - 1 && matches(event),
    );
  return (
    [
      oldestAfter(0, (event) => event.kind === 'EAT'),
      oldestAfter(0, (event) => event.kind === 'EDIT'),
      oldestAfter(firstPlace, (event) => event.kind !== 'FREEZE'),
    ].find((index) => index !== -1) ?? firstPlace + 1
  );
};

/** Past the cap the oldest EAT goes first, then the oldest EDIT, then the oldest move after the first place event that isn't a FREEZE: how many went in, the freeze count and where it is now stay readable. */
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
  /** What the cook made; null for a container added by hand, which starts with where it went. */
  madeServings: number | null;
  servings: number;
  place: ContainerPlace;
  eatBy: number;
}

export const buildContainer = (
  { madeServings, ...input }: NewContainerInput,
  now: number,
): Container => ({
  ...input,
  title: input.title.trim().slice(0, MAX_CONTAINER_TITLE_LENGTH),
  status: 'IN_STOCK',
  history: [
    ...(madeServings === null
      ? []
      : [
          makeEvent('MADE', now, {
            servings: Math.min(
              MAX_CONTAINER_SERVINGS,
              Math.max(1, Math.round(madeServings)),
            ),
          }),
        ]),
    getPlaceEvent(input.place, now, input.servings),
  ],
  createdAt: now,
  updatedAt: now,
});

/** `total` split into `count` containers, the extra servings going one each to the first. */
export const splitServings = (total: number, count: number) =>
  Array.from(
    { length: count },
    (_, index) => Math.floor(total / count) + (index < total % count ? 1 : 0),
  );

export const getContainerCountMax = (servings: number) =>
  Math.min(MAX_CONTAINERS_PER_PUT_AWAY, Math.max(1, Math.floor(servings)));

export const getSplitText = (total: number, count: number) => {
  if (count <= 1) return null;

  const parts = splitServings(total, count);
  const big = parts[0];
  const small = parts[parts.length - 1];
  if (big === small) return `${formatServings(big)} in each`;

  const bigCount = parts.filter((part) => part === big).length;
  const smallCount = count - bigCount;
  return `${formatServings(big)} in ${bigCount === 1 ? 'the first' : `each of the first ${bigCount}`}, ${small} in ${smallCount === 1 ? 'the other' : 'each of the others'}`;
};

export const getNewContainerProblem = (
  input: Omit<NewContainerInput, 'id'>,
  inStockCount: number,
  adding = 1,
) => {
  if (input.title.trim() === '') return 'Name what you are putting away.';
  if (input.recipeId !== null && input.mealId !== null) {
    return 'Pick a recipe or a meal, not both.';
  }
  if (!isValidContainerServings(input.servings)) {
    return `Pick a number of servings from 1 to ${MAX_CONTAINER_SERVINGS}.`;
  }
  if (!isValidEatBy(input.eatBy)) return 'Pick a day to eat it by.';
  if (isContainerListFull(inStockCount, adding)) {
    return inStockCount >= SOFT_MAX_CONTAINERS
      ? `You have ${SOFT_MAX_CONTAINERS} boxes in your fridge and freezer. Finish or delete one to add more.`
      : `That would pass the ${SOFT_MAX_CONTAINERS} boxes you can keep in your fridge and freezer. Finish or delete some first.`;
  }
  return null;
};

export const getNewContainersProblem = (
  inputs: Omit<NewContainerInput, 'id'>[],
  inStockCount: number,
) =>
  inputs
    .map((input) => getNewContainerProblem(input, inStockCount, inputs.length))
    .find((problem) => problem !== null) ?? null;

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

export const planClear = (container: Container, now: number): ContainerPlan =>
  container.status !== 'IN_STOCK'
    ? { error: FINISHED }
    : {
        fields: {
          status: 'DONE',
          history: appendEvent(
            container.history,
            makeEvent('CLEAR', now, { servings: container.servings }),
          ),
          updatedAt: now,
        },
      };

/** What a clear-out of one place still writes: a container that is gone, finished or in the other place since the tap is left as it is. */
export const planClearOut = (
  containers: (Container | null)[],
  place: ContainerPlace,
  now: number,
) =>
  containers.flatMap((container) => {
    if (container === null || container.place !== place) return [];

    const plan = planClear(container, now);
    return 'fields' in plan ? [{ id: container.id, fields: plan.fields }] : [];
  });

const countContainers = (count: number) =>
  `${count} ${count === 1 ? 'box' : 'boxes'}`;

export const getClearOutMessage = (
  count: number,
  servings: number,
  place: ContainerPlace,
) =>
  `This takes ${countContainers(count)} (${formatServings(servings)}) out of the ${CONTAINER_PLACE_LABELS[place].toLowerCase()} and keeps ${count === 1 ? 'it' : 'them'} in What you finished as cleared out. You can undo it right after.`;

export const getPutBackText = (restored: number, total: number) =>
  restored === total
    ? `Put ${countContainers(restored)} back`
    : `Put back ${restored} of ${total}; the rest changed since`;

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

export const planCount = (
  container: Container,
  count: number,
  now: number,
): ContainerPlan => {
  if (container.status !== 'IN_STOCK') return { error: FINISHED };
  if (!isValidContainerServings(count)) {
    return { error: `Pick a count from 1 to ${MAX_CONTAINER_SERVINGS}.` };
  }
  if (count === container.servings) {
    return { error: 'That is already the count.' };
  }

  return {
    fields: {
      servings: count,
      history: appendEvent(
        container.history,
        makeEvent('EDIT', now, {
          note: `Count ${container.servings} → ${count}`,
        }),
      ),
      updatedAt: now,
    },
  };
};

export type CountChange =
  | { kind: 'SAME' }
  | { kind: 'EAT'; eaten: number }
  | { kind: 'ALL' }
  | { kind: 'COUNT'; count: number };

/** What answering "How many are left?" records: fewer is eaten, none eats the rest, more corrects the count. */
export const getCountChange = (current: number, next: number): CountChange => {
  if (next === current) return { kind: 'SAME' };
  if (next <= 0) return { kind: 'ALL' };
  const change: CountChange =
    next < current
      ? { kind: 'EAT', eaten: current - next }
      : { kind: 'COUNT', count: next };
  return change;
};

export const getCountChangeCopy = (current: number, next: number) => {
  const change = getCountChange(current, next);
  switch (change.kind) {
    case 'SAME':
      return {
        change,
        line: `It says ${formatServings(current)} now.`,
        action: 'Save',
      };
    case 'EAT':
      return {
        change,
        line: `Records that you ate ${change.eaten}.`,
        action: `Ate ${change.eaten}`,
      };
    case 'ALL':
      return {
        change,
        line: 'Records that you ate the rest. It moves to What you finished.',
        action: 'Ate the rest',
      };
    default:
      return {
        change,
        line: `Corrects the count from ${current} to ${change.count}.`,
        action: 'Save',
      };
  }
};

/** "How many boxes are left?" for a batch: only fewer, each box gone eaten whole. */
export const getBoxCountCopy = (current: number, next: number) => {
  const eaten = Math.max(0, current - next);
  if (eaten === 0) {
    return {
      eaten,
      line: `It says ${countContainers(current)} now.`,
      action: 'Save',
    };
  }
  if (next <= 0) {
    return {
      eaten,
      line: 'Records that you ate them all. They move to What you finished.',
      action: 'Ate them all',
    };
  }
  const copy = {
    eaten,
    line: `Records that you ate ${countContainers(eaten)}.`,
    action: `Ate ${countContainers(eaten)}`,
  };
  return copy;
};

const END_KINDS: ContainerEventKind[] = ['EAT', 'TOSS', 'CLEAR'];

/** A finished box can go back in as it was while the eat, toss or clear-out that ended it is still its last event, long after the toast's Undo is gone. */
export const canPutBack = (
  container: Pick<Container, 'status' | 'history'>,
) => {
  const last = container.history.at(-1);
  const result =
    container.status === 'DONE' &&
    last !== undefined &&
    END_KINDS.includes(last.kind) &&
    last.servings !== null;
  return result;
};

/** Only while the EAT, TOSS or CLEAR is still the last event, so a later change is never rewound. */
export const planUndoEnd = (
  container: Container,
  at: number,
  now: number,
): ContainerPlan => {
  const last = container.history.at(-1);
  if (
    !last ||
    last.at !== at ||
    !END_KINDS.includes(last.kind) ||
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
      return amount === '' ? 'Tossed' : `Tossed ${amount}`;
    case 'CLEAR':
      return amount === '' ? 'Cleared out' : `Cleared out · ${amount}`;
    default:
      return event.note ?? 'Changed';
  }
};

/** The first place event says how many went in; a cook's MADE before it counts what the cook made. */
export const getStartServings = (container: Container) =>
  container.history.find((event) => event.place !== null)?.servings ?? null;

/** Counts what was eaten from the history, so a corrected count reads true; a history that may have been trimmed past the cap names no number it can't vouch for. */
export const getFinishedText = (container: Container) => {
  const last = container.history.at(-1);
  const isWhole =
    getStartServings(container) !== null &&
    container.history.length < MAX_CONTAINER_HISTORY;
  const eaten = container.history
    .filter((event) => event.kind === 'EAT')
    .reduce((sum, event) => sum + (event.servings ?? 0), 0);
  if (last?.kind === 'TOSS' || last?.kind === 'CLEAR') {
    const verb = last.kind === 'TOSS' ? 'Tossed' : 'Cleared out';
    const ended = last.servings ?? container.servings;
    return isWhole && eaten > 0
      ? `${verb} ${ended} of ${ended + eaten}`
      : `${verb} ${formatServings(ended)}`;
  }
  return isWhole && eaten > 0 ? `Ate ${formatServings(eaten)}` : 'Ate it all';
};

export const byEatBy = (a: Container, b: Container) =>
  a.eatBy - b.eatBy || a.createdAt - b.createdAt || a.id.localeCompare(b.id);

/** Boxes put away together share a moment, a place, an eat-by date and a dish; a box moved or re-dated alone leaves its batch. */
export const getBatchKey = (
  container: Pick<
    Container,
    'createdAt' | 'place' | 'eatBy' | 'recipeId' | 'mealId' | 'title'
  >,
) =>
  [
    container.createdAt,
    container.place,
    container.eatBy,
    container.recipeId,
    container.mealId,
    container.title,
  ].join('|');

/** The box an action on a batch takes first: an opened one (fewer servings) before a full one. */
const byTakeOrder = (a: Container, b: Container) =>
  a.servings - b.servings || a.id.localeCompare(b.id);

export interface ContainerBatch {
  key: string;
  boxes: Container[];
}

/** One row per batch, in the order of each batch's first box, each batch's boxes in the order actions take them. */
export const groupBatches = (containers: Container[]): ContainerBatch[] => {
  const byKey = containers.reduce((groups, container) => {
    const key = getBatchKey(container);
    return groups.set(key, [...(groups.get(key) ?? []), container]);
  }, new Map<string, Container[]>());
  const batches = Array.from(byKey, ([key, boxes]) => ({
    key,
    boxes: boxes.length > 1 ? [...boxes].sort(byTakeOrder) : boxes,
  }));
  return batches;
};

/** "2 servings" for one box, "3 boxes of 2 servings" for a batch, "3 boxes · 7 servings" when they differ. */
export const getBatchServingsText = (boxes: Pick<Container, 'servings'>[]) => {
  const [first] = boxes;
  if (boxes.length === 1) return formatServings(first.servings);

  const total = boxes.reduce((sum, box) => sum + box.servings, 0);
  const isEven = boxes.every((box) => box.servings === first.servings);
  const text = isEven
    ? `${boxes.length} boxes of ${formatServings(first.servings)}`
    : `${boxes.length} boxes · ${formatServings(total)}`;
  return text;
};

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
      const isFridge = container.place === 'FRIDGE';
      map.set(key, {
        fridge: (known?.fridge ?? 0) + (isFridge ? container.servings : 0),
        freezer: (known?.freezer ?? 0) + (isFridge ? 0 : container.servings),
        containers: (known?.containers ?? 0) + 1,
        nearestEatBy: Math.min(
          known?.nearestEatBy ?? Infinity,
          container.eatBy,
        ),
        fridgeEatBy: isFridge
          ? Math.min(known?.fridgeEatBy ?? Infinity, container.eatBy)
          : (known?.fridgeEatBy ?? null),
        freezerEatBy: isFridge
          ? (known?.freezerEatBy ?? null)
          : Math.min(known?.freezerEatBy ?? Infinity, container.eatBy),
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

export const getStockParts = (summary: StockSummary, now = Date.now()) =>
  (['FRIDGE', 'FREEZER'] as const).flatMap((place) => {
    const servings = place === 'FRIDGE' ? summary.fridge : summary.freezer;
    if (servings <= 0) return [];

    const eatBy =
      place === 'FRIDGE' ? summary.fridgeEatBy : summary.freezerEatBy;
    const state = eatBy === null ? 'LATER' : getEatByState(eatBy, now);
    const due =
      eatBy === null || state === 'LATER'
        ? null
        : { state, label: getEatByLabel(eatBy, now) };
    return [{ place, servings, due }];
  });

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
    soonCount > 0 && `${soonCount} to eat by tomorrow`,
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

/** What one put-away wrote and where, without its date. */
export const getSavedHeadline = (
  batch: Pick<Container, 'servings' | 'place'>[],
) => {
  const total = batch.reduce((sum, container) => sum + container.servings, 0);
  const what =
    batch.length === 1
      ? formatServings(total)
      : `${batch.length} boxes (${formatServings(total)})`;
  return `Saved ${what} in the ${CONTAINER_PLACE_LABELS[batch[0].place].toLowerCase()}`;
};

export const getSavedText = (
  batch: Pick<Container, 'servings' | 'place' | 'eatBy'>[],
  now = Date.now(),
) =>
  `${getSavedHeadline(batch)}, eat by ${getEatByPhrase(batch[0].eatBy, now)}`;

/** The containers one put-away wrote, which share a moment, a place and a date. */
export const groupSavedBatches = (containers: Container[]) =>
  Array.from(
    containers
      .reduce((groups, container) => {
        const key = `${container.createdAt}|${container.place}|${container.eatBy}`;
        return groups.set(key, [...(groups.get(key) ?? []), container]);
      }, new Map<string, Container[]>())
      .values(),
  );

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

const minOf = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.min(a, b);

/** A saved meal's stock: containers put away as that meal plus those of its own recipes, each recipe counted once. */
export const getMealStockMap = (
  meals: Pick<Meal, 'id' | 'items'>[],
  byRecipe: Map<string, StockSummary>,
  byMeal: Map<string, StockSummary>,
) =>
  meals.reduce((map, meal) => {
    const recipeIds = Array.from(
      new Set(
        meal.items
          .filter((item) => item.kind === 'RECIPE')
          .map((item) => item.refId),
      ),
    );
    const sources = [
      ...[byMeal.get(meal.id)].flatMap((summary) =>
        summary ? [{ kind: 'meal' as const, id: meal.id, summary }] : [],
      ),
      ...recipeIds.flatMap((id) => {
        const summary = byRecipe.get(id);
        return summary ? [{ kind: 'recipe' as const, id, summary }] : [];
      }),
    ];
    if (sources.length === 0) return map;

    return map.set(meal.id, {
      fridge: sources.reduce((sum, { summary }) => sum + summary.fridge, 0),
      freezer: sources.reduce((sum, { summary }) => sum + summary.freezer, 0),
      containers: sources.reduce(
        (sum, { summary }) => sum + summary.containers,
        0,
      ),
      nearestEatBy: sources.reduce<number | null>(
        (nearest, { summary }) => minOf(nearest, summary.nearestEatBy),
        null,
      ),
      fridgeEatBy: sources.reduce<number | null>(
        (nearest, { summary }) => minOf(nearest, summary.fridgeEatBy),
        null,
      ),
      freezerEatBy: sources.reduce<number | null>(
        (nearest, { summary }) => minOf(nearest, summary.freezerEatBy),
        null,
      ),
      sources: sources.map(({ kind, id, summary }) => ({
        kind,
        id,
        servings: summary.fridge + summary.freezer,
      })),
    });
  }, new Map<string, MealStock>());

/** "Adobo chicken 10 · Cilantro lime rice 3", or "13 servings from 2 recipes" once there are more than three sources. */
export const getStockSourcesText = (
  sources: StockSource[],
  getName: (source: StockSource) => string,
) => {
  if (sources.length < 2) return null;

  const total = sources.reduce((sum, source) => sum + source.servings, 0);
  if (sources.length <= 3) {
    return sources
      .map((source) => `${getName(source)} ${source.servings}`)
      .join(' · ');
  }
  return `${formatServings(total)} from ${sources.length} ${sources.every((source) => source.kind === 'recipe') ? 'recipes' : 'recipes and meals'}`;
};

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
  const places = getPlacesText({
    fridgeServings: summary.fridge,
    freezerServings: summary.freezer,
  });

  return isNamed
    ? `You already have ${name}: ${places}.`
    : `You already have ${places}.`;
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

import { formatClock } from '@/utils/durationUtils';
import { clipAtWord } from '@/utils/stringUtils';
import { groupIngredientLines } from '@apps/pinch/utils/ingredientGroups';

/** The most a turn may carry, repeated from the server's reader; a check sends a built body through it. */
export const PEPPER_BODY_LIMITS = {
  standing: 40_000,
  screen: 8_000,
  heard: 1_000,
  alternatives: 4,
};

const MAX_STEP_TEXT = 1_200;
const MAX_ENTRY_TEXT = 300;
const MAX_NAME_CHARS = 80;

export interface PepperRecipeInput {
  title: string;
  /** Servings as the recipe is written; what is being made goes in the screen. */
  servings: number;
  /** Each line as the recipe writes it, the amount already as a cook reads it. */
  lines: {
    name: string;
    amountText: string;
    note: string | null;
    group: string | null;
  }[];
  steps: string[];
  sections: (string | null)[];
  /** One plain line about how it keeps, or null. */
  keeping: string | null;
}

interface StandingTier {
  step: number;
  note: number;
  isKeepingShown: boolean;
}

const STANDING_TIERS: StandingTier[] = [
  { step: Infinity, note: Infinity, isKeepingShown: true },
  { step: 500, note: 80, isKeepingShown: true },
  { step: 240, note: 40, isKeepingShown: false },
  { step: 120, note: 0, isKeepingShown: false },
];

const clip = (text: string, max: number) =>
  max === Infinity ? text.trim() : clipAtWord(text, max);

const plain = (text: string) => text.replace(/\s+/g, ' ').trim();

const renderRecipe = (recipe: PepperRecipeInput, tier: StandingTier) => {
  const toLine = (line: PepperRecipeInput['lines'][number]) => {
    const note = tier.note === 0 ? '' : clip(plain(line.note ?? ''), tier.note);
    const main = [plain(line.amountText), plain(line.name)]
      .filter((part) => part !== '')
      .join(' ');
    return `- ${main}${note === '' ? '' : `, ${note}`}`;
  };
  const ingredients = groupIngredientLines(recipe.lines).flatMap((group) => [
    ...(group.name === null ? [] : [`${group.name}:`]),
    ...group.lines.map(toLine),
  ]);
  const steps = recipe.steps.flatMap((step, index) => {
    const section = plain(recipe.sections[index] ?? '');
    const previous = plain(recipe.sections[index - 1] ?? '');
    const heading =
      section !== '' && (index === 0 || section !== previous)
        ? [`${section}:`]
        : [];
    return [...heading, `${index + 1}. ${clip(plain(step), tier.step)}`];
  });
  return [
    `Recipe: ${plain(recipe.title)} (makes ${recipe.servings} servings as written)`,
    ...(ingredients.length > 0 ? ['Ingredients:', ...ingredients] : []),
    ...(steps.length > 0 ? ['Steps:', ...steps] : []),
    ...(tier.isKeepingShown && recipe.keeping !== null
      ? [`Keeping it: ${plain(recipe.keeping)}`]
      : []),
  ].join('\n');
};

/** The recipes being cooked as the recipe is written, so it never changes with servings or steps and stays cached; cut to the server's cap by losing long step text and notes first, then each recipe's tail. */
export const buildPepperStanding = (recipes: PepperRecipeInput[]) => {
  const cap = PEPPER_BODY_LIMITS.standing;
  const joined = (tier: StandingTier) =>
    recipes.map((recipe) => renderRecipe(recipe, tier)).join('\n\n');
  const fitting = STANDING_TIERS.map(joined).find((text) => text.length <= cap);
  if (fitting !== undefined) return fitting;
  const last = STANDING_TIERS[STANDING_TIERS.length - 1];
  const share = Math.floor((cap - 2 * recipes.length) / recipes.length);
  return recipes
    .map((recipe) => clipAtWord(renderRecipe(recipe, last), share))
    .join('\n\n');
};

export type PepperView =
  'gather' | 'steps' | 'ingredients' | 'timers' | 'finish';

export interface PepperEntryInput {
  id: string;
  kind: 'tip' | 'note' | 'change';
  text: string;
  reason: string | null;
  /** The step it is about, 1-based; null for the whole recipe. */
  step: number | null;
}

export interface PepperScreenInput {
  view: PepperView;
  recipeTitle: string;
  /** The step in view, 1-based, with its section; null off the steps. */
  step: {
    number: number;
    count: number;
    text: string;
    section: string | null;
  } | null;
  servings: { title: string; servings: number }[];
  timers: {
    name: string;
    status: 'running' | 'paused' | 'done';
    leftMs: number;
  }[];
  /** What the step on screen uses, at the servings being made. */
  stepLines: { name: string; amountText: string }[];
  /** The gather screen's lines per dish, or null elsewhere. */
  gather:
    | {
        dish: string | null;
        lines: { name: string; amountText: string; isOut: boolean }[];
      }[]
    | null;
  /** The shown recipe's tips, notes and changes. */
  entries: PepperEntryInput[];
}

interface Block {
  lines: string[];
}

const VIEW_LINES: Record<PepperView, string> = {
  gather:
    'Showing: the gather screen, where ingredients are got out before cooking starts.',
  steps: 'Showing: the steps.',
  ingredients: 'Showing: the ingredient list.',
  timers: 'Showing: the timers.',
  finish: 'Showing: the finish screen. The cook is done.',
};

const getTimerLine = (timer: PepperScreenInput['timers'][number]) => {
  const state =
    timer.status === 'done'
      ? 'rang, waiting to be dismissed'
      : `${formatClock(timer.leftMs)} left, ${timer.status}`;
  return `- ${clip(plain(timer.name), MAX_NAME_CHARS)}: ${state}`;
};

const getLineText = (line: { name: string; amountText: string }) =>
  `- ${[plain(line.amountText), clip(plain(line.name), MAX_NAME_CHARS)]
    .filter((part) => part !== '')
    .join(' ')}`;

const getEntryLine = (entry: PepperEntryInput) => {
  const reason = plain(entry.reason ?? '');
  const text = clip(plain(entry.text), MAX_ENTRY_TEXT);
  const where = entry.step === null ? 'whole recipe' : `step ${entry.step}`;
  return `- id ${entry.id}, ${entry.kind}, ${where}: ${text}${reason === '' ? '' : ` (because ${clip(reason, MAX_ENTRY_TEXT)})`}`;
};

const sortEntries = (entries: PepperEntryInput[], shownStep: number | null) => {
  const rank = (entry: PepperEntryInput) =>
    shownStep !== null && entry.step === shownStep
      ? 0
      : entry.step === null
        ? 1
        : 2;
  return [...entries].sort((a, b) => rank(a) - rank(b));
};

/** A heading and as many of its lines as the budget leaves, with a count of what was dropped; nothing when not even one line fits. */
const fitBlock = (heading: string, lines: string[], budget: number): Block => {
  if (lines.length === 0) return { lines: [] };
  const take = (count: number) => {
    const shown = lines.slice(0, count);
    const dropped = lines.length - count;
    return [
      heading,
      ...shown,
      ...(dropped > 0 ? [`…and ${dropped} more`] : []),
    ];
  };
  const size = (list: string[]) => list.join('\n').length + 1;
  const count = Array.from({ length: lines.length }, (_, index) => index + 1)
    .reverse()
    .find((n) => size(take(n)) <= budget);
  return count === undefined ? { lines: [] } : { lines: take(count) };
};

/** What is on screen now, most important first so the server's cap only ever drops the least: the view, the step, the servings, the timers, what the step uses or the gather ticks, then the entries with their ids. */
export const buildPepperScreen = (input: PepperScreenInput) => {
  const cap = PEPPER_BODY_LIMITS.screen;
  const head = [
    `${VIEW_LINES[input.view]} Recipe: ${clip(plain(input.recipeTitle), MAX_NAME_CHARS)}.`,
    ...(input.step === null
      ? []
      : [
          `Step ${input.step.number} of ${input.step.count}${input.step.section === null ? '' : ` (${plain(input.step.section)})`}: ${clip(plain(input.step.text), MAX_STEP_TEXT)}`,
        ]),
  ].join('\n');
  const blocks = [
    {
      heading: 'Servings being made:',
      lines: input.servings.map(
        (dish) =>
          `- ${clip(plain(dish.title), MAX_NAME_CHARS)}: ${dish.servings}`,
      ),
    },
    {
      heading: 'Timers:',
      lines: input.timers.map(getTimerLine),
    },
    {
      heading: 'This step uses (amounts at the servings being made):',
      lines: input.stepLines.map(getLineText),
    },
    ...(input.gather ?? []).flatMap((dish) => {
      const name = dish.dish === null ? '' : ` for ${plain(dish.dish)}`;
      return [
        {
          heading: `Still to get out${name}:`,
          lines: dish.lines.filter((line) => !line.isOut).map(getLineText),
        },
        {
          heading: `Already got out${name}:`,
          lines: dish.lines.filter((line) => line.isOut).map(getLineText),
        },
      ];
    }),
    {
      heading: 'Tips, notes and changes written for this recipe:',
      lines: sortEntries(input.entries, input.step?.number ?? null).map(
        getEntryLine,
      ),
    },
  ];
  const clippedHead = head.length > cap ? clipAtWord(head, cap) : head;
  const body = blocks.reduce(
    (acc, block) => {
      const fitted = fitBlock(block.heading, block.lines, cap - acc.used - 1);
      if (fitted.lines.length === 0) return acc;
      const text = fitted.lines.join('\n');
      return { used: acc.used + text.length + 1, parts: [...acc.parts, text] };
    },
    { used: clippedHead.length, parts: [clippedHead] },
  );
  return body.parts.join('\n');
};

/** What Pepper says when a question got no answer: the day's questions are used up, the shared allowance is spent, or the call failed. */
export const getPepperProblemLine = (held: string | null) => {
  if (held === 'turnLimit') {
    return "That's all the questions I can answer today. Your spoken commands still work.";
  }
  if (held === 'budgetReached') {
    return "I can't answer questions right now. Your spoken commands still work.";
  }
  return "Sorry, I couldn't get an answer just now.";
};

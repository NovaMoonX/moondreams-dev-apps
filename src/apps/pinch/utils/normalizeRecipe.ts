import { toComparable } from '@/utils/optionMatchUtils';
import { clipAtWord } from '@/utils/stringUtils';
import {
  MAX_AMOUNT_TEXT_LENGTH,
  MAX_FINISHED_ITEMS,
  MAX_FINISHED_LENGTH,
  MAX_GUIDED_ITEMS,
  MAX_GUIDED_LENGTH,
  MAX_MINUTES,
  MAX_NAME_LENGTH,
  PHOTO_QUERY_MAX_WORDS_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_RECIPE_DESCRIPTION_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_STEPS,
  MAX_RECIPE_TITLE_LENGTH,
  MAX_SERVING_AMOUNT,
  MAX_STEP_LENGTH,
  UNITS,
} from '@apps/pinch/constants';
import type { DishCategory, RecipeCare, Unit } from '@apps/pinch/types';
import { getCategories } from '@apps/pinch/utils/categories';
import {
  getGroupKey,
  shortenGroupName,
} from '@apps/pinch/utils/ingredientGroups';
import { splitAsides, splitPrep } from '@apps/pinch/utils/ingredientNames';
import { toBase } from '@apps/pinch/utils/quantity';
import { toCare } from '@apps/pinch/utils/recipeCare';
import {
  cleanStepSection,
  toStoredStepSections,
} from '@apps/pinch/utils/stepSections';

export interface ExtractedIngredient {
  name: string;
  amount: number | null;
  unit: Unit | null;
  /** The source's own words for how much when it gives no amount ("to taste", "a handful"); null for a measured line. */
  amountText: string | null;
  note: string | null;
  /** Another name the line gives the same ingredient ("ground beef" in "beef mince (ground beef)"), tried when the name matches nothing. */
  alsoCalled: string | null;
  /** The heading the recipe puts it under ("For the sauce"), shortened to a plain name, or null; never made up. */
  group: string | null;
}

export const ESTIMATED_FIELDS = [
  'PREP',
  'COOK',
  'FRIDGE',
  'FREEZER',
  'REHEAT',
] as const;

export type EstimatedField = (typeof ESTIMATED_FIELDS)[number];

/** What the reader found. It only ever fills the form; nothing is saved from it. */
export interface ExtractedRecipe {
  title: string | null;
  servings: number | null;
  isServingsEstimate: boolean;
  /** The time and keeping fields the reader worked out rather than read, each only while it has a value. */
  estimated: EstimatedField[];
  categories: DishCategory[];
  prepMinutes: number | null;
  cookMinutes: number | null;
  description: string | null;
  /** Words to search the web for a photo of the finished dish; null when the source names none. */
  photoSearch: string | null;
  ingredients: ExtractedIngredient[];
  steps: string[];
  /** The section each step sits under, index for index with `steps`; the reader groups the steps into sections when the source doesn't. */
  stepSections: (string | null)[];
  /** What the source says, or an estimate for the dish when FRIDGE, FREEZER or REHEAT is in `estimated`. */
  care: RecipeCare | null;
  /** Parts of the recipe the reader could not make out. */
  unread: string[];
  /** Changes the person's guidance made to the reading, in a few words each; empty without guidance. */
  guided: string[];
  /** What the reader added beyond the source (a step to melt the butter, longer times), in a few words each; empty when finishing was off or nothing was added. */
  finished: string[];
}

const asString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
/** A step the reader returns is a `{ text, section }` object, or a plain string from an older shape; a blank one is dropped with its section. */
export const readSteps = (entries: unknown[]) => {
  const steps = entries
    .flatMap((entry) => {
      const item =
        typeof entry === 'object' && entry !== null
          ? (entry as Record<string, unknown>)
          : { text: entry, section: null };
      const text = asString(item.text);
      return text
        ? [
            {
              text: text.slice(0, MAX_STEP_LENGTH),
              section: cleanStepSection(asString(item.section)),
            },
          ]
        : [];
    })
    .slice(0, MAX_RECIPE_STEPS);
  return {
    steps: steps.map((step) => step.text),
    stepSections: toStoredStepSections(
      steps.map((step) => step.text),
      steps.map((step) => step.section),
    ),
  };
};

const asNumber = (value: unknown) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= MAX_SERVING_AMOUNT
    ? value
    : null;
const asMinutes = (value: unknown) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= MAX_MINUTES
    ? Math.round(value)
    : null;

const asWholeDays = (value: unknown) =>
  typeof value === 'number' ? Math.floor(value) : null;

const GROUP_READ_LENGTH = 200;
const INGREDIENTS_TITLE = /^ingredients?$/i;

/** A heading as the recipe writes it, shortened to the plain name that fits a group; the recipe's own "Ingredients" title is no group. */
const asGroup = (value: unknown) => {
  const name = shortenGroupName(asString(value)?.slice(0, GROUP_READ_LENGTH));
  const result = name !== null && !INGREDIENTS_TITLE.test(name) ? name : null;
  return result;
};

const UNMEASURED_TAIL =
  /^(.+?)[\s,;]+(to taste|as needed|as required|for garnish|to garnish|for serving|to serve)\.?$/i;
const UNMEASURED_HEAD =
  /^((?:an?\s+)?(?:(?:small|large|big|generous|good)\s+)?(?:few\s+)?(?:handful|splash|drizzle|sprinkle|knob|dash|bunch|sprig|pinch)(?:e?s)?)\s+of\s+(.+)$/i;
const PAIR = /^([^\d,]+?)\s+(?:and|&)\s+([^\d,]+)$/i;
const MAX_PAIR_WORDS = 4;
const SEASONING =
  /^(?:(?:kosher|sea|table|flaky)\s+)?salt$|^(?:(?:freshly|fresh|black|white|ground|cracked)\s+)*pepper$/i;

const isPairPart = (part: string, other: string) =>
  part.length >= 3 &&
  part.split(/\s+/).length <= MAX_PAIR_WORDS &&
  part.toLowerCase() !== other.toLowerCase();

const sayHowMuch = (head: string) => {
  const words = head.toLowerCase();
  return /^an?\s/.test(words) || words.endsWith('s') ? words : `a ${words}`;
};

const joinNotes = (notes: (string | null)[]) =>
  clipAtWord(
    [
      ...new Map(
        notes.flatMap((note) =>
          note ? [[note.trim().toLowerCase(), note.trim()] as const] : [],
        ),
      ).values(),
    ].join(', '),
    MAX_NOTE_LENGTH,
  ) || null;

const MEASURE_ASIDE =
  /^(?:[\d\u00bc-\u00be\u2150-\u215e./\s,~-]|\b(?:about|approx|approximately|or|and|g|grams?|kg|ml|l|litres?|liters?|oz|ounces?|lbs?|pounds?|cups?|tbsp|tsp|tablespoons?|teaspoons?|fl)\b)+$/i;
const NOTE_ASIDE_WORDS =
  /\b(?:optional|divided|plus|extra|more|about|approx|or|and|if|to|for|such|like|any|see|use|can|you|packed|heaping|level)\b/i;
const SYNONYM = /^\p{L}[\p{L}'\u2019-]*(?: \p{L}[\p{L}'\u2019-]*){0,2}$/u;

const isMeasureAside = (text: string) =>
  /\d/.test(text) && /[a-z]/i.test(text) && MEASURE_ASIDE.test(text);
const isSynonymAside = (text: string) =>
  SYNONYM.test(text) &&
  !NOTE_ASIDE_WORDS.test(text) &&
  splitPrep(text).prep.length === 0;

/** What a line's parentheses say, sorted by the job they do: another measure of the same amount ("(1 lb)", "(240 ml)") is dropped, another name for the ingredient ("(ground beef)") becomes `alsoCalled`, and anything else ("(medium or short grain, if you can)") describes the ingredient and goes in the note, never in the quantity. The model's own `alsoCalled` counts first; a one-word aside left in the name stays a note, since "oil (olive)" is as likely a variety as a second name. */
const readAsides = (
  name: string,
  alsoCalled: string | null,
  note: string | null,
) => {
  const { name: bare, asides } = splitAsides(name);
  const isOther = (aside: string) =>
    !isMeasureAside(aside) &&
    toComparable(aside, true) !== toComparable(bare, true);
  const given = alsoCalled !== null && isOther(alsoCalled) ? alsoCalled : null;
  const written = asides.filter(isOther);
  const also =
    given !== null && isSynonymAside(given)
      ? given
      : (written.find((aside) => isSynonymAside(aside) && /\s/.test(aside)) ??
        null);
  const described = [given, ...written].filter(
    (aside) => aside !== null && aside !== also,
  );

  return {
    name: bare,
    alsoCalled: also,
    note: joinNotes([...described, note]),
  };
};

/** A line with no amount read the way a cook means it: "salt and pepper to taste" is two lines with the amount words "to taste" under the same heading, and "handful of parsley" is parsley with "a handful". A measured line is left as it was read. */
const readUnmeasured = (line: ExtractedIngredient): ExtractedIngredient[] => {
  if (line.amount !== null) return [{ ...line, amountText: null }];
  const tail = UNMEASURED_TAIL.exec(line.name);
  const withoutTail = tail ? tail[1] : line.name;
  const head = UNMEASURED_HEAD.exec(withoutTail);
  const name = head ? head[2] : withoutTail;
  const amountText =
    clipAtWord(
      [
        head ? sayHowMuch(head[1]) : null,
        tail ? tail[2].toLowerCase() : null,
        line.amountText,
      ]
        .filter((part) => part !== null && part !== '')
        .join(', '),
      MAX_AMOUNT_TEXT_LENGTH,
    ) || null;
  const pair = PAIR.exec(name);
  const isSplit =
    pair &&
    isPairPart(pair[1], pair[2]) &&
    isPairPart(pair[2], pair[1]) &&
    (tail !== null ||
      (SEASONING.test(pair[1].trim()) && SEASONING.test(pair[2].trim())));
  const names = isSplit ? [pair[1], pair[2]] : [name];

  const isMisplaced = amountText !== null && isDescription(amountText);

  return names.map((part) => ({
    ...line,
    name: part.trim(),
    alsoCalled: names.length > 1 ? null : line.alsoCalled,
    unit: null,
    note: isMisplaced ? joinNotes([line.note, amountText]) : line.note,
    amountText: isMisplaced ? null : amountText,
  }));
};

const DESCRIPTION_LEAD =
  /\b(?:whatever|whichever|which ?ever|your (?:favou?rite|choice)|of your choice|any (?:kind|type|sort)|depending on|you(?:'|’)?re (?:cooking|using|like|prefer)|you are (?:cooking|using)|the kind)\b/i;

/** Words that say which ingredient or what kind ("whatever meat you're cooking"), never how much, belong in the note. */
const isDescription = (text: string) => DESCRIPTION_LEAD.test(text);

const SAME_AMOUNT_RATIO = 0.8;

/** Whether `next` is the same amount as `first` in another unit of the same kind ("500 g" then "1 lb" of one ingredient): a recipe that lists both measures means one amount. */
const isOtherMeasure = (
  first: ExtractedIngredient,
  next: ExtractedIngredient,
) => {
  if (
    first.amount === null ||
    next.amount === null ||
    first.unit === null ||
    next.unit === null ||
    first.unit === next.unit ||
    getGroupKey(first.group) !== getGroupKey(next.group) ||
    toComparable(first.name, true) !== toComparable(next.name, true) ||
    (first.note !== null &&
      next.note !== null &&
      first.note.trim().toLowerCase() !== next.note.trim().toLowerCase())
  ) {
    return false;
  }
  const left = toBase(first.amount, first.unit);
  const right = toBase(next.amount, next.unit);
  const ratio = left.value / right.value;

  return (
    left.dimension === right.dimension &&
    left.dimension !== 'COUNT' &&
    ratio >= SAME_AMOUNT_RATIO &&
    ratio <= 1 / SAME_AMOUNT_RATIO
  );
};

/** A dual-measure line ("500 g / 1 lb beef mince") read as two lines is one: the first measure stays, the other is left out, and a note only the second carried is kept. */
const mergeOtherMeasures = (
  lines: ExtractedIngredient[],
  line: ExtractedIngredient,
) => {
  const previous = lines.at(-1);
  if (!previous || !isOtherMeasure(previous, line)) return [...lines, line];

  return [
    ...lines.slice(0, -1),
    {
      ...previous,
      alsoCalled: previous.alsoCalled ?? line.alsoCalled,
      note: joinNotes([previous.note, line.note]),
    },
  ];
};

const toShortList = (value: unknown, length: number, max: number) =>
  [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map(asString)
        .filter((entry): entry is string => entry !== null)
        .map((entry) => entry.slice(0, length)),
    ),
  ].slice(0, max);

/** Turns whatever the model returned into the safe shape the form takes: wrong types become null, lists are capped, units must be real, and a line with no amount keeps its words ("to taste") as its amount text. With `isFinishing` false, nothing the model estimated or added beyond the source survives: no estimated times or keeping days and no finishing notes. */
export function normalizeExtractedRecipe(
  raw: unknown,
  isFinishing = true,
): ExtractedRecipe {
  const parsed = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  const listed = ESTIMATED_FIELDS.filter((field) =>
    list(parsed.estimated).includes(field),
  );
  const kept = (field: EstimatedField) =>
    isFinishing || !listed.includes(field);
  const care = toCare({
    fridgeDays: kept('FRIDGE') ? asWholeDays(parsed.fridgeDays) : null,
    freezerDays: kept('FREEZER') ? asWholeDays(parsed.freezerDays) : null,
    reheat: kept('REHEAT') ? parsed.reheat : null,
    tip: parsed.tip,
  });
  const prepMinutes = kept('PREP') ? asMinutes(parsed.prepMinutes) : null;
  const cookMinutes = kept('COOK') ? asMinutes(parsed.cookMinutes) : null;
  const hasValue: Record<EstimatedField, boolean> = {
    PREP: prepMinutes !== null,
    COOK: cookMinutes !== null,
    FRIDGE: (care?.fridgeDays ?? null) !== null,
    FREEZER: (care?.freezerDays ?? null) !== null,
    REHEAT: (care?.reheat ?? null) !== null,
  };

  return {
    title: asString(parsed.title)?.slice(0, MAX_RECIPE_TITLE_LENGTH) ?? null,
    servings: asNumber(parsed.servings),
    isServingsEstimate:
      parsed.servingsEstimated === true && asNumber(parsed.servings) !== null,
    estimated: isFinishing ? listed.filter((field) => hasValue[field]) : [],
    categories: getCategories({
      categories: list(parsed.categories).filter(
        (value): value is string => typeof value === 'string',
      ),
    }),
    prepMinutes,
    cookMinutes,
    description:
      asString(parsed.description)?.slice(0, MAX_RECIPE_DESCRIPTION_LENGTH) ??
      null,
    photoSearch:
      asString(parsed.photoSearch)
        ?.replace(/\s+/g, ' ')
        .slice(0, PHOTO_QUERY_MAX_WORDS_LENGTH)
        .trim() || null,
    ingredients: list(parsed.ingredients)
      .flatMap((entry) => {
        const item = (
          typeof entry === 'object' && entry !== null ? entry : {}
        ) as Record<string, unknown>;
        const name = asString(item.name)?.slice(0, MAX_NAME_LENGTH);
        return name
          ? readUnmeasured({
              ...readAsides(
                name,
                asString(item.alsoCalled)?.slice(0, MAX_NAME_LENGTH) ?? null,
                asString(item.note),
              ),
              amount: asNumber(item.amount),
              unit: UNITS.find((unit) => unit === item.unit) ?? null,
              amountText:
                asString(item.amountText) === null
                  ? null
                  : clipAtWord(
                      asString(item.amountText)!,
                      MAX_AMOUNT_TEXT_LENGTH,
                    ),
              group: asGroup(item.group),
            })
          : [];
      })
      .reduce<ExtractedIngredient[]>(mergeOtherMeasures, [])
      .slice(0, MAX_RECIPE_INGREDIENTS),
    ...readSteps(list(parsed.steps)),
    care,
    unread: list(parsed.unread)
      .flatMap((entry) =>
        asString(entry) ? [asString(entry)!.slice(0, 200)] : [],
      )
      .slice(0, 10),
    guided: list(parsed.guided)
      .map(asString)
      .filter((entry): entry is string => entry !== null)
      .map((entry) => entry.slice(0, MAX_GUIDED_LENGTH))
      .slice(0, MAX_GUIDED_ITEMS),
    finished: isFinishing
      ? toShortList(parsed.finished, MAX_FINISHED_LENGTH, MAX_FINISHED_ITEMS)
      : [],
  };
}

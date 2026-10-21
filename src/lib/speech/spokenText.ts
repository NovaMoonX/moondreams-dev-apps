interface Unit {
  words: [one: string, many: string];
  /** The amount reads as "2 cups of flour": a measure does, a length of time or distance does not. */
  takesOf: boolean;
  /** Written short ("tbsp"), so it is replaced; a full word is only given its "of". */
  isShort: boolean;
  /** One letter ("l", "h") means a unit only when it follows its number without a space. */
  needsNoSpace?: boolean;
}

const measure = (one: string, many: string, isShort: boolean): Unit => ({
  words: [one, many],
  takesOf: true,
  isShort,
});
const duration = (one: string, many: string, isShort: boolean): Unit => ({
  words: [one, many],
  takesOf: false,
  isShort,
});

const UNITS: Record<string, Unit> = {
  tsp: measure('teaspoon', 'teaspoons', true),
  tsps: measure('teaspoon', 'teaspoons', true),
  teaspoon: measure('teaspoon', 'teaspoons', false),
  teaspoons: measure('teaspoon', 'teaspoons', false),
  tbsp: measure('tablespoon', 'tablespoons', true),
  tbsps: measure('tablespoon', 'tablespoons', true),
  tbs: measure('tablespoon', 'tablespoons', true),
  tablespoon: measure('tablespoon', 'tablespoons', false),
  tablespoons: measure('tablespoon', 'tablespoons', false),
  cup: measure('cup', 'cups', false),
  cups: measure('cup', 'cups', false),
  'fl oz': measure('fluid ounce', 'fluid ounces', true),
  oz: measure('ounce', 'ounces', true),
  ounce: measure('ounce', 'ounces', false),
  ounces: measure('ounce', 'ounces', false),
  lb: measure('pound', 'pounds', true),
  lbs: measure('pound', 'pounds', true),
  pound: measure('pound', 'pounds', false),
  pounds: measure('pound', 'pounds', false),
  g: measure('gram', 'grams', true),
  gram: measure('gram', 'grams', false),
  grams: measure('gram', 'grams', false),
  kg: measure('kilogram', 'kilograms', true),
  mg: measure('milligram', 'milligrams', true),
  ml: measure('milliliter', 'milliliters', true),
  l: { ...measure('liter', 'liters', true), needsNoSpace: true },
  liter: measure('liter', 'liters', false),
  liters: measure('liter', 'liters', false),
  litre: measure('liter', 'liters', false),
  litres: measure('liter', 'liters', false),
  qt: measure('quart', 'quarts', true),
  quart: measure('quart', 'quarts', false),
  quarts: measure('quart', 'quarts', false),
  pt: measure('pint', 'pints', true),
  pint: measure('pint', 'pints', false),
  pints: measure('pint', 'pints', false),
  gal: measure('gallon', 'gallons', true),
  gallon: measure('gallon', 'gallons', false),
  gallons: measure('gallon', 'gallons', false),
  clove: measure('clove', 'cloves', false),
  cloves: measure('clove', 'cloves', false),
  cm: duration('centimeter', 'centimeters', true),
  mm: duration('millimeter', 'millimeters', true),
  min: duration('minute', 'minutes', true),
  mins: duration('minute', 'minutes', true),
  minute: duration('minute', 'minutes', false),
  minutes: duration('minute', 'minutes', false),
  sec: duration('second', 'seconds', true),
  secs: duration('second', 'seconds', true),
  second: duration('second', 'seconds', false),
  seconds: duration('second', 'seconds', false),
  hr: duration('hour', 'hours', true),
  hrs: duration('hour', 'hours', true),
  h: { ...duration('hour', 'hours', true), needsNoSpace: true },
  hour: duration('hour', 'hours', false),
  hours: duration('hour', 'hours', false),
};

interface SpokenFraction {
  /** On its own: "half the", "a quarter of". */
  alone: string;
  /** Before a unit: "half a teaspoon". */
  beforeUnit: string;
  /** After a whole number: "1 and a half". */
  afterWhole: string;
}

const spoken = (
  alone: string,
  beforeUnit: string,
  afterWhole: string = alone,
): SpokenFraction => ({ alone, beforeUnit, afterWhole });

const FRACTIONS: Record<string, SpokenFraction> = {
  '1/2': spoken('half', 'half a', 'a half'),
  '1/3': spoken('a third', 'a third of a'),
  '2/3': spoken('two thirds', 'two thirds of a'),
  '1/4': spoken('a quarter', 'a quarter'),
  '3/4': spoken('three quarters', 'three quarters of a'),
  '1/6': spoken('a sixth', 'a sixth of a'),
  '5/6': spoken('five sixths', 'five sixths of a'),
  '1/8': spoken('an eighth', 'an eighth of a'),
  '3/8': spoken('three eighths', 'three eighths of a'),
  '5/8': spoken('five eighths', 'five eighths of a'),
  '7/8': spoken('seven eighths', 'seven eighths of a'),
};

const FRACTION_CHARACTERS: Record<string, string> = {
  '½': '1/2',
  '⅓': '1/3',
  '⅔': '2/3',
  '¼': '1/4',
  '¾': '3/4',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};

/** Words after a measure that already read on their own, so no "of" goes between. */
const NO_OF_BEFORE = new Set(
  (
    'of to in on at for and or until then with without from per into over about each a an the plus before after ' +
    'if as so but by minus total is are it them they'
  ).split(' '),
);

const QUANTITY =
  /(?<![\w./-])(?<qty>(?:(?<whole>\d+(?:\.\d+)?)(?:[ -](?<mixed>\d{1,2}\/\d{1,2}))?|(?<fraction>\d{1,2}\/\d{1,2}))(?![\d/]))(?:(?<gap>\s?)(?<unit>fl oz|[A-Za-z]+)(?<dot>\.)?)?/g;

const getNextWord = (text: string, from: number) =>
  text
    .slice(from)
    .match(/^\s+([A-Za-z][\w'’-]*)/)?.[1]
    ?.toLowerCase() ?? null;

const isSentenceEnd = (text: string, from: number) =>
  /^(?:\s*$|\s+[A-Z])/.test(text.slice(from));

const expandQuantities = (text: string) =>
  text.replace(QUANTITY, (match, ...args: unknown[]) => {
    const offset = args.at(-3) as number;
    const groups = args.at(-1) as Record<string, string | undefined>;
    const { qty, whole, mixed, fraction, gap, unit, dot } = groups;
    const unitInfo = unit ? UNITS[unit.toLowerCase()] : undefined;
    const isUnit =
      unitInfo !== undefined && !(unitInfo.needsNoSpace === true && gap !== '');
    const hasFraction = fraction !== undefined || mixed !== undefined;
    const fractionKey = fraction ?? mixed ?? '';
    if (hasFraction && FRACTIONS[fractionKey] === undefined) return match;
    if (!hasFraction && !isUnit) return match;

    const value = Number(whole ?? 0);
    const getNumber = () => {
      if (fraction !== undefined) {
        const words = FRACTIONS[fraction];
        return isUnit ? words.beforeUnit : words.alone;
      }
      if (mixed !== undefined) {
        return `${whole} and ${FRACTIONS[mixed].afterWhole}`;
      }
      return whole ?? qty ?? match;
    };
    const number = getNumber();
    if (!isUnit || unit === undefined) {
      const tail = match.slice((qty ?? '').length);
      return `${number}${tail}`;
    }

    const isOne = fraction !== undefined || (mixed === undefined && value <= 1);
    const unitText = unitInfo.isShort ? unitInfo.words[isOne ? 0 : 1] : unit;
    const end = offset + match.length;
    const keepsDot =
      dot !== undefined && (!unitInfo.isShort || isSentenceEnd(text, end));
    const nextWord = keepsDot ? null : getNextWord(text, end);
    const needsOf =
      unitInfo.takesOf && nextWord !== null && !NO_OF_BEFORE.has(nextWord);
    return `${number} ${unitText}${keepsDot ? '.' : ''}${needsOf ? ' of' : ''}`;
  });

const expandFractionCharacters = (text: string) =>
  text.replace(
    /(?:(\d)\s?)?([½⅓⅔¼¾⅙⅚⅛⅜⅝⅞])/g,
    (_, whole: string | undefined, character: string) =>
      `${whole ? `${whole} ` : ''}${FRACTION_CHARACTERS[character]}`,
  );

const expandTemperatures = (text: string) =>
  text
    .replace(
      /(\d)\s?(?:°|º|degrees?)\s?([FfCc])\b/g,
      (_, digit: string, scale: string) =>
        `${digit} degrees ${scale.toLowerCase() === 'f' ? 'Fahrenheit' : 'Celsius'}`,
    )
    .replace(/(\d)\s?[°º](?![FfCc\w])/g, '$1 degrees');

const expandRanges = (text: string) =>
  text
    .replace(/(\d)\s?[–—-]\s?(?=\d)(?!\d{1,2}\/\d)/g, '$1 to ')
    .replace(/(\d)\s?x\s?(?=\d)/g, '$1 by ');

const expandSymbols = (text: string) =>
  text
    .replace(/(\d)\s?%/g, '$1 percent')
    .replace(/~\s?(?=\d)/g, 'about ')
    .replace(/(\s)&(\s)/g, '$1and$2')
    .replace(/\bw\/\s?/gi, 'with ')
    .replace(/\bapprox\.\s?/gi, 'about ')
    .replace(/\be\.g\.,?/gi, 'for example')
    .replace(/\bi\.e\.,?/gi, 'that is')
    .replace(/\betc\.(?=\s+[A-Z]|\s*$)/g, 'and so on.')
    .replace(/\betc\./g, 'and so on');

/**
 * Text as it should be said: "1/2 tsp salt" is "half a teaspoon of salt", "1½ cups" is "1 and a half cups", "350°F" is
 * "350 degrees Fahrenheit", "10-12 min." is "10 to 12 minutes." and "9x13" is "9 by 13". Short units are written out
 * (only after a number), a measure gets its "of" ("2 tbsp butter"), and a full stop that belonged to an abbreviation no
 * longer ends a sentence. Text that is already spoken passes through unchanged.
 */
export const toSpokenText = (text: string) => {
  const result = [
    expandFractionCharacters,
    expandRanges,
    expandTemperatures,
    expandQuantities,
    expandSymbols,
  ].reduce((current, expand) => expand(current), text);
  return result;
};

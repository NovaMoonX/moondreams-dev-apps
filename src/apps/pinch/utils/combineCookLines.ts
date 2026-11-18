import {
  convertMeasure,
  isMeasureUnit,
  MEASURE_TO_BASE,
} from '@/utils/measureUtils';
import type { CookMeasure } from '@apps/pinch/utils/cookConversions';
import { formatKitchenAmount } from '@apps/pinch/utils/kitchenMeasure';

export interface CombineSource {
  recipeId: string;
  recipeTitle: string;
  lineId: string;
  /** The same thing across lines: the ingredient's id, else its name. */
  key: string;
  name: string;
  note: string | null;
  amountText: string;
  isMeasured: boolean;
  group: string | null;
  measure: CookMeasure | null;
}

export interface CombinedLine {
  key: string;
  name: string;
  /** Where each part goes when it was split ("¼ cup for the chicken · 2 tbsp for the sauce"), else the line's own note. */
  note: string | null;
  amountText: string;
  isMeasured: boolean;
  measure: CookMeasure | null;
  sources: { recipeId: string; lineId: string }[];
}

const toBase = ({ amount, unit }: CookMeasure) =>
  isMeasureUnit(unit) ? amount * MEASURE_TO_BASE[unit] : amount;

/** The lines' amounts added up in the unit of the biggest part, or null when they can't be added (a cup and a count). */
const addMeasures = (measures: CookMeasure[]): CookMeasure | null => {
  if (measures.length === 0) return null;
  const biggest = measures.reduce((best, measure) =>
    toBase(measure) > toBase(best) ? measure : best,
  );
  const total = measures.reduce<number | null>((sum, measure) => {
    if (sum === null) return null;
    if (measure.unit === biggest.unit) return sum + measure.amount;
    if (!isMeasureUnit(measure.unit) || !isMeasureUnit(biggest.unit)) {
      return null;
    }
    const converted = convertMeasure(
      measure.amount,
      measure.unit,
      biggest.unit,
    );
    return converted === null ? null : sum + converted;
  }, 0);
  return total === null ? null : { ...biggest, amount: total };
};

const lowerFirst = (text: string) =>
  /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;

const sayWhere = (source: CombineSource, isPlate: boolean) => {
  if (source.group !== null) {
    const group = lowerFirst(source.group);
    return group.startsWith('for ') ? group : `for ${group}`;
  }
  return isPlate ? `for ${source.recipeTitle}` : null;
};

const combineOne = (
  key: string,
  sources: CombineSource[],
  isPlate: boolean,
): CombinedLine => {
  const [first] = sources;
  const ids = sources.map(({ recipeId, lineId }) => ({ recipeId, lineId }));
  if (sources.length === 1) {
    return { ...first, key, sources: ids };
  }
  const measured = sources.filter((source) => source.measure !== null);
  const total =
    measured.length === sources.length
      ? addMeasures(measured.map((source) => source.measure as CookMeasure))
      : null;
  const totalText =
    total === null ? null : formatKitchenAmount(total.amount, total.unit);
  const isExactParts = sources.every(
    (source) => !source.amountText.startsWith('about '),
  );
  const isTotalShown =
    totalText !== null && (!totalText.startsWith('about ') || !isExactParts);
  const parts = sources.map((source) =>
    [source.amountText, source.note, sayWhere(source, isPlate)]
      .filter((part) => part !== null && part !== '')
      .join(' '),
  );
  const hasWhere = sources.some((source) => sayWhere(source, isPlate) !== null);
  return {
    key,
    name: first.name,
    note: isTotalShown || hasWhere ? parts.join(' · ') : null,
    amountText:
      isTotalShown && totalText !== null
        ? totalText
        : Array.from(new Set(sources.map((source) => source.amountText))).join(
            ' + ',
          ),
    isMeasured: sources.some((source) => source.isMeasured),
    measure: isTotalShown ? total : null,
    sources: ids,
  };
};

/** Every line once per ingredient, its amounts added up where they can be, in the order each first appears. */
export function combineCookLines(
  sources: CombineSource[],
  isPlate: boolean,
): CombinedLine[] {
  const grouped = sources.reduce<Map<string, CombineSource[]>>(
    (result, source) =>
      result.set(source.key, [...(result.get(source.key) ?? []), source]),
    new Map(),
  );
  return Array.from(grouped, ([key, group]) => combineOne(key, group, isPlate));
}

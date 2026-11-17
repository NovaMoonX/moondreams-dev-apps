import {
  convertMeasure,
  isMeasureUnit,
  MEASURE_KIND,
  type MeasureUnit,
} from '@/utils/measureUtils';
import type { Unit } from '@apps/pinch/types';
import { formatKitchenAmount } from '@apps/pinch/utils/kitchenMeasure';
import { convertForIngredient, getConversions } from '@apps/pinch/utils/units';

/** An amount as shown in cooking mode, with what turns a weight into a volume for its ingredient. */
export interface CookMeasure {
  amount: number;
  unit: Unit;
  gramsPerMl: number | null;
}

const NBSP = '\u00A0';
const SIZE_PAIRS: [Unit, Unit][] = [
  ['OZ', 'LB'],
  ['G', 'KG'],
  ['ML', 'L'],
];

/** Of a unit and its larger sibling (oz and lb, g and kg, ml and l) only the one that reads best: the larger from one up. */
const onePerSizePair = (conversions: { amount: number; unit: Unit }[]) =>
  conversions.filter((conversion) =>
    SIZE_PAIRS.every(([small, large]) => {
      if (conversion.unit !== small && conversion.unit !== large) return true;
      const bigger = conversions.find((other) => other.unit === large);
      const hasBoth =
        bigger !== undefined &&
        conversions.some((other) => other.unit === small);
      if (!hasBoth) return true;
      return conversion.unit === (bigger.amount >= 1 ? large : small);
    }),
  );

/** The one muted line under an opened amount ("= 8 tbsp · 4 fl oz · about 2¼ oz by weight"), or null when there is nothing else to say. */
export function getConversionLine({
  amount,
  unit,
  gramsPerMl,
}: CookMeasure): string | null {
  if (!isMeasureUnit(unit)) return null;
  const others = onePerSizePair(
    getConversions(amount, unit, { gramsPerMl }).slice(1),
  );
  if (others.length === 0) return null;
  const parts = others.map((other) => {
    const text = formatKitchenAmount(other.amount, other.unit).replaceAll(
      ' ',
      NBSP,
    );
    if (
      !isMeasureUnit(other.unit) ||
      MEASURE_KIND[other.unit] === MEASURE_KIND[unit]
    ) {
      return text;
    }
    return `${text} ${MEASURE_KIND[other.unit] === 'MASS' ? 'by weight' : 'by volume'}`;
  });
  return `= ${parts.join(' · ')}`;
}

export interface SpokenAnswer {
  ok: boolean;
  show: string;
  speak: string;
}

const lower = (name: string) => name.toLowerCase();

/** What one ingredient line comes to in the unit the person named, at the servings being made. `toSpoken` writes an amount as it is said. */
export function describeIngredientConversion(
  row: { name: string; amountText: string; measure: CookMeasure | null },
  unit: MeasureUnit,
  toSpoken: (amountText: string) => string,
): SpokenAnswer {
  const name = lower(row.name);
  const { measure } = row;
  if (measure === null) {
    const text = row.amountText.trim();
    const sentence =
      text === ''
        ? `The ${name} has no amount in this recipe.`
        : `The ${name} is ${text}.`;
    return { ok: true, show: sentence, speak: sentence };
  }
  if (!isMeasureUnit(measure.unit)) {
    const sentence = `The ${name} is ${row.amountText}, which I can't change into ${formatTarget(unit)}.`;
    return { ok: false, show: sentence, speak: sentence };
  }
  const isLooseVolume =
    unit === 'OZ' &&
    MEASURE_KIND[measure.unit] === 'VOLUME' &&
    (measure.gramsPerMl === null || measure.gramsPerMl <= 0);
  const target = isLooseVolume ? 'FL_OZ' : unit;
  const converted = convertForIngredient(measure.amount, measure.unit, target, {
    gramsPerMl: measure.gramsPerMl,
  });
  if (converted === null) {
    const verb =
      MEASURE_KIND[target] === 'MASS' ? 'weigh' : 'measure by volume';
    const lead = `I can't ${verb} ${name} without knowing how heavy it is. The recipe says`;
    return {
      ok: false,
      show: `${lead} ${row.amountText}.`,
      speak: `${lead} ${toSpoken(row.amountText)}.`,
    };
  }
  const asked = formatKitchenAmount(converted, target);
  const isSame = asked === row.amountText;
  const show = `The ${name} is ${asked}${isSame ? '' : `, or ${row.amountText}`}.`;
  const speak = `The ${name} is ${toSpoken(asked)}${isSame ? '' : `, or ${toSpoken(row.amountText)}`}.`;
  return { ok: true, show, speak };
}

const formatTarget = (target: MeasureUnit) =>
  formatKitchenAmount(1, target).replace(/^1 /, '');

/** A plain conversion with no ingredient, which only works within a kind (millilitres to cups, never to grams). */
export function describeMeasureConversion(
  amount: number,
  from: MeasureUnit,
  to: MeasureUnit,
  toSpoken: (amountText: string) => string,
): SpokenAnswer {
  const converted = convertMeasure(amount, from, to);
  if (converted === null) {
    const sentence =
      'I can only change a weight to a weight or a volume to a volume without an ingredient. Try “how much butter in grams”.';
    return { ok: false, show: sentence, speak: sentence };
  }
  const start = formatKitchenAmount(amount, from);
  const end = formatKitchenAmount(converted, to);
  return {
    ok: true,
    show: `${start} is ${end}.`,
    speak: `${toSpoken(start)} is ${toSpoken(end)}.`,
  };
}

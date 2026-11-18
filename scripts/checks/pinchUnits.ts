import assert from 'node:assert/strict';

import {
  adaptAmount,
  adaptLines,
  convertForIngredient,
  getConversions,
  getPreferredUnit,
  toPreferredUnits,
} from '../../src/apps/pinch/utils/units.ts';
import type { PinchUnitSettings } from '../../src/apps/pinch/types.ts';
import { getMeasuringTools } from '../../src/apps/pinch/utils/measuringTools.ts';
import { formatKitchenAmount } from '../../src/apps/pinch/utils/kitchenMeasure.ts';
import {
  convertMeasure,
  formatAmountText,
  parseAmountText,
  roundMeasure,
  stepMeasure,
} from '../../src/utils/measureUtils.ts';

const near = (actual: number | null, expected: number, places = 3) => {
  assert.ok(actual !== null, `expected ${expected}, got null`);
  assert.equal(
    Number(actual.toFixed(places)),
    Number(expected.toFixed(places)),
  );
};

// Conversions stay within a kind
near(convertMeasure(1, 'CUP', 'TBSP'), 16);
near(convertMeasure(1, 'LB', 'OZ'), 16);
near(convertMeasure(1, 'FL_OZ', 'TBSP'), 2);
assert.equal(convertMeasure(1, 'CUP', 'G'), null);

// Rounding lands on amounts a cook measures
assert.equal(roundMeasure(113.4, 'G'), 115);
assert.equal(roundMeasure(7.05, 'OZ'), 7);
assert.equal(roundMeasure(0.35, 'CUP'), 1 / 3);
assert.equal(roundMeasure(0.13, 'TSP'), 1 / 8);
assert.equal(roundMeasure(236.6, 'ML'), 240);
assert.equal(roundMeasure(118.3, 'ML'), 120);
assert.equal(roundMeasure(2.3, 'LB'), 2.25);

// Stepping goes to the next measurable amount, and stops at the smallest
assert.equal(stepMeasure(115, 'G', 1), 120);
assert.equal(stepMeasure(115, 'G', -1), 110);
assert.equal(stepMeasure(1 / 2, 'CUP', 1), 2 / 3);
assert.equal(stepMeasure(1 / 3, 'CUP', -1), 1 / 4);
assert.equal(stepMeasure(1 / 8, 'TSP', -1), 1 / 8);
assert.equal(stepMeasure(7, 'OZ', 1), 7.5);

// Large amounts round without walking a grid
assert.equal(roundMeasure(1e7, 'G'), 1e7);
assert.equal(stepMeasure(1e6, 'G', 1), 1000025);
assert.equal(roundMeasure(1e6 + 0.4, 'CUP'), 1e6 + 1 / 3);
assert.equal(stepMeasure(50, 'G', -1), 49);
assert.equal(stepMeasure(200, 'G', -1), 195);
assert.equal(stepMeasure(4.8, 'G', 1), 5);
assert.equal(roundMeasure(0.1, 'G'), 0.1);

// Amount text reads back to the same number
[0.333, 0.667, 0.6667, 2.345, 0.0625, 0.004, 1 / 3, 2 / 3, 1.5, 7.05].forEach(
  (amount) => assert.equal(parseAmountText(formatAmountText(amount)), amount),
);
assert.equal(formatAmountText(1.5), '1 ½');

// Typed amounts
assert.equal(parseAmountText('1,000'), 1000);
assert.equal(parseAmountText('0,125'), 0.125);
assert.equal(parseAmountText('1 ½'), 1.5);
assert.equal(parseAmountText('1 1/2'), 1.5);
assert.equal(parseAmountText('¾'), 0.75);
assert.equal(parseAmountText('3/4'), 0.75);
assert.equal(parseAmountText('1,5'), 1.5);
assert.equal(parseAmountText('.5'), 0.5);
assert.equal(parseAmountText(''), null);
assert.equal(parseAmountText('two'), null);
assert.equal(parseAmountText('1/0'), null);

const asWritten: PinchUnitSettings = {
  weight: 'AS_WRITTEN',
  volume: 'AS_WRITTEN',
  keepSpoons: true,
};
const us: PinchUnitSettings = {
  weight: 'US',
  volume: 'CUPS',
  keepSpoons: true,
};
const metric: PinchUnitSettings = {
  weight: 'METRIC',
  volume: 'METRIC',
  keepSpoons: true,
};
const flOz: PinchUnitSettings = {
  weight: 'US',
  volume: 'FL_OZ',
  keepSpoons: true,
};

// Spoon amounts that would round far from themselves in fluid ounces stay as written
assert.equal(adaptAmount(2.5, 'TBSP', flOz), null);
assert.equal(adaptAmount(7.5, 'TSP', flOz), null);

// As written changes nothing
assert.equal(adaptAmount(200, 'G', asWritten), null);
assert.equal(getPreferredUnit(2, 'CUP', asWritten), null);

// Weights follow the weight choice, by size
assert.deepEqual(adaptAmount(200, 'G', us), { amount: 7, unit: 'OZ' });
assert.deepEqual(adaptAmount(1, 'KG', us), { amount: 2.25, unit: 'LB' });
assert.deepEqual(adaptAmount(8, 'OZ', metric), { amount: 230, unit: 'G' });
assert.deepEqual(adaptAmount(3, 'LB', metric), { amount: 1.35, unit: 'KG' });
assert.equal(adaptAmount(7, 'OZ', us), null);

// Volumes follow the volume choice; spoons stay unless the person converts them
assert.deepEqual(adaptAmount(250, 'ML', us), { amount: 1, unit: 'CUP' });
assert.deepEqual(adaptAmount(30, 'ML', us), { amount: 2, unit: 'TBSP' });
assert.equal(adaptAmount(1, 'TBSP', us), null);
assert.equal(adaptAmount(1, 'TSP', metric), null);
assert.deepEqual(adaptAmount(1, 'TSP', { ...metric, keepSpoons: false }), {
  amount: 5,
  unit: 'ML',
});
assert.deepEqual(adaptAmount(2, 'CUP', metric), { amount: 470, unit: 'ML' });
assert.deepEqual(adaptAmount(1, 'CUP', flOz), { amount: 8, unit: 'FL_OZ' });

// Pinches, counts and lines with no amount never change
assert.equal(adaptAmount(1, 'PINCH', metric), null);
assert.equal(adaptAmount(3, 'EACH', metric), null);
const adapted = adaptLines(
  [
    { amount: 200, unit: 'G' as const, adaptedFrom: null },
    { amount: null, unit: 'EACH' as const, adaptedFrom: null },
    { amount: 2, unit: 'EACH' as const, adaptedFrom: null },
  ],
  us,
);
assert.equal(adapted.count, 1);
assert.deepEqual(adapted.lines[0], {
  amount: 7,
  unit: 'OZ',
  adaptedFrom: { amount: 200, unit: 'G' },
});
assert.equal(adapted.lines[1].adaptedFrom, null);

// A line adapted again works from its first original, and goes back to it when that already reads right
const twice = adaptLines(adapted.lines, metric);
assert.deepEqual(twice.lines[0], { amount: 200, unit: 'G', adaptedFrom: null });
assert.equal(adaptLines(adapted.lines, us).count, 0);
const stepped = {
  amount: 7.5,
  unit: 'OZ' as const,
  adaptedFrom: { amount: 200, unit: 'G' as const },
};
assert.equal(adaptLines([stepped], us).count, 0);
assert.equal(adaptLines([stepped], asWritten).count, 0);

// A small weight that would round far from itself stays as written
assert.equal(adaptAmount(3, 'G', us), null);
assert.equal(adaptAmount(5, 'G', us), null);

// Display conversion is unrounded
const shown = toPreferredUnits(200, 'G', us);
assert.equal(shown.unit, 'OZ');
near(shown.amount, 7.0548);

// The converter lists sensible units, and the other kind only with a density
const halfCup = getConversions(0.5, 'CUP', { gramsPerMl: null });
assert.deepEqual(halfCup[0], { amount: 0.5, unit: 'CUP' });
assert.ok(halfCup.some((entry) => entry.unit === 'TBSP'));
assert.ok(!halfCup.some((entry) => entry.unit === 'G'));
assert.ok(!halfCup.some((entry) => entry.unit === 'TSP'));
const flour = getConversions(1, 'CUP', { gramsPerMl: 0.53 });
near(flour.find((entry) => entry.unit === 'G')?.amount ?? null, 125.39, 1);
assert.deepEqual(getConversions(2, 'EACH', { gramsPerMl: 1 }), []);

near(convertForIngredient(1, 'CUP', 'G', { gramsPerMl: 0.53 }), 125.39, 1);
assert.equal(convertForIngredient(1, 'CUP', 'G', { gramsPerMl: null }), null);
near(convertForIngredient(1, 'CUP', 'ML', { gramsPerMl: null }), 236.588);

// Measuring tools follow the amount as the row shows it
const line = (
  name: string,
  amount: number,
  unit: Parameters<typeof getMeasuringTools>[0][number]['unit'],
  isLiquid = false,
) => ({ name, amount, unit, isLiquid });
const tools = getMeasuringTools([
  line('Flour', 4 / 3, 'CUP'),
  line('Milk', 0.75, 'CUP', true),
  line('Stock', 500, 'ML', true),
  line('Soy sauce', 0.31, 'CUP', true),
  line('Salt', 0.5, 'TSP'),
  line('Vanilla', 1.5, 'TBSP'),
  line('Butter', 113, 'G'),
  line('Ground beef', 1, 'LB'),
  line('Chicken', 1.5, 'LB'),
  line('Pepper', 0.01, 'TSP'),
  line('Eggs', 2, 'EACH'),
]);
assert.deepEqual(
  tools.map((tool) => [tool.key, tool.sizes, tool.names]),
  [
    ['SCALE', [], ['Butter', 'Chicken']],
    ['LIQUID_CUP', [], ['Milk', 'Stock']],
    ['DRY_CUPS', ['1 cup', '⅓ cup'], ['Flour']],
    ['SPOONS', ['1 tbsp', '1 tsp', '½ tsp'], ['Soy sauce', 'Salt', 'Vanilla']],
  ],
);
// 0.31 cup reads as 5 tbsp, so it is spoons, not a cup
assert.equal(formatKitchenAmount(0.31, 'CUP'), '5 tbsp');
assert.deepEqual(getMeasuringTools([line('Oil', 0.75, 'TSP')])[0].sizes, [
  '½ tsp',
  '¼ tsp',
]);
assert.deepEqual(getMeasuringTools([line('Salt', 0.01, 'TSP')]), []);

console.log('pinch units: ok');

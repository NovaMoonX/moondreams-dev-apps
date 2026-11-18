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
import { combineCookLines } from '../../src/apps/pinch/utils/combineCookLines.ts';
import { getMeasuringTools } from '../../src/apps/pinch/utils/measuringTools.ts';
import { formatKitchenAmount } from '../../src/apps/pinch/utils/kitchenMeasure.ts';
import { formatReadableSize } from '../../src/apps/pinch/utils/productFormat.ts';
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
  gramsPerMl: number | null = null,
) => ({ name, amount, unit, isLiquid, gramsPerMl });
const tools = getMeasuringTools([
  line('Flour', 4 / 3, 'CUP'),
  line('Milk', 0.75, 'CUP', true),
  line('Stock', 500, 'ML', true),
  line('Soy sauce', 0.31, 'CUP', true),
  line('Salt', 0.5, 'TSP'),
  line('Vanilla', 1.5, 'TBSP'),
  line('Butter', 113, 'G', false, 0.96),
  line('Ground beef', 1, 'LB'),
  line('Chicken', 1.5, 'LB'),
  line('Pepper', 0.01, 'TSP'),
  line('Eggs', 2, 'EACH'),
]);
assert.deepEqual(
  tools.map((tool) => [tool.key, tool.sizes, tool.names]),
  [
    ['SCALE', ['113 g', '1½ lb'], ['Butter', 'Chicken']],
    ['LIQUID_CUP', ['¾ cup', '500 ml'], ['Milk', 'Stock']],
    ['DRY_CUPS', ['1 cup', '⅓ cup'], ['Flour']],
    ['SPOONS', ['1 tbsp', '1 tsp', '½ tsp'], ['Soy sauce', 'Salt', 'Vanilla']],
  ],
);
// A weighed line with a known density says what it is without a scale; one without says nothing
assert.deepEqual(tools[0].swaps, [{ name: 'Butter', text: '½ cup' }]);
// Two weighed lines of one ingredient make one swap, added up
assert.deepEqual(
  getMeasuringTools([
    line('Butter', 113, 'G', false, 0.96),
    line('Butter', 113, 'G', false, 0.96),
  ])[0].swaps,
  [{ name: 'Butter', text: '1 cup' }],
);
// 0.31 cup reads as 5 tbsp, so it is spoons, not a cup
assert.equal(formatKitchenAmount(0.31, 'CUP'), '5 tbsp');
assert.deepEqual(getMeasuringTools([line('Oil', 0.75, 'TSP')])[0].sizes, [
  '½ tsp',
  '¼ tsp',
]);
assert.deepEqual(getMeasuringTools([line('Salt', 0.01, 'TSP')]), []);

// "All together" adds one ingredient's lines up and says where each part goes
const source = (
  lineId: string,
  key: string,
  amount: number | null,
  unit: Parameters<typeof getMeasuringTools>[0][number]['unit'],
  group: string | null,
  recipeId = 'r1',
) => ({
  recipeId,
  recipeTitle: recipeId === 'r1' ? 'Adobo chicken' : 'Rice',
  lineId,
  key,
  name: key,
  note: null,
  amountText: amount === null ? 'to taste' : formatKitchenAmount(amount, unit),
  isMeasured: amount !== null,
  group,
  measure: amount === null ? null : { amount, unit, gramsPerMl: null },
});
const combined = combineCookLines(
  [
    source('a', 'Soy sauce', 0.25, 'CUP', 'For the chicken'),
    source('b', 'Garlic', 4, 'EACH', 'For the chicken'),
    source('c', 'Soy sauce', 2, 'TBSP', 'For the sauce'),
    source('d', 'Salt', null, 'PINCH', null),
    source('e', 'Salt', null, 'PINCH', null, 'r2'),
    source('f', 'Garlic', 1, 'TBSP', null, 'r2'),
  ],
  true,
  null,
);
assert.equal(
  combineCookLines(
    [
      source('g', 'Salt', 2, 'TSP', 'For the chicken'),
      source('h', 'Salt', 1, 'TSP', 'For the sauce'),
    ],
    false,
    null,
  )[0].amountText,
  '1 tbsp',
);
assert.deepEqual(
  combined.map((line) => [line.key, line.amountText, line.note]),
  [
    ['Soy sauce', '6 tbsp', '¼ cup for the chicken · 2 tbsp for the sauce'],
    ['Garlic', '4 + 1 tbsp', '4 for the chicken · 1 tbsp for Rice'],
    ['Salt', 'to taste', 'to taste for Adobo chicken · to taste for Rice'],
  ],
);
assert.deepEqual(combined[0].sources, [
  { recipeId: 'r1', lineId: 'a' },
  { recipeId: 'r1', lineId: 'c' },
]);

// An amount that has outgrown its unit reads in the next one up, on screen only
const { formatReadableAmount } =
  await import('../../src/apps/pinch/utils/kitchenMeasure.ts');
const { formatShopAmount } =
  await import('../../src/apps/pinch/utils/shopping.ts');
const metricSpoons: PinchUnitSettings = {
  weight: 'METRIC',
  volume: 'METRIC',
  keepSpoons: true,
};
assert.deepEqual(
  [
    formatReadableAmount(40, 'OZ'),
    formatReadableAmount(32, 'OZ'),
    formatReadableAmount(15.5, 'OZ'),
    formatReadableAmount(17.6, 'OZ'),
    formatReadableAmount(6, 'TSP'),
    formatReadableAmount(48, 'TSP'),
    formatReadableAmount(7, 'TSP'),
    formatReadableAmount(12, 'TBSP'),
    formatReadableAmount(6, 'TBSP'),
    formatReadableAmount(16, 'TBSP', metricSpoons),
    formatReadableAmount(1500, 'G'),
    formatReadableAmount(2500, 'ML'),
    formatReadableAmount(2.5, 'LB'),
    formatReadableAmount(16, 'FL_OZ'),
  ],
  [
    '40 oz',
    '32 oz',
    '15½ oz',
    '17½ oz',
    '2 tbsp',
    '1 cup',
    '7 tsp',
    '¾ cup',
    '6 tbsp',
    '16 tbsp',
    '1.5 kg',
    '2.5 l',
    '2½ lb',
    '16 fl oz',
  ],
  'an amount steps up only when it reads cleanly there, and cups only for someone who measures in cups',
);
assert.deepEqual(
  [
    formatShopAmount({ amount: 40, unit: 'OZ' }),
    formatShopAmount({ amount: 2056, unit: 'G' }),
    formatShopAmount({ amount: 16, unit: 'TBSP' }),
    formatShopAmount({ amount: 900, unit: 'G' }),
  ],
  ['40 oz', '2.1 kg', '1 cup', '900 g'],
  'the shopping list steps a summed amount up too',
);

assert.deepEqual(
  [
    formatReadableSize(40, 'OZ'),
    formatReadableSize(12.5, 'OZ'),
    formatReadableSize(1500, 'G'),
    formatReadableSize(750, 'ML'),
  ],
  ['40 oz', '12.5 oz', '1.5 kg', '750 ml'],
  'what is left of a package reads in the unit it has grown into',
);
assert.equal(
  formatShopAmount({ amount: 16, unit: 'TBSP' }, metricSpoons),
  '16 tbsp',
  'a list amount never steps into cups for a person who measures in metric',
);

const lbOz: PinchUnitSettings = {
  weight: 'LB_OZ',
  volume: 'CUPS',
  keepSpoons: true,
};
assert.deepEqual(
  [
    formatReadableAmount(40, 'OZ', lbOz),
    formatReadableAmount(32, 'OZ', lbOz),
    formatReadableAmount(17.6, 'OZ', lbOz),
    formatReadableAmount(12, 'OZ', lbOz),
    formatReadableAmount(2.5, 'LB', lbOz),
    formatReadableAmount(0.5, 'LB', lbOz),
    formatReadableAmount(16, 'FL_OZ', lbOz),
    formatShopAmount({ amount: 40, unit: 'OZ' }, lbOz),
    formatReadableSize(40, 'OZ', lbOz),
  ],
  [
    '2 lb 8 oz',
    '2 lb',
    '1 lb 2 oz',
    '12 oz',
    '2 lb 8 oz',
    '8 oz',
    '16 fl oz',
    '2 lb 8 oz',
    '2 lb 8 oz',
  ],
  'pounds and ounces reads a weight as a scale in lb:oz mode does, and only for someone who picked it',
);
assert.deepEqual(adaptAmount(1, 'KG', lbOz), { amount: 35, unit: 'OZ' });
assert.equal(adaptAmount(2, 'LB', lbOz), null);
assert.equal(adaptAmount(8, 'OZ', lbOz), null);
assert.deepEqual(adaptAmount(0.5, 'LB', lbOz), { amount: 8, unit: 'OZ' });
const { getLineStockText, formatTotal } =
  await import('../../src/apps/pinch/utils/packages.ts');
assert.deepEqual(
  [
    getLineStockText(
      {
        kind: 'SOME',
        have: { amount: 40, unit: 'OZ' },
        isConverted: false,
      } as never,
      lbOz,
    ),
    getLineStockText({
      kind: 'SOME',
      have: { amount: 40, unit: 'OZ' },
      isConverted: false,
    } as never),
    formatTotal({ amount: 40, unit: 'OZ' }, lbOz),
    formatTotal({ amount: 40, unit: 'OZ' }),
  ],
  ['You have 2 lb 8 oz', 'You have 40 oz', '2 lb 8 oz', '40 oz'],
  "the pantry reads the person's way of weighing too",
);
console.log('pinch units: ok');

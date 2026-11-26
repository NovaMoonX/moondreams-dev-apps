import assert from 'node:assert/strict';

import {
  getReadNotice,
  MAX_DIRECT_NOTICE_DETAILS,
} from '../../src/apps/pinch/utils/readNotice';

const base = {
  servings: 4,
  isServingsEstimate: false,
  estimated: [] as ('PREP' | 'COOK' | 'FRIDGE' | 'FREEZER' | 'REHEAT')[],
  guided: [],
  finished: [],
  unread: [],
};

const plain = getReadNotice(base, []);
assert.equal(plain.headline, 'Filled in from your recipe');
assert.deepEqual(plain.details, []);

const guided = getReadNotice({ ...base, guided: ['a shorter title'] }, []);
assert.equal(guided.headline, 'We followed your notes');
assert.equal(guided.details.length, 1);
assert.ok(!guided.details[0].text.startsWith(guided.headline));

const two = getReadNotice(
  {
    ...base,
    isServingsEstimate: true,
    servings: 12,
    estimated: ['COOK' as const],
  },
  [],
);
assert.equal(two.headline, 'Filled in and finished for you');
assert.equal(two.details.length, 2);
assert.ok(two.details.length <= MAX_DIRECT_NOTICE_DETAILS);
assert.ok(two.details[0].text.includes('12'));

const four = getReadNotice(
  {
    ...base,
    isServingsEstimate: true,
    estimated: ['PREP' as const, 'FRIDGE' as const],
    unread: ['the photo'],
  },
  [{ name: 'Flour', ingredientName: 'Bread flour' }],
);
assert.equal(four.details.length, 5);
assert.ok(four.details.length > MAX_DIRECT_NOTICE_DETAILS);
assert.ok(four.details.some((d) => d.text.includes('Bread flour for flour')));
assert.equal(
  new Set(four.details.map((d) => d.text)).size,
  four.details.length,
);

const finishedBase = {
  ...base,
  finished: ['added a step to melt the butter', 'raised prep to 25 minutes'],
};
const finished = getReadNotice(finishedBase, []);
assert.equal(finished.headline, 'Finished like a cookbook');
assert.deepEqual(
  finished.details.map((d) => d.text),
  ['Added a step to melt the butter.', 'Raised prep to 25 minutes.'],
);
assert.ok(finished.details.every((d) => d.icon !== ''));
assert.ok(finished.details.length <= MAX_DIRECT_NOTICE_DETAILS);
assert.equal(
  finished.footer,
  'Want only what you gave it? Turn off finishing in Settings.',
);
assert.equal(plain.footer, null);
assert.equal(four.footer, null);

const followed = getReadNotice(
  { ...finishedBase, guided: ['a shorter title'] },
  [],
);
assert.equal(followed.headline, 'We followed your notes');
assert.ok(followed.footer !== null);

const both = getReadNotice(
  {
    ...base,
    finished: ['added a step to cook the bacon'],
    estimated: ['PREP', 'COOK', 'FRIDGE'],
  },
  [],
);
assert.deepEqual(
  both.details.map((d) => d.text),
  [
    'We estimated a time the recipe didn’t give, from its steps.',
    'We estimated how long it keeps and how to reheat it.',
    'Added a step to cook the bacon.',
  ],
  'the estimate lines and the finished items are both shown, never merged away',
);

const strict = getReadNotice({ ...base, estimated: ['PREP' as const] }, []);
assert.equal(strict.footer, null);

console.log('pinch read notice: ok');

import assert from 'node:assert/strict';

import {
  getReadNotice,
  MAX_DIRECT_NOTICE_DETAILS,
} from '../../src/apps/pinch/utils/readNotice';

const base = {
  servings: 4,
  isServingsEstimate: false,
  isTimeEstimate: false,
  isCareEstimate: false,
  guided: [],
  unread: [],
};

const plain = getReadNotice(base, []);
assert.equal(plain.headline, 'Filled in from your recipe');
assert.deepEqual(plain.details, []);

const guided = getReadNotice({ ...base, guided: ['a shorter title'] }, []);
assert.equal(guided.headline, 'We followed your notes');
assert.equal(guided.details.length, 1);
assert.ok(!guided.details[0].startsWith(guided.headline));

const two = getReadNotice(
  { ...base, isServingsEstimate: true, servings: 12, isTimeEstimate: true },
  [],
);
assert.equal(two.headline, 'Filled in and finished for you');
assert.equal(two.details.length, 2);
assert.ok(two.details.length <= MAX_DIRECT_NOTICE_DETAILS);
assert.ok(two.details[0].includes('12'));

const four = getReadNotice(
  {
    ...base,
    isServingsEstimate: true,
    isTimeEstimate: true,
    isCareEstimate: true,
    unread: ['the photo'],
  },
  [{ name: 'Flour', ingredientName: 'Bread flour' }],
);
assert.equal(four.details.length, 5);
assert.ok(four.details.length > MAX_DIRECT_NOTICE_DETAILS);
assert.ok(four.details.some((d) => d.includes('Bread flour for flour')));
assert.equal(new Set(four.details).size, four.details.length);

console.log('pinch read notice: ok');

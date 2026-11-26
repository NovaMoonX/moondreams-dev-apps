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
  finished: [],
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

const finishedBase = {
  ...base,
  finished: ['added a step to melt the butter', 'raised prep to 25 minutes'],
};
const finished = getReadNotice(finishedBase, []);
assert.equal(finished.headline, 'Finished like a cookbook');
assert.deepEqual(finished.details, [
  'Added a step to melt the butter.',
  'Raised prep to 25 minutes.',
]);
assert.ok(finished.details.length <= MAX_DIRECT_NOTICE_DETAILS);
assert.equal(
  finished.footer,
  'Want only what you gave it? Turn off Finish recipes like a cookbook in Settings.',
);
assert.equal(plain.footer, null);
assert.equal(four.footer, null);

const followed = getReadNotice(
  { ...finishedBase, guided: ['a shorter title'] },
  [],
);
assert.equal(followed.headline, 'We followed your notes');
assert.ok(followed.footer !== null);

const merged = getReadNotice(
  {
    ...finishedBase,
    finished: [...finishedBase.finished, 'estimated how long it keeps'],
    isTimeEstimate: true,
    isCareEstimate: true,
  },
  [],
);
assert.equal(merged.details.length, 3);
assert.ok(!merged.details.some((d) => d.startsWith('We estimated')));

const separate = getReadNotice(
  {
    ...base,
    finished: ['added a step to melt the butter'],
    isTimeEstimate: true,
    isCareEstimate: true,
  },
  [],
);
assert.equal(
  separate.details.filter((d) => d.startsWith('We estimated')).length,
  2,
  'estimates the finished list does not mention keep their own lines',
);
assert.ok(separate.details.length > MAX_DIRECT_NOTICE_DETAILS);

const strict = getReadNotice({ ...base, isTimeEstimate: true }, []);
assert.equal(strict.footer, null);

console.log('pinch read notice: ok');

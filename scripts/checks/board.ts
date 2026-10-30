import assert from 'node:assert/strict';

import { findOption, readAppName } from '../board/board.ts';

assert.equal(readAppName(['Next Steps', 'Runway (App)']), 'Runway');
assert.equal(
  readAppName(['A-List (App)']),
  'A-List',
  "keeps the name's punctuation",
);
assert.equal(readAppName(['Next Steps']), null, 'no app label, no app');
assert.equal(
  readAppName(['Runway (App)', 'Pinch (App)']),
  null,
  'two app labels can not fill one Apps value',
);

const apps = {
  id: 'f',
  name: 'Apps',
  options: [
    { id: '1', name: 'Runway' },
    { id: '2', name: 'Nine Lives' },
  ],
};
assert.equal(findOption(apps, 'runway')?.id, '1');
assert.equal(findOption(apps, ' Nine Lives ')?.id, '2');
assert.equal(findOption(apps, 'Pinch'), null);
assert.equal(findOption(undefined, 'Runway'), null);

console.log('board: ok');

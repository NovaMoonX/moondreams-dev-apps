import assert from 'node:assert/strict';

import {
  readWhoTier,
  type WhoTierInput,
} from '../../src/apps/helm/engine/whoTier.ts';

const base: WhoTierInput = {
  tier: 'passing',
  tierSetBy: 'nomos',
  mentionDayKeys: ['2026-11-10'],
  taskLinkCount: 0,
  hasRole: false,
};

assert.equal(readWhoTier(base), 'passing', 'a name that comes up once');
assert.equal(
  readWhoTier({
    ...base,
    mentionDayKeys: ['2026-11-10', '2026-11-10', '2026-11-10'],
  }),
  'passing',
  'three captures on one day',
);
assert.equal(
  readWhoTier({
    ...base,
    mentionDayKeys: ['2026-11-10', '2026-11-10', '2026-11-11'],
  }),
  'regular',
  'three captures over two days',
);
assert.equal(
  readWhoTier({ ...base, mentionDayKeys: ['2026-11-10', '2026-11-11'] }),
  'passing',
  'two captures over two days',
);
assert.equal(readWhoTier({ ...base, taskLinkCount: 1 }), 'regular');
assert.equal(readWhoTier({ ...base, hasRole: true }), 'regular', 'a role later');
assert.equal(
  readWhoTier({ ...base, tierSetBy: 'person', taskLinkCount: 4 }),
  'passing',
  'a tier the person set stays',
);
assert.equal(
  readWhoTier({ ...base, tier: 'close', hasRole: true }),
  'close',
  'close only moves by the person',
);
assert.equal(
  readWhoTier({ ...base, tier: 'regular', taskLinkCount: 0 }),
  'regular',
  'never demoted',
);
assert.notEqual(
  readWhoTier({ ...base, taskLinkCount: 9, hasRole: true }),
  'close',
);

console.log('check:helm-who-tier: tiers hold.');

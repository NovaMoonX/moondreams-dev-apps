import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  claimPath,
  DEFAULT_NOTIFY_HOUR,
  getDigestDay,
  readDigestSettings,
} from '../../functions/src/apps/runway/needsHomeDigestPlan.ts';
import { needsHomeBody } from '../../functions/src/apps/runway/notificationText.ts';

const source = readFileSync(
  new URL(
    '../../functions/src/apps/runway/notificationText.ts',
    import.meta.url,
  ),
  'utf8',
);

// Text: the only interpolation allowed is the count.
const holes = [...source.matchAll(/\$\{([^}]*)\}/g)].map((match) =>
  match[1].trim(),
);
assert.deepEqual(
  holes.filter((hole) => hole !== 'count'),
  [],
  'a push template interpolates something other than the count',
);
assert.ok(
  !/\b(amount|cents|merchant|name|note|memo|payee|sealed)\b/i.test(
    source.replace(/\/\*\*[\s\S]*?\*\//g, ''),
  ),
  'notificationText.ts reads a field named like a sealed field',
);
assert.equal(needsHomeBody(1), '1 purchase needs a home');
assert.equal(needsHomeBody(4), '4 purchases need a home');

// Decision: hour match, UTC fallback, default hour, date roll-over.
const at = (iso: string) => Date.parse(iso);
const utc19 = at('2026-03-10T19:10:00Z');
assert.equal(DEFAULT_NOTIFY_HOUR, 19);
assert.deepEqual(readDigestSettings({}), { hour: 19, zone: null });
assert.deepEqual(
  readDigestSettings({ notifyHour: 7, notifyTimeZone: 'Asia/Tokyo' }),
  { hour: 7, zone: 'Asia/Tokyo' },
);
assert.equal(readDigestSettings({ notifyHour: 24 }).hour, 19);
assert.equal(readDigestSettings({ notifyHour: 7.5 }).hour, 19);
assert.equal(getDigestDay(utc19, readDigestSettings({})), '2026-03-10');
assert.equal(
  getDigestDay(at('2026-03-10T18:59:00Z'), readDigestSettings({})),
  null,
);
assert.equal(
  getDigestDay(utc19, { hour: 19, zone: 'Not/AZone' }),
  '2026-03-10',
);
const tokyo = { hour: 8, zone: 'Asia/Tokyo' };
assert.equal(getDigestDay(at('2026-03-10T23:30:00Z'), tokyo), '2026-03-11');
assert.equal(getDigestDay(at('2026-03-10T22:30:00Z'), tokyo), null);
const la = { hour: 19, zone: 'America/Los_Angeles' };
assert.equal(getDigestDay(at('2026-03-11T02:10:00Z'), la), '2026-03-10');
assert.equal(
  claimPath('u1', '2026-03-10'),
  'apps/runway/server/u1/notified/needsHome_2026-03-10',
);

console.log('runwayNotifyText: ok');

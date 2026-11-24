import assert from 'node:assert/strict';

import {
  getFirstEncounterMark,
  getUnseenNotes,
  getVisibleNotes,
  groupByMonth,
  groupByVersion,
  rollUp,
  shouldPopUp,
  type WhatsNewContext,
} from '../../src/lib/whatsNew/whatsNew.ts';
import type {
  WhatsNewKind,
  WhatsNewNote,
} from '../../src/lib/whatsNew/whatsNewTypes.ts';

let counter = 0;
const note = (
  version: string,
  kind: WhatsNewKind,
  extra: Partial<WhatsNewNote> = {},
): WhatsNewNote => {
  counter += 1;
  return {
    id: `n-${counter}`,
    app: 'runway',
    kind,
    text: `Note ${counter}`,
    path: null,
    gate: null,
    audience: 'everyone',
    version,
    publishedAt: Date.UTC(2026, 10, 1) + counter * 1000,
    ...extra,
  };
};

const context = (extra: Partial<WhatsNewContext> = {}): WhatsNewContext => ({
  scope: 'runway',
  runningVersion: '1.182.0',
  isDebug: false,
  isGateOpen: () => true,
  ...extra,
});

const ids = (notes: WhatsNewNote[]) => notes.map((n) => n.id);

// A version the person doesn't have yet never shows; a local build has them all.
const future = note('1.183.0', 'new');
const current = note('1.182.0', 'new');
const older = note('1.9.0', 'improved');
assert.deepEqual(ids(getVisibleNotes([future, current, older], context())), [
  current.id,
  older.id,
]);
assert.deepEqual(
  ids(
    getVisibleNotes(
      [future, current, older],
      context({ runningVersion: 'dev' }),
    ),
  ),
  [future.id, current.id, older.id],
);

// Other scopes, debug-only notes and closed gates stay out.
const siteNote = note('1.180.0', 'new', { app: 'site' });
const debugNote = note('1.181.0', 'fixed', { audience: 'debug' });
const gated = note('1.181.0', 'new', { gate: 'beta' });
assert.deepEqual(ids(getVisibleNotes([siteNote], context())), []);
assert.deepEqual(ids(getVisibleNotes([siteNote], context({ scope: 'site' }))), [
  siteNote.id,
]);
assert.deepEqual(ids(getVisibleNotes([debugNote], context())), []);
assert.deepEqual(
  ids(getVisibleNotes([debugNote], context({ isDebug: true }))),
  [debugNote.id],
);
assert.deepEqual(
  ids(getVisibleNotes([gated], context({ isGateOpen: () => false }))),
  [],
);
assert.deepEqual(ids(getVisibleNotes([gated], context())), [gated.id]);

// Unseen is everything above the person's mark; no mark yet means nothing is shown.
const visible = getVisibleNotes(
  [current, older, debugNote],
  context({ isDebug: true }),
);
assert.deepEqual(ids(getUnseenNotes(visible, '1.181.0')), [current.id]);
assert.deepEqual(ids(getUnseenNotes(visible, '1.182.0')), []);
assert.deepEqual(getUnseenNotes(visible, null), []);

// First encounter marks the newest release of the scope the person has, or the running one when there are none,
// whatever a note's audience or gate: those load after the feed, so a debug viewer must not get a pop-up on a first run.
const mark = (notes: WhatsNewNote[], extra: Partial<WhatsNewContext> = {}) =>
  getFirstEncounterMark(notes, { ...context(), ...extra });
assert.equal(mark([future, current, older, debugNote]), '1.182.0');
assert.equal(mark([older]), '1.182.0');
assert.equal(mark([]), '1.182.0');
assert.equal(mark([], { runningVersion: 'dev' }), null);
assert.equal(mark([siteNote]), '1.182.0');
assert.equal(mark([debugNote, older]), '1.182.0');
assert.equal(mark([gated, older]), '1.182.0');
assert.equal(mark([older, siteNote], { runningVersion: 'dev' }), '1.9.0');
assert.equal(mark([future, current], { runningVersion: '1.9.0' }), '1.9.0');

// A fix-only update pops up only for a debug viewer who hasn't switched it off.
const fixes = [note('1.182.0', 'fixed'), note('1.181.0', 'fixed')];
const mixed = [...fixes, note('1.182.0', 'improved')];
const everyone = { isDebug: false, showFixOnly: null };
assert.equal(shouldPopUp(fixes, everyone), false);
assert.equal(shouldPopUp(fixes, { isDebug: true, showFixOnly: null }), true);
assert.equal(shouldPopUp(fixes, { isDebug: true, showFixOnly: true }), true);
assert.equal(shouldPopUp(fixes, { isDebug: true, showFixOnly: false }), false);
assert.equal(shouldPopUp(mixed, everyone), true);
assert.equal(shouldPopUp(mixed, { isDebug: true, showFixOnly: false }), true);
assert.equal(shouldPopUp([], { isDebug: true, showFixOnly: null }), false);

// The roll-up keeps five highlights (new before improved, newest first), counts the rest and the fixes.
const many = [
  ...Array.from({ length: 4 }, (_, i) => note(`1.1${i}.0`, 'improved')),
  ...Array.from({ length: 5 }, (_, i) => note(`1.2${i}.0`, 'new')),
  ...Array.from({ length: 3 }, () => note('1.150.0', 'fixed')),
];
const rolled = rollUp(many);
assert.equal(rolled.highlights.length, 5);
assert.equal(rolled.moreHighlights.length, 4);
assert.equal(rolled.fixes.length, 3);
assert.ok(rolled.highlights.every((n) => n.kind === 'new'));
assert.deepEqual(
  rolled.highlights.map((n) => n.version),
  ['1.24.0', '1.23.0', '1.22.0', '1.21.0', '1.20.0'],
);
assert.equal(rolled.moreHighlights[0].kind, 'improved');
assert.equal(rolled.sinceAt, Math.min(...many.map((n) => n.publishedAt)));
assert.equal(rollUp([]).sinceAt, null);

// The log groups by version, newest first, with new before improved before fixed inside.
const logged = groupByVersion([
  note('1.9.0', 'fixed'),
  note('1.10.0', 'fixed'),
  note('1.10.0', 'new'),
  note('1.10.0', 'improved'),
]);
assert.deepEqual(
  logged.map((g) => g.version),
  ['1.10.0', '1.9.0'],
);
assert.deepEqual(
  logged[0].notes.map((n) => n.kind),
  ['new', 'improved', 'fixed'],
);

// History groups by month, newest first, fixes apart from highlights.
const months = groupByMonth([
  note('1.1.0', 'new', { publishedAt: new Date(2026, 8, 15).getTime() }),
  note('1.2.0', 'fixed', { publishedAt: new Date(2026, 10, 5).getTime() }),
  note('1.2.0', 'new', { publishedAt: new Date(2026, 10, 6).getTime() }),
]);
assert.deepEqual(
  months.map((m) => m.key),
  ['2026-11', '2026-09'],
);
assert.equal(months[0].highlights.length, 1);
assert.equal(months[0].fixes.length, 1);

console.log('check:whats-new-logic passed');

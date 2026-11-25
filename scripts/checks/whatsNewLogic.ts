import assert from 'node:assert/strict';

import { readNote } from '../../src/lib/whatsNew/whatsNewQueries.ts';
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
    isTold: kind !== 'fixed',
    emoji: null,
    replaces: [],
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

// Only a told note pops up; a listed-only release stays quiet for everyone but a debug viewer who hasn't switched it off.
const fixes = [note('1.182.0', 'fixed'), note('1.181.0', 'fixed')];
const mixed = [...fixes, note('1.182.0', 'improved')];
const listed = [note('1.182.0', 'improved', { isTold: false }), ...fixes];
const everyone = { isDebug: false, showFixOnly: null };
assert.equal(shouldPopUp(fixes, everyone), false);
assert.equal(shouldPopUp(fixes, { isDebug: true, showFixOnly: null }), true);
assert.equal(shouldPopUp(fixes, { isDebug: true, showFixOnly: true }), true);
assert.equal(shouldPopUp(fixes, { isDebug: true, showFixOnly: false }), false);
assert.equal(shouldPopUp(mixed, everyone), true);
assert.equal(shouldPopUp(mixed, { isDebug: true, showFixOnly: false }), true);
assert.equal(shouldPopUp(listed, everyone), false);
assert.equal(shouldPopUp(listed, { isDebug: false, showFixOnly: true }), false);
assert.equal(shouldPopUp(listed, { isDebug: true, showFixOnly: true }), true);
assert.equal(shouldPopUp(listed, { isDebug: true, showFixOnly: false }), false);
assert.equal(shouldPopUp([], { isDebug: true, showFixOnly: null }), false);

// A replaced note is hidden from a regular viewer and kept for a debug viewer.
const oldNote = note('1.100.0', 'new');
const newNote = note('1.182.0', 'improved', { replaces: [oldNote.id] });
assert.deepEqual(ids(getVisibleNotes([oldNote, newNote], context())), [
  newNote.id,
]);
assert.deepEqual(
  ids(getVisibleNotes([oldNote, newNote], context({ isDebug: true }))),
  [newNote.id, oldNote.id],
);

// An old feed note without the new fields reads as told unless it is a fix.
const feedNote = {
  app: 'runway',
  kind: 'new',
  text: 'Old line',
  version: '1.1.0',
  audience: 'everyone',
  publishedAt: 1,
};
assert.deepEqual(
  (({ isTold, emoji, replaces }) => ({ isTold, emoji, replaces }))(
    readNote('a', feedNote)!,
  ),
  { isTold: true, emoji: null, replaces: [] },
);
assert.equal(readNote('b', { ...feedNote, kind: 'fixed' })!.isTold, false);
assert.equal(readNote('c', { ...feedNote, isTold: 'yes' }), null);

// The roll-up keeps five told notes (new before improved, newest first), then the rest, the listed ones and the fixes.
const many = [
  ...Array.from({ length: 4 }, (_, i) => note(`1.1${i}.0`, 'improved')),
  ...Array.from({ length: 5 }, (_, i) => note(`1.2${i}.0`, 'new')),
  ...Array.from({ length: 2 }, () =>
    note('1.130.0', 'improved', { isTold: false }),
  ),
  ...Array.from({ length: 3 }, () => note('1.150.0', 'fixed')),
];
const rolled = rollUp(many);
assert.equal(rolled.told.length, 5);
assert.equal(rolled.moreTold.length, 4);
assert.equal(rolled.smaller.length, 2);
assert.equal(rolled.fixes.length, 3);
assert.equal(rolled.total, many.length);
assert.ok(rolled.told.every((n) => n.kind === 'new'));
assert.deepEqual(
  rolled.told.map((n) => n.version),
  ['1.24.0', '1.23.0', '1.22.0', '1.21.0', '1.20.0'],
);
assert.equal(rolled.moreTold[0].kind, 'improved');
assert.equal(rolled.sinceAt, Math.min(...many.map((n) => n.publishedAt)));
assert.equal(rollUp([]).sinceAt, null);
assert.equal(rollUp([]).total, 0);

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

// History groups by month, newest first, with told, listed and fixes apart.
const months = groupByMonth([
  note('1.1.0', 'new', { publishedAt: new Date(2026, 8, 15).getTime() }),
  note('1.2.0', 'fixed', { publishedAt: new Date(2026, 10, 5).getTime() }),
  note('1.2.0', 'new', { publishedAt: new Date(2026, 10, 6).getTime() }),
  note('1.2.0', 'improved', {
    isTold: false,
    publishedAt: new Date(2026, 10, 7).getTime(),
  }),
]);
assert.deepEqual(
  months.map((m) => m.key),
  ['2026-11', '2026-09'],
);
assert.equal(months[0].told.length, 1);
assert.equal(months[0].smaller.length, 1);
assert.equal(months[0].fixes.length, 1);

console.log('check:whats-new-logic passed');

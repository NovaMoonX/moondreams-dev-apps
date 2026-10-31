import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MAP_NODES, OFF_MAP } from '../../src/screens/admin/pipelineMap.ts';

// The step table in pipeline.md is the pipeline's index; the dashboard's map must account for every row.
const doc = readFileSync('docs/conventions/pipeline.md', 'utf8');
const tableLines = doc
  .slice(doc.indexOf('| Step |'))
  .split('\n')
  .slice(2)
  .filter((line, index, lines) =>
    lines.slice(0, index + 1).every((l) => l.startsWith('|')),
  );
const steps = tableLines.map((line) => line.split('|')[1].trim());
assert.ok(
  steps.length > 5,
  'Could not read the step table in docs/conventions/pipeline.md',
);

const covered = MAP_NODES.flatMap((node) => node.covers ?? []);
const placed = [...covered, ...Object.keys(OFF_MAP)];

const missing = steps.filter((step) => !placed.includes(step));
assert.deepEqual(
  missing,
  [],
  `pipeline.md has steps the dashboard map doesn't draw: ${missing.join(', ')}. Add each to a node's covers in src/screens/admin/pipelineMap.ts, or to OFF_MAP with why.`,
);
const stale = placed.filter((step) => !steps.includes(step));
assert.deepEqual(
  stale,
  [],
  `src/screens/admin/pipelineMap.ts names steps pipeline.md no longer has: ${stale.join(', ')}. If they are still in the table, a non-table line inside it cut the table short.`,
);

const settings = readFileSync('.claude/settings.json', 'utf8');
const table = tableLines.join('\n');
const hooks = [...new Set(settings.match(/hooks\/[\w-]+\.sh/g) ?? [])];
const unlisted = hooks.filter(
  (hook) => !table.includes(hook.replace('hooks/', '')),
);
assert.deepEqual(
  unlisted,
  [],
  `Hooks in .claude/settings.json missing from pipeline.md's step table: ${unlisted.join(', ')}.`,
);

console.log(`Pipeline map OK: ${steps.length} steps, ${hooks.length} hooks.`);

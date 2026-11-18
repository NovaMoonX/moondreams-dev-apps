// Fails when a Message Batch is used outside the one layer: `npm run check:batch-jobs`.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { BATCH_JOBS } from '../../functions/src/apps/helm/batchJobs.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const LAYER = 'functions/src/ai/batch.ts';

const findFiles = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? findFiles(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : [],
  );

const findProblems = (files: Record<string, string>) =>
  Object.entries(files)
    .filter(
      ([path, text]) => path !== LAYER && /\bmessages\.batches\b/.test(text),
    )
    .map(([path]) => `${path}: calls messages.batches outside ${LAYER}`);

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

test('the code as written passes', () => {
  const files = Object.fromEntries(
    findFiles('functions/src').map((path) => [
      path,
      readFileSync(join(ROOT, path), 'utf8'),
    ]),
  );
  assert.deepEqual(findProblems(files), []);
});
test('a messages.batches call outside the layer fails', () => {
  const problems = findProblems({
    'functions/src/x.ts': 'client.messages.batches.create({})',
  });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes('outside'));
});
test('the layer itself may call it', () => {
  assert.deepEqual(
    findProblems({ [LAYER]: 'client.messages.batches.create({})' }),
    [],
  );
});

test('every registered job answers all seven questions', () => {
  Object.entries(BATCH_JOBS).forEach(([key, job]) => {
    const { answers } = job;
    assert.equal(job.jobId, key);
    assert.deepEqual(
      Object.entries(answers)
        .filter(([name]) => name !== 'terms')
        .filter(([, value]) => value !== true),
      [],
      key,
    );
    assert.equal(answers.terms, 'standard', key);
    assert.ok(['runAtOnce', 'answerAtOnce'].includes(job.whenWantedNow), key);
    assert.equal(Object.keys(answers).length, 7, key);
  });
});

tests.forEach(([name, run]) => {
  run();
  console.log(`ok  ${name}`);
});

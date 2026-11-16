// Fails when a Message Batch is used outside the one layer, or a registered job breaks the batch test.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  BATCH_JOBS,
  type BatchJobSpec,
} from '../../functions/src/ai/batchJobs.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const LAYER = 'functions/src/ai/batches.ts';

const findFiles = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? findFiles(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : [],
  );

function findProblems(
  files: Record<string, string>,
  jobs: Record<string, Partial<BatchJobSpec>>,
) {
  const fileProblems = Object.entries(files).flatMap(([path, text]) => [
    ...(path !== LAYER && /\bmessages\.batches\b/.test(text)
      ? [`${path}: calls messages.batches outside ${LAYER}`]
      : []),
    ...[...text.matchAll(/submitBatch\([^;]*?jobId:\s*['"]([^'"]+)['"]/gs)]
      .map((found) => found[1])
      .filter((id) => !Object.hasOwn(jobs, id))
      .map((id) => `${path}: submitBatch with unregistered job ${id}`),
  ]);
  const jobProblems = Object.entries(jobs).flatMap(([id, job]) => [
    ...((job.maxWaitHours ?? Infinity) > 24
      ? [`${id}: maxWaitHours is above 24`]
      : []),
    ...((job.maxContinuations ?? Infinity) > 2
      ? [`${id}: maxContinuations is above 2`]
      : []),
    ...(job.deleteAfterCollect !== true
      ? [`${id}: deleteAfterCollect must be true`]
      : []),
    ...(!job.whenWantedNow ? [`${id}: whenWantedNow is missing`] : []),
    ...(!job.terms?.includes('standard')
      ? [`${id}: terms must include standard`]
      : []),
  ]);
  return [...fileProblems, ...jobProblems];
}

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const GOOD = BATCH_JOBS.reflect;
const expectOne = (
  files: Record<string, string>,
  jobs: Record<string, Partial<BatchJobSpec>>,
  part: string,
) => {
  const problems = findProblems(files, jobs);
  assert.equal(problems.length, 1, problems.join('; '));
  assert.ok(problems[0].includes(part), problems[0]);
};

test('the registry as written passes', () => {
  const files = Object.fromEntries(
    findFiles('functions/src').map((path) => [
      path,
      readFileSync(join(ROOT, path), 'utf8'),
    ]),
  );
  assert.deepEqual(findProblems(files, BATCH_JOBS), []);
});
test('a messages.batches call outside the layer fails', () => {
  expectOne(
    { 'functions/src/x.ts': 'client.messages.batches.create({})' },
    { reflect: GOOD },
    'outside',
  );
});
test('the layer itself may call it', () => {
  assert.deepEqual(
    findProblems(
      { [LAYER]: 'client.messages.batches.create({})' },
      { reflect: GOOD },
    ),
    [],
  );
});
test('an unregistered job id fails', () => {
  expectOne(
    {
      'functions/src/x.ts':
        "await submitBatch(client, {\n jobId: 'other',\n requests })",
    },
    { reflect: GOOD },
    'unregistered',
  );
});
test('a registered job id passes', () => {
  assert.deepEqual(
    findProblems(
      {
        'functions/src/x.ts':
          "submitBatch(client, { jobId: 'reflect', requests })",
      },
      { reflect: GOOD },
    ),
    [],
  );
});
test('a wait over 24 hours fails', () => {
  expectOne({}, { reflect: { ...GOOD, maxWaitHours: 25 } }, 'maxWaitHours');
});
test('more than two continuations fails', () => {
  expectOne(
    {},
    { reflect: { ...GOOD, maxContinuations: 3 } },
    'maxContinuations',
  );
});
test('keeping the batch at the provider fails', () => {
  expectOne(
    {},
    { reflect: { ...GOOD, deleteAfterCollect: false } },
    'deleteAfterCollect',
  );
});
test('a job without whenWantedNow fails', () => {
  expectOne(
    {},
    { reflect: { ...GOOD, whenWantedNow: undefined } },
    'whenWantedNow',
  );
});
test('a job without the standard terms fails', () => {
  expectOne({}, { reflect: { ...GOOD, terms: [] } }, 'standard');
});

tests.forEach(([name, run]) => {
  run();
  console.log(`ok  ${name}`);
});

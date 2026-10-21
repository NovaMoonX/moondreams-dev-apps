import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const REGION = 'us-central1';
const PROJECT_ID = (
  JSON.parse(readFileSync('.firebaserc', 'utf8')) as {
    projects: { default: string };
  }
).projects.default;

const callables = Array.from(
  readFileSync('functions/src/index.ts', 'utf8').matchAll(
    /^export \{ (\w+) \} from '\.\/([^']+)\.js';$/gm,
  ),
  ([, name, path]) => ({
    name,
    source: readFileSync(`functions/src/${path}.ts`, 'utf8'),
  }),
)
  .filter(({ source }) => source.includes('onCall('))
  .map(({ name }) => name);

const args = process.argv.slice(2);
const isDry = args.includes('--dry');
const isAll = args.includes('--all');
const requested = args.filter((arg) => !arg.startsWith('--'));
const findCallable = (arg: string) =>
  callables.find((name) => name.toLowerCase() === arg.toLowerCase());
const unknown = requested.filter((arg) => findCallable(arg) === undefined);

if ((requested.length === 0 && !isAll) || unknown.length > 0) {
  if (unknown.length > 0) {
    console.error(
      `Not a callable function: ${unknown.join(', ')}. A scheduled or trigger function keeps its IAM check.`,
    );
  }
  console.log(
    `Usage: npm run fb:invoker -- <function> [<function> …] | --all [--dry]\nCallable functions: ${callables.join(', ')}`,
  );
  process.exit(unknown.length > 0 ? 1 : 0);
}

const allow = (name: string) => {
  const command = [
    'run',
    'services',
    'update',
    name.toLowerCase(),
    '--no-invoker-iam-check',
    `--region=${REGION}`,
    `--project=${PROJECT_ID}`,
  ];
  if (isDry) {
    console.log(`gcloud ${command.join(' ')}`);
    return true;
  }
  try {
    execFileSync('gcloud', command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    const isMissing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    console.error(
      isMissing
        ? '✗ gcloud is not installed or not on your PATH.'
        : `✗ ${name} failed.`,
    );
    return false;
  }
};

const names = isAll
  ? callables
  : Array.from(new Set(requested.flatMap((arg) => findCallable(arg) ?? [])));
const failed = names.filter((name) => !allow(name));

console.log(
  failed.length === 0
    ? `✅ ${isDry ? 'Would allow' : 'Allowed'} public invocation for ${names.join(', ')}.`
    : `❌ Failed for ${failed.join(', ')}.`,
);
process.exit(failed.length === 0 ? 0 : 1);

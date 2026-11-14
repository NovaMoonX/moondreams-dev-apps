import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const REGION = 'us-central1';
const PROJECT_ID = (
  JSON.parse(readFileSync('.firebaserc', 'utf8')) as {
    projects: { default: string };
  }
).projects.default;

const exportLines = readFileSync('functions/src/index.ts', 'utf8')
  .split('\n')
  .filter((line) => line.startsWith('export'));
const exported = exportLines.flatMap((line) => {
  const match = /^export \{ (\w+) \} from '\.\/([^']+)\.js';$/.exec(line);
  return match ? [{ name: match[1], path: match[2] }] : [];
});

if (exported.length !== exportLines.length) {
  console.error(
    "functions/src/index.ts has an export this script can't read, so it can't tell which functions are callable. Keep one `export { name } from './path.js';` per line.",
  );
  process.exit(1);
}

const callables = exported
  .filter(({ path }) =>
    /\bonCall\s*[<(]/.test(readFileSync(`functions/src/${path}.ts`, 'utf8')),
  )
  .map(({ name }) => name);

// An HTTPS endpoint called with no Google identity. Each one checks its caller itself (a provider's signature, a signed-in token) and answers 401 to anything else.
const PUBLIC_WEBHOOKS = ['runwayPlaidWebhook', 'streamSpeech', 'helmMcp'];
const webhooks = PUBLIC_WEBHOOKS.map((name) => {
  const source = exported.find((entry) => entry.name === name);
  const isRequest =
    source !== undefined &&
    /\bonRequest\s*\(/.test(
      readFileSync(`functions/src/${source.path}.ts`, 'utf8'),
    );
  if (!isRequest) {
    console.error(
      `${name} is listed as a public webhook but is not an exported onRequest function.`,
    );
    process.exit(1);
  }
  return name;
});
const openable = [...callables, ...webhooks];

if (callables.length === 0) {
  console.error('No callable functions found in functions/src/index.ts.');
  process.exit(1);
}

const args = process.argv.slice(2);
const isDry = args.includes('--dry');
const isAll = args.includes('--all');
const unknownFlags = args.filter(
  (arg) => arg.startsWith('--') && arg !== '--dry' && arg !== '--all',
);
const requested = args.filter((arg) => !arg.startsWith('--'));
const findCallable = (arg: string) =>
  openable.find((name) => name.toLowerCase() === arg.toLowerCase());
const unknown = requested.filter((arg) => findCallable(arg) === undefined);
const problems = [
  ...unknownFlags.map((flag) => `Unknown option: ${flag}.`),
  ...(isAll && requested.length > 0
    ? ['Give function names or --all, not both.']
    : []),
  ...(unknown.length > 0
    ? [
        `Not a callable function or a public webhook: ${unknown.join(', ')}. A scheduled or trigger function keeps its IAM check.`,
      ]
    : []),
];

if (problems.length > 0 || (requested.length === 0 && !isAll)) {
  problems.forEach((problem) => console.error(problem));
  console.log(
    `Usage: npm run fb:invoker -- <function> [<function> …] | --all [--dry]\nCallable functions: ${callables.join(', ')}\nPublic webhooks: ${webhooks.join(', ')}`,
  );
  process.exit(problems.length > 0 ? 1 : 0);
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
  ? openable
  : Array.from(new Set(requested.flatMap((arg) => findCallable(arg) ?? [])));
const failed = names.filter((name) => !allow(name));

console.log(
  failed.length === 0
    ? `✅ ${isDry ? 'Would allow' : 'Allowed'} public invocation for ${names.join(', ')}.`
    : `❌ Failed for ${failed.join(', ')}.`,
);
process.exit(failed.length === 0 ? 0 : 1);

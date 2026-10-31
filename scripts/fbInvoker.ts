import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const REGION = 'us-central1';
const PROJECT_ID = (
  JSON.parse(readFileSync('.firebaserc', 'utf8')) as {
    projects: { default: string };
  }
).projects.default;

const indexSource = readFileSync('functions/src/index.ts', 'utf8');
const exportStatements = indexSource.match(/^export\b[^;]*;/gm) ?? [];
const exported = exportStatements.flatMap((statement) => {
  const match = /^export\s*\{([^}]*)\}\s*from\s*'\.\/([^']+)\.js';$/.exec(
    statement,
  );
  if (!match) return [];
  const names = match[1]
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return names.every((name) => /^\w+$/.test(name))
    ? [{ names, path: match[2] }]
    : [];
});

if (exported.length !== exportStatements.length) {
  console.error(
    "functions/src/index.ts has an export this script can't read, so it can't tell which functions are callable. Keep each one as `export { name, other } from './path.js';`.",
  );
  process.exit(1);
}

const isCallableIn = (source: string, name: string) =>
  new RegExp(`\\bexport\\s+const\\s+${name}\\s*=\\s*onCall\\s*[<(]`).test(
    source,
  );

const callables = exported.flatMap(({ names, path }) => {
  const source = readFileSync(`functions/src/${path}.ts`, 'utf8');
  return names.filter((name) => isCallableIn(source, name));
});

if (callables.length === 0) {
  console.error('No callable functions found in functions/src/index.ts.');
  process.exit(1);
}

const args = process.argv.slice(2);
const isDry = args.includes('--dry');
const isAll = args.includes('--all');
const isMissing = args.includes('--missing');
const FLAGS = ['--dry', '--all', '--missing'];
const unknownFlags = args.filter(
  (arg) => arg.startsWith('--') && !FLAGS.includes(arg),
);
const requested = args.filter((arg) => !arg.startsWith('--'));
const findCallable = (arg: string) =>
  callables.find((name) => name.toLowerCase() === arg.toLowerCase());
const unknown = requested.filter((arg) => findCallable(arg) === undefined);
const problems = [
  ...unknownFlags.map((flag) => `Unknown option: ${flag}.`),
  ...((isAll ? 1 : 0) + (isMissing ? 1 : 0) + (requested.length > 0 ? 1 : 0) > 1
    ? ['Give function names, --all or --missing, only one of them.']
    : []),
  ...(unknown.length > 0
    ? [
        `Not a callable function: ${unknown.join(', ')}. A scheduled or trigger function keeps its IAM check.`,
      ]
    : []),
];

if (problems.length > 0 || (requested.length === 0 && !isAll && !isMissing)) {
  problems.forEach((problem) => console.error(problem));
  console.log(
    `Usage: npm run fb:invoker -- <function> [<function> …] | --all | --missing [--dry]\nCallable functions: ${callables.join(', ')}`,
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

interface RunService {
  metadata: { name: string; annotations?: Record<string, string> };
}

// `--no-invoker-iam-check` records itself as this annotation on the service.
const isOpen = (service: RunService) =>
  service.metadata.annotations?.['run.googleapis.com/invoker-iam-disabled'] ===
  'true';

const listPrivateCallables = () => {
  const services = JSON.parse(
    execFileSync('gcloud', [
      'run',
      'services',
      'list',
      `--region=${REGION}`,
      `--project=${PROJECT_ID}`,
      '--format=json',
    ]).toString(),
  ) as RunService[];
  const openNames = new Set(
    services.filter(isOpen).map((service) => service.metadata.name),
  );
  return callables.filter((name) => !openNames.has(name.toLowerCase()));
};

const getNames = () => {
  if (isAll) return callables;
  if (isMissing) return listPrivateCallables();
  return Array.from(
    new Set(requested.flatMap((arg) => findCallable(arg) ?? [])),
  );
};

const names = getNames();
if (names.length === 0) {
  console.log('✅ Every callable is already public.');
  process.exit(0);
}
const failed = names.filter((name) => !allow(name));

console.log(
  failed.length === 0
    ? `✅ ${isDry ? 'Would allow' : 'Allowed'} public invocation for ${names.join(', ')}.`
    : `❌ Failed for ${failed.join(', ')}.`,
);
process.exit(failed.length === 0 ? 0 : 1);

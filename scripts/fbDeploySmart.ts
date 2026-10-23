import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const targets: string[] = [];

if (existsSync('functions')) {
  execSync('npm ci', { cwd: 'functions', stdio: 'inherit' });
  execSync('npm run build', { cwd: 'functions', stdio: 'inherit' });
  targets.push('functions');
}

if (existsSync('database.rules.json')) {
  targets.push('database');
}

if (existsSync('firestore.rules')) {
  targets.push('firestore:rules');
}

if (existsSync('firestore.indexes.json')) {
  targets.push('firestore:indexes');
}

if (existsSync('storage.rules')) {
  targets.push('storage');
}

if (targets.length === 0) {
  console.log('No Firebase deploy targets found; skipping deploy.');
  process.exit(0);
}

// The CLI grants every new callable public access, which the organization policy refuses; only its output says so.
const INVOKER_FAILURES = [
  'Unable to set the invoker for the IAM policy',
  'Failed to set invoker function',
];

// The CLI swallows the real error of its release update and then tries to create the release, so only this follow-up shows; the cause is in its debug log.
const RELEASE_EXISTS = /Release projects\/\S+\/releases\/\S+ already exists/;
const RELEASE_RETRY_WAIT_MS = 20_000;

const printRulesLog = () => {
  try {
    const lines = readFileSync('firebase-debug.log', 'utf8')
      .split('\n')
      .filter((line) => /firebaserules|\[rules\]/i.test(line))
      .slice(-40);
    console.error(`\nThe rules lines of firebase-debug.log:\n${lines.join('\n')}`);
  } catch {
    console.error('\nfirebase-debug.log could not be read.');
  }
};

const deploy = () =>
  new Promise<{ code: number; output: string }>((resolve) => {
    const chunks: string[] = [];
    const child = spawn('firebase', ['deploy', '--only', targets.join(',')], {
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    const tee = (stream: NodeJS.WriteStream) => (chunk: Buffer) => {
      stream.write(chunk);
      chunks.push(chunk.toString());
    };
    child.stdout.on('data', tee(process.stdout));
    child.stderr.on('data', tee(process.stderr));
    child.on('error', (error) => {
      console.error(error.message);
      resolve({ code: 1, output: '' });
    });
    child.on('close', (code) =>
      resolve({ code: code ?? 1, output: chunks.join('') }),
    );
  });

const openCallables = () => {
  try {
    execSync('npm run fb:invoker -- --all', { stdio: 'inherit' });
    return true;
  } catch {
    console.error(
      "\nThe callables are still private, and running the deploy again won't change that because the functions now exist. Fix the error above, then run `npm run fb:invoker -- --all`.",
    );
    return false;
  }
};

const run = async () => {
  const first = await deploy();
  if (first.code === 0) return 0;
  if (RELEASE_EXISTS.test(first.output)) {
    printRulesLog();
    console.log(
      `\nThe rules release failed. Deploying once more in ${RELEASE_RETRY_WAIT_MS / 1000} seconds.\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, RELEASE_RETRY_WAIT_MS));
    const retry = await deploy();
    if (retry.code !== 0) printRulesLog();
    return retry.code;
  }
  if (!INVOKER_FAILURES.some((message) => first.output.includes(message))) {
    return first.code;
  }
  console.log(
    '\nA new callable could not be made public by the deploy. Opening every callable, then deploying once more.\n',
  );
  if (!openCallables()) return 1;
  const second = await deploy();
  return second.code;
};

process.exitCode = await run();

import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

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
  if (
    first.code === 0 ||
    !INVOKER_FAILURES.some((message) => first.output.includes(message))
  ) {
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

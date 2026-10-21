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
const INVOKER_FAILURE = 'Unable to set the invoker for the IAM policy';

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
    child.on('close', (code) =>
      resolve({ code: code ?? 1, output: chunks.join('') }),
    );
  });

const run = async () => {
  const first = await deploy();
  if (first.code === 0 || !first.output.includes(INVOKER_FAILURE)) {
    return first.code;
  }
  console.log(
    '\nA new callable could not be made public by the deploy. Opening every callable, then deploying once more.\n',
  );
  execSync('npm run fb:invoker -- --all', { stdio: 'inherit' });
  const second = await deploy();
  return second.code;
};

process.exit(await run());

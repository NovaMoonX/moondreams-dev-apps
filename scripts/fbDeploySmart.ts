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

// The CLI hides the error of its release update and then tries to create the release, so only this follow-up shows; the update is repeated here to read its answer.
const RELEASE_EXISTS = /Release projects\/\S+\/releases\/\S+ already exists/;
const RELEASE_RETRY_WAIT_MS = 20_000;
const RULES_API = 'https://firebaserules.googleapis.com/v1';

const probeRulesRelease = async () => {
  try {
    const project = (
      JSON.parse(readFileSync('.firebaserc', 'utf8')) as {
        projects: { default: string };
      }
    ).projects.default;
    const token = execSync('gcloud auth print-access-token').toString().trim();
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await fetch(`${RULES_API}/projects/${project}/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      console.error(
        `${method} ${path.split('?')[0]} -> ${response.status} ${text.slice(0, 600)}`,
      );
      if (text.includes('Total size of compiled executables')) {
        console.error(
          'The Firestore rules are too big once compiled. Run `npm run check:rules-size`, then shrink firestore.rules (README Troubleshooting).',
        );
      }
      return response.ok ? (JSON.parse(text) as Record<string, unknown>) : null;
    };
    const rulesets = await call('GET', 'rulesets?pageSize=5');
    const newest = (
      (rulesets?.rulesets ?? []) as { name: string; createTime: string }[]
    ).sort((x, y) => y.createTime.localeCompare(x.createTime))[0];
    await call('GET', 'releases/cloud.firestore');
    if (newest) {
      await call('PATCH', 'releases/cloud.firestore', {
        release: {
          name: `projects/${project}/releases/cloud.firestore`,
          rulesetName: newest.name,
        },
      });
    }
  } catch (error) {
    console.error('The rules release could not be probed.', error);
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
  // A callable a dropped or failed run left private stays private, since the CLI opens only new ones; opening is idempotent.
  if (first.code === 0) {
    if (!targets.includes('functions')) return 0;
    console.log('\nOpening every callable.\n');
    return openCallables() ? 0 : 1;
  }
  if (RELEASE_EXISTS.test(first.output)) {
    console.error(
      '\nThe rules release failed. Repeating its update to read the answer:\n',
    );
    await probeRulesRelease();
    console.log(
      `\nDeploying once more in ${RELEASE_RETRY_WAIT_MS / 1000} seconds.\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, RELEASE_RETRY_WAIT_MS));
    const retry = await deploy();
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

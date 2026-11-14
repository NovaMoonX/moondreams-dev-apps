import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

import { loadEnv } from 'vite';

import { APP_REGISTRY } from '../src/lib/app/app.registry.ts';

const VITE_URL = 'http://localhost:5173';
const AUTH_URL = 'http://127.0.0.1:9099';
const EMULATOR_READY_URLS = [
  'http://127.0.0.1:8080',
  AUTH_URL,
  'http://127.0.0.1:9000',
  'http://127.0.0.1:9199',
  'http://127.0.0.1:5001',
];

const isUp = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(3000) }).then(
    () => true,
    () => false,
  );

const areAllUp = (urls: string[]) =>
  Promise.all(urls.map(isUp)).then((states) => states.every(Boolean));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const pollUntilUp = async (urls: string[], seconds: number): Promise<void> => {
  if (await areAllUp(urls)) return;
  if (seconds <= 0) throw new Error(`${urls.join(', ')} never came up.`);
  await sleep(1000);
  return pollUntilUp(urls, seconds - 1);
};

interface Started {
  name: string;
  child: ChildProcess;
  exited: Promise<number>;
}

const started: Started[] = [];
let isStopping = false;

const waitForService = (
  { name, exited }: Started,
  urls: string[],
  seconds: number,
) =>
  Promise.race([
    pollUntilUp(urls, seconds),
    exited.then((code) => {
      throw new Error(
        `${name} stopped (exit code ${code}) before it was ready. Fix the error above (leftovers from an earlier run: npm run emulators:kill), then run the same command again.`,
      );
    }),
  ]);

const startService = (name: string, args: string[]) => {
  const child = spawn('npm', ['run', ...args], { stdio: 'inherit' });
  const service = {
    name,
    child,
    exited: new Promise<number>((resolve) =>
      child.on('exit', (code) => resolve(code ?? 1)),
    ),
  };
  started.push(service);
  console.log(`▶ Starting ${name}…`);
  return service;
};

const stopStarted = (signal: NodeJS.Signals) =>
  started.forEach(({ child }) => child.kill(signal));

const stopAndExit = async (signal: NodeJS.Signals) => {
  isStopping = true;
  // From a terminal, Ctrl+C has already reached every child.
  if (signal !== 'SIGINT' || !process.stdin.isTTY) stopStarted(signal);
  await Promise.all(started.map(({ exited }) => exited));
  process.exit(0);
};
process.on('SIGINT', () => void stopAndExit('SIGINT'));
process.on('SIGTERM', () => void stopAndExit('SIGTERM'));

const isEmulatorModeOn = () =>
  loadEnv('development', process.cwd(), 'VITE_').VITE_USE_FIREBASE_EMULATORS ===
  'true';

const isVite = (url: string) =>
  fetch(`${url}/@vite/client`, { signal: AbortSignal.timeout(3000) }).then(
    (response) => response.ok,
    () => false,
  );

const [target, ...flags] = process.argv.slice(2).filter(Boolean);
const isReset = flags.includes('--reset');
const isSkippingSeed = flags.includes('--no-seed');
const isOpening = !flags.includes('--no-open');
const unknownFlags = flags.filter(
  (flag) => !['--reset', '--no-seed', '--no-open'].includes(flag),
);
const app = APP_REGISTRY.find((entry) => entry.id === target);

if (!app || unknownFlags.length > 0) {
  console.error(
    `${unknownFlags.length > 0 ? `Unknown option: ${unknownFlags.join(' ')}\n` : ''}Usage: npm run local:app -- <app> [--reset] [--no-seed] [--no-open]\nApps: ${APP_REGISTRY.map((entry) => entry.id).join(', ')}`,
  );
  process.exit(1);
}

if (!isEmulatorModeOn()) {
  console.error(
    'VITE_USE_FIREBASE_EMULATORS is not true for the dev server (Vite reads .env, .env.local, .env.development and .env.development.local, and your shell). Set it in .env.local, so the app talks to the emulators and never to production.',
  );
  process.exit(1);
}

const seed = () => {
  console.log(
    `▶ Seeding ${app.name}${isReset ? ' (wiping all the emulators first; other apps come back with npm run seed:reset)' : ' (refreshes its fixtures, keeps everything else)'}…`,
  );
  execFileSync(
    'npm',
    ['run', 'seed', '--', '--scope', app.id, ...(isReset ? ['--reset'] : [])],
    { stdio: 'inherit' },
  );
};

const showServices = () => {
  console.log(
    `\nOutside services ${app.name} uses (emulators need a restart after a switch):`,
  );
  try {
    execFileSync(
      'npm',
      ['run', '--silent', 'local:services', '--', 'for', app.id],
      { stdio: 'inherit' },
    );
  } catch {
    console.log('Could not read the service list; run npm run local:services.');
  }
};

const askAboutServices = () => {
  if (!process.stdin.isTTY) return false;
  try {
    execFileSync(
      'npm',
      ['run', '--silent', 'local:services', '--', 'choose', app.id],
      {
        stdio: 'inherit',
      },
    );
    return false;
  } catch (error) {
    const { status } = error as { status?: number };
    if (status !== 10) process.exit(status ?? 1);
    return true;
  }
};

const askToRestartEmulators = async () => {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  prompt.on('SIGINT', () => {
    process.stdout.write('\n');
    process.exit(130);
  });
  const answer = (
    await prompt.question(
      `\nThe running emulators need a restart to use that. Restart them now? Their data is cleared and only ${app.name}'s fixtures are reseeded (npm run seed:reset restores the rest). [Y/n] `,
    )
  )
    .trim()
    .toLowerCase();
  prompt.close();
  return answer === '' || answer.startsWith('y');
};

const checkFirebaseLogin = () => {
  try {
    execFileSync(
      'bash',
      ['-c', 'source scripts/lib/firebaseLogin.sh && require_firebase_login'],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          PATH: `${process.cwd()}/node_modules/.bin:${process.env.PATH}`,
        },
      },
    );
  } catch {
    console.log(
      'Continuing without a firebase sign-in. That is fine offline; otherwise run: firebase login --reauth',
    );
  }
};

const main = async () => {
  const isRunning = await areAllUp(EMULATOR_READY_URLS);
  const hasChanged = askAboutServices();
  const isRestarting =
    isRunning && hasChanged && (await askToRestartEmulators());
  if (isRestarting) {
    execFileSync('npm', ['run', '--silent', 'emulators:kill'], {
      stdio: 'inherit',
    });
  }
  if (isRunning && hasChanged && !isRestarting) {
    console.log(
      'Kept the running emulators; the change applies the next time they start.',
    );
  }
  if (isRunning && !isRestarting) {
    console.log('✓ Emulators already running; leaving them alone.');
  } else {
    checkFirebaseLogin();
    const emulators = startService('the emulators', ['emulators']);
    await waitForService(emulators, EMULATOR_READY_URLS, 180);
  }

  if (isSkippingSeed)
    console.log('✓ Not seeding (--no-seed); data left as it is.');
  else seed();

  const wasViteUp = await isUp(VITE_URL);
  if (wasViteUp && !(await isVite(VITE_URL))) {
    throw new Error(
      `Something that is not the dev server is using ${VITE_URL}. Stop it, then run the same command again.`,
    );
  }
  if (wasViteUp) {
    console.log(
      '✓ Dev server already running; leaving it alone (it read its env when it started).',
    );
  } else {
    const vite = startService('the dev server', [
      'dev',
      '--',
      '--port',
      '5173',
      '--strictPort',
    ]);
    await waitForService(vite, [VITE_URL], 120);
  }

  const url = `${VITE_URL}${app.path}`;
  console.log(
    `\n✅ ${app.name} is ready: ${url}\n   Pick a fixture account from the dev switcher.`,
  );
  if (isOpening && process.platform === 'darwin') execFileSync('open', [url]);
  showServices();

  if (started.length === 0) return;
  console.log(
    '   Ctrl+C stops what this command started; npm run emulators:kill stops the rest.\n',
  );
  const stopped = await Promise.race(
    started.map(({ name, exited }) => exited.then(() => name)),
  );
  throw new Error(
    `${stopped} stopped, so everything this command started is stopping too.`,
  );
};

try {
  await main();
} catch (error) {
  if (!isStopping) {
    stopStarted('SIGTERM');
    console.error(error instanceof Error ? error.message : error);
    await Promise.race([
      Promise.all(started.map(({ exited }) => exited)),
      sleep(10_000),
    ]);
    process.exit(1);
  }
}

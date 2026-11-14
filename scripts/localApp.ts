import { execFileSync, spawn, type ChildProcess } from 'node:child_process';

import { loadEnv } from 'vite';

import { FIXTURE_USERS } from '../src/lib/dev/fixtureAccounts.ts';
import { APP_REGISTRY } from '../src/lib/app/app.registry.ts';

const VITE_URL = 'http://localhost:5173';
const AUTH_URL = 'http://127.0.0.1:9099';
const PROJECT = 'moondreams-dev-apps';
const EMULATOR_READY_URLS = [
  'http://127.0.0.1:8080',
  AUTH_URL,
  'http://127.0.0.1:9000',
  'http://127.0.0.1:9199',
  'http://127.0.0.1:5001',
];

const isUp = (url: string) =>
  fetch(url).then(
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

const exitCode = (child: ChildProcess) =>
  new Promise<number>((resolve) => child.on('exit', (code) => resolve(code ?? 1)));

const started: { name: string; child: ChildProcess }[] = [];

/** Resolves when the URLs answer; fails fast, naming the service, if the process that should serve them exits first. */
const waitForService = (name: string, child: ChildProcess, urls: string[], seconds: number) =>
  Promise.race([
    pollUntilUp(urls, seconds),
    exitCode(child).then((code) => {
      throw new Error(
        `${name} stopped (exit code ${code}) before it was ready. Fix the error above, then run the same command again.`,
      );
    }),
  ]);

const startService = (name: string, args: string[]) => {
  const child = spawn('npm', ['run', ...args], { stdio: 'inherit' });
  started.push({ name, child });
  console.log(`▶ Starting ${name}…`);
  return child;
};

const stopStarted = (signal: NodeJS.Signals) =>
  started.forEach(({ child }) => child.kill(signal));

const stopAndExit = async (signal: NodeJS.Signals) => {
  // From a terminal, Ctrl+C has already reached every child.
  if (signal !== 'SIGINT' || !process.stdin.isTTY) stopStarted(signal);
  await Promise.all(started.map(({ child }) => exitCode(child)));
  process.exit(0);
};
process.on('SIGINT', () => void stopAndExit('SIGINT'));
process.on('SIGTERM', () => void stopAndExit('SIGTERM'));

const isEmulatorModeOn = () =>
  loadEnv('development', process.cwd(), 'VITE_').VITE_USE_FIREBASE_EMULATORS === 'true';

const isFixtureDataThere = () =>
  fetch(`${AUTH_URL}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnUserInfo: true }),
  })
    .then((response) => response.json() as Promise<{ userInfo?: { email?: string }[] }>)
    .then(({ userInfo = [] }) => {
      const emails = new Set(userInfo.map((user) => user.email));
      return Object.values(FIXTURE_USERS).every((account) => emails.has(account.email));
    })
    .catch(() => false);

const isVite = (url: string) =>
  fetch(`${url}/@vite/client`).then(
    (response) => response.ok,
    () => false,
  );

const [target, ...flags] = process.argv.slice(2).filter(Boolean);
const isReset = flags.includes('--reset');
const isReseeding = isReset || flags.includes('--seed');
const isOpening = !flags.includes('--no-open');
const app = APP_REGISTRY.find((entry) => entry.id === target);

if (!app) {
  console.error(
    `Usage: npm run local:app -- <app> [--seed] [--reset] [--no-open]\nApps: ${APP_REGISTRY.map((entry) => entry.id).join(', ')}`,
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
    `▶ Seeding ${app.name}${isReset ? ' (wiping all the emulators first; other apps come back with npm run seed:reset)' : ''}…`,
  );
  execFileSync(
    'npm',
    ['run', 'seed', '--', '--scope', app.id, ...(isReset ? ['--reset'] : [])],
    { stdio: 'inherit' },
  );
};

const main = async () => {
  const wereEmulatorsUp = await areAllUp(EMULATOR_READY_URLS);
  if (wereEmulatorsUp) {
    console.log('✓ Emulators already running; leaving them alone.');
  } else {
    const emulators = startService('the emulators', ['emulators']);
    await waitForService('The emulators', emulators, EMULATOR_READY_URLS, 180);
  }

  const isSeeded = await isFixtureDataThere();
  if (!isSeeded || isReseeding) seed();
  else console.log('✓ Fixtures are there; your data was kept (add --seed to refresh this app\'s, --reset to wipe everything).');

  const wasViteUp = await isUp(VITE_URL);
  if (wasViteUp && !(await isVite(VITE_URL))) {
    throw new Error(`Something that is not the dev server is using ${VITE_URL}. Stop it, then run the same command again.`);
  }
  if (wasViteUp) {
    console.log('✓ Dev server already running; leaving it alone (it read its env when it started).');
  } else {
    const vite = startService('the dev server', ['dev', '--', '--port', '5173', '--strictPort']);
    await waitForService('The dev server', vite, [VITE_URL], 120);
  }

  const url = `${VITE_URL}${app.path}`;
  console.log(
    `\n✅ ${app.name} is ready: ${url}\n   Pick a fixture account from the dev switcher.\n\nOutside services ${app.name} uses (emulators need a restart after a switch):`,
  );
  execFileSync('npm', ['run', '--silent', 'local:services', '--', 'for', app.id], { stdio: 'inherit' });
  if (isOpening) {
    try {
      execFileSync('open', [url]);
    } catch {
      // The link above is enough.
    }
  }

  if (started.length === 0) return;
  console.log('   Ctrl+C stops what this command started; npm run emulators:kill stops the rest.\n');
  const stopped = await Promise.race(
    started.map(({ name, child }) => exitCode(child).then(() => name)),
  );
  throw new Error(`${stopped} stopped, so everything this command started is stopping too.`);
};

try {
  await main();
} catch (error) {
  stopStarted('SIGTERM');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

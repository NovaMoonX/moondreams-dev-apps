import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { APP_REGISTRY } from '../src/lib/app/app.registry.ts';

const VITE_URL = 'http://localhost:5173';
const EMULATOR_READY_URLS = [
  'http://127.0.0.1:8080',
  'http://127.0.0.1:9099',
  'http://127.0.0.1:9000',
];

const isUp = (url: string) =>
  fetch(url).then(
    () => true,
    () => false,
  );

const areAllUp = (urls: string[]) =>
  Promise.all(urls.map(isUp)).then((states) => states.every(Boolean));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitUntilUp = async (urls: string[], seconds: number) => {
  for (let waited = 0; waited < seconds; waited += 1) {
    if (await areAllUp(urls)) return;
    await sleep(1000);
  }
  throw new Error(`${urls.join(', ')} never came up.`);
};

const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.development.local'];

const isEmulatorModeOn = () =>
  ENV_FILES.filter((file) => existsSync(file)).some((file) =>
    /^\s*VITE_USE_FIREBASE_EMULATORS\s*=\s*['"]?true['"]?\s*$/m.test(
      readFileSync(file, 'utf8'),
    ),
  );

const exitCode = (child: ChildProcess) =>
  new Promise<number>((resolve) => child.on('exit', (code) => resolve(code ?? 1)));

const [target, ...flags] = process.argv.slice(2).filter(Boolean);
const isReset = flags.includes('--reset');
const isOpening = !flags.includes('--no-open');
const app = APP_REGISTRY.find((entry) => entry.id === target);

if (!app) {
  console.error(
    `Usage: npm run local:app -- <app> [--reset] [--no-open]\nApps: ${APP_REGISTRY.map((entry) => entry.id).join(', ')}`,
  );
  process.exit(1);
}

if (!isEmulatorModeOn()) {
  console.error(
    'Add VITE_USE_FIREBASE_EMULATORS=true to your .env.local first, so the app talks to the emulators and never to production.',
  );
  process.exit(1);
}

const started: ChildProcess[] = [];
const stopStarted = () => started.forEach((child) => child.kill('SIGINT'));
process.on('SIGINT', () => {
  stopStarted();
  process.exit(0);
});

const startService = (name: string, args: string[]) => {
  const child = spawn('npm', ['run', ...args], { stdio: 'inherit' });
  started.push(child);
  console.log(`▶ Starting ${name}…`);
  return child;
};

const seed = () => {
  console.log(`▶ Seeding ${app.name}${isReset ? ' (everything else wiped first)' : ''}…`);
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
    startService('the emulators', ['emulators']);
    await waitUntilUp(EMULATOR_READY_URLS, 180);
  }

  // A running suite keeps its data, so it is only re-seeded on request; a fresh one is always empty.
  if (!wereEmulatorsUp || isReset) seed();

  const wasViteUp = await isUp(VITE_URL);
  const vite = wasViteUp ? null : startService('the dev server', ['dev']);
  if (wasViteUp) console.log('✓ Dev server already running; leaving it alone.');
  await waitUntilUp([VITE_URL], 120);

  const url = `${VITE_URL}${app.path}`;
  console.log(
    `\n✅ ${app.name} is ready: ${url}\n   Pick a fixture account from the dev switcher.\n   Which services are real or fixtures: npm run local:services`,
  );
  if (isOpening) {
    try {
      execFileSync('open', [url]);
    } catch {
      // Not on macOS or no browser: the link above is enough.
    }
  }

  if (started.length === 0) return;
  console.log('   Ctrl+C stops what this command started.\n');
  await Promise.race([vite, ...started].filter((child) => child !== null).map(exitCode));
  stopStarted();
};

try {
  await main();
} catch (error) {
  stopStarted();
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

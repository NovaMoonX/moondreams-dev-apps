import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import {
  FIXTURE_SERVICES,
  type FixtureService,
} from '../functions/src/emulator.ts';

const PROJECT = 'moondreams-dev-apps';
const ENV_FILE = 'functions/.env.local';
const SECRET_FILE = 'functions/.secret.local';
const SWITCH = 'LOCAL_FIXTURES';

interface ServiceInfo {
  apps: string;
  keys: string[];
  // Bound secrets reach the emulator from production; run-time keys only from the two local files.
  isBound: boolean;
  setup: string;
  note?: string;
}

const SERVICES: Record<FixtureService, ServiceInfo> = {
  anthropic: {
    apps: 'Helm',
    keys: ['ANTHROPIC_API_KEY'],
    isBound: true,
    setup:
      'npm run ai:anthropic-secret, or add ANTHROPIC_API_KEY=... to functions/.secret.local',
  },
  deepgram: {
    apps: 'voice in every app (listening and Aura speech)',
    keys: ['DEEPGRAM_API_KEY'],
    isBound: false,
    setup:
      'add DEEPGRAM_API_KEY=... to functions/.env.local (read at run time, so production is not used locally)',
  },
  'google-tts': {
    apps: 'voice in every app (default speech voice)',
    keys: [],
    isBound: false,
    setup: 'not available: the emulator never calls Google speech',
    note: 'fixtures (always in the emulator)',
  },
  gemini: {
    apps: 'voice (Gemini speech)',
    keys: ['GEMINI_API_KEY'],
    isBound: false,
    setup:
      'add GEMINI_API_KEY=... to functions/.env.local (read at run time, so production is not used locally)',
  },
  omdb: {
    apps: 'A-List',
    keys: ['OMDB_API_KEY'],
    isBound: true,
    setup: 'add OMDB_API_KEY=... to functions/.secret.local',
  },
  tmdb: {
    apps: 'A-List',
    keys: ['TMDB_API_KEY'],
    isBound: true,
    setup: 'add TMDB_API_KEY=... to functions/.secret.local',
  },
  amc: {
    apps: 'A-List (theaters and showtimes)',
    keys: ['AMC_API_KEY'],
    isBound: true,
    setup: 'add AMC_API_KEY=... to functions/.secret.local',
  },
  plaid: {
    apps: 'Runway (bank linking)',
    keys: ['RUNWAY_PLAID_CLIENT_ID', 'RUNWAY_PLAID_SECRET'],
    isBound: true,
    setup:
      'npm run runway:plaid-secrets, or add both keys (sandbox ones) to functions/.secret.local',
  },
};

const readLines = (file: string) =>
  existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];

const readValues = (file: string) =>
  Object.fromEntries(
    readLines(file)
      .map((line) => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => [match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]),
  );

const isSignedInToGcloud = () => {
  try {
    return (
      execFileSync(
        'gcloud',
        ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 15_000,
        },
      ).trim() !== ''
    );
  } catch {
    return false;
  }
};

const hasProductionKey = (name: string) => {
  try {
    return (
      execFileSync(
        'gcloud',
        [
          'secrets',
          'versions',
          'list',
          name,
          `--project=${PROJECT}`,
          '--limit=1',
          '--format=value(name)',
        ],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 20_000,
        },
      ).trim() !== ''
    );
  } catch {
    return false;
  }
};

const readForced = () => {
  const raw = readValues(ENV_FILE)[SWITCH] ?? '';
  return raw
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
};

const isForced = (forced: string[], service: FixtureService) =>
  forced.includes('all') || forced.includes(service);

const describeService = (
  service: FixtureService,
  forced: string[],
  isGcloudReady: boolean,
) => {
  const info = SERVICES[service];
  const secretValues = readValues(SECRET_FILE);
  const envValues = readValues(ENV_FILE);
  const hasLocal = (file: Record<string, string>) =>
    info.keys.length > 0 && info.keys.every((key) => Boolean(file[key]));
  if (info.note) return info.note;
  if (isForced(forced, service)) return 'fixtures (forced)';
  if (hasLocal(secretValues)) return 'real (functions/.secret.local)';
  if (hasLocal(envValues)) return 'real (functions/.env.local)';
  if (!info.isBound) return 'fixtures (no key)';
  if (!isGcloudReady) return 'fixtures (no local key; production not checked)';
  return info.keys.every(hasProductionKey)
    ? "real (production key, you're signed in)"
    : 'fixtures (no key)';
};

const writeSwitch = (names: string[]) => {
  const lines = readLines(ENV_FILE).filter(
    (line) => !new RegExp(`^\\s*${SWITCH}\\s*=`).test(line),
  );
  const kept =
    lines.length > 0 && lines[lines.length - 1] === ''
      ? lines.slice(0, -1)
      : lines;
  const next =
    names.length > 0 ? [...kept, `${SWITCH}=${names.join(',')}`] : kept;
  writeFileSync(ENV_FILE, next.length > 0 ? `${next.join('\n')}\n` : '');
};

const toServices = (target: string) => {
  if (target === 'all') return [...FIXTURE_SERVICES];
  const match = FIXTURE_SERVICES.find((service) => service === target);
  if (!match) {
    throw new Error(
      `Unknown service "${target}". Choose all or one of: ${FIXTURE_SERVICES.join(', ')}.`,
    );
  }
  return [match];
};

const RESTART =
  'Restart the emulators to apply it: npm run emulators:kill, then npm run emulators.';

const showStatus = () => {
  const isGcloudReady = isSignedInToGcloud();
  const forced = readForced();
  if (!isGcloudReady) {
    console.log(
      "can't check production: not signed in to gcloud (run `gcloud auth login` to see which production keys the emulator would use)\n",
    );
  }
  const width = Math.max(...FIXTURE_SERVICES.map((service) => service.length));
  FIXTURE_SERVICES.forEach((service) =>
    console.log(
      `${service.padEnd(width)}  ${describeService(service, forced, isGcloudReady)}  [${SERVICES[service].apps}]`,
    ),
  );
  console.log(
    `\nSwitch: npm run local:services -- fixtures <service|all>   or   -- real <service|all>   (${SWITCH} in ${ENV_FILE})`,
  );
};

const setMode = (mode: string, target: string) => {
  const targets = toServices(target);
  const forced = readForced();
  const current = forced.includes('all') ? [...FIXTURE_SERVICES] : forced;
  const next =
    mode === 'fixtures'
      ? [...new Set([...current, ...targets])]
      : current.filter((name) => !targets.some((service) => service === name));
  const isEvery = FIXTURE_SERVICES.every((service) => next.includes(service));
  writeSwitch(isEvery ? ['all'] : next);
  const isGcloudReady = isSignedInToGcloud();
  console.log(
    `${SWITCH} in ${ENV_FILE} is now ${isEvery ? 'all' : next.join(',') || '(empty)'}.`,
  );
  if (mode === 'real') {
    targets.forEach((service) => {
      const state = describeService(service, readForced(), isGcloudReady);
      if (state.startsWith('fixtures')) {
        console.log(
          `${service} will still use fixtures: no key found. To get one: ${SERVICES[service].setup}.`,
        );
      }
    });
  }
  console.log(RESTART);
};

const [mode, target] = process.argv.slice(2);

if (!mode) {
  showStatus();
} else if ((mode === 'fixtures' || mode === 'real') && target) {
  setMode(mode, target);
} else {
  console.error(
    'Usage: npm run local:services [-- fixtures|real <service|all>]',
  );
  process.exitCode = 1;
}

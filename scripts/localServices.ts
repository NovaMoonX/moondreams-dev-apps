import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

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
  appIds: string[];
  keys: string[];
  // Bound secrets reach the emulator from production; run-time keys only from the two local files.
  isBound: boolean;
  setup: string;
  note?: string;
  caution?: string;
  // The production value must never be copied to this machine.
  isNotPulled?: boolean;
}

const SERVICES: Record<FixtureService, ServiceInfo> = {
  anthropic: {
    apps: 'Helm',
    appIds: ['helm'],
    keys: ['ANTHROPIC_API_KEY'],
    isBound: true,
    setup:
      'npm run ai:anthropic-secret, or add ANTHROPIC_API_KEY=... to functions/.secret.local',
  },
  deepgram: {
    apps: 'voice in Helm and Pinch (listening and Aura speech)',
    appIds: ['helm', 'pinch'],
    keys: ['DEEPGRAM_API_KEY'],
    isBound: false,
    setup:
      'add DEEPGRAM_API_KEY=... to functions/.env.local (read at run time, so production is not used locally)',
    caution: 'Real Deepgram is billed per minute of audio.',
  },
  'google-tts': {
    apps: 'voice in Helm and Pinch (default speech voice)',
    appIds: ['helm', 'pinch'],
    keys: [],
    isBound: false,
    setup: 'not available: the emulator never calls Google speech',
    note: 'fixtures (always in the emulator)',
  },
  gemini: {
    apps: 'voice in Helm and Pinch (Gemini speech)',
    appIds: ['helm', 'pinch'],
    keys: ['GEMINI_API_KEY'],
    isBound: false,
    setup:
      'add GEMINI_API_KEY=... to functions/.env.local (read at run time, so production is not used locally)',
    caution: 'Real Gemini speech is billed per request.',
  },
  omdb: {
    apps: 'A-List',
    appIds: ['a-list'],
    keys: ['OMDB_API_KEY'],
    isBound: true,
    setup: 'add OMDB_API_KEY=... to functions/.secret.local',
  },
  tmdb: {
    apps: 'A-List',
    appIds: ['a-list'],
    keys: ['TMDB_API_KEY'],
    isBound: true,
    setup: 'add TMDB_API_KEY=... to functions/.secret.local',
  },
  amc: {
    apps: 'A-List (theaters and showtimes)',
    appIds: ['a-list'],
    keys: ['AMC_API_KEY'],
    isBound: true,
    setup: 'add AMC_API_KEY=... to functions/.secret.local',
  },
  plaid: {
    apps: 'Runway (bank linking)',
    appIds: ['runway'],
    keys: ['RUNWAY_PLAID_CLIENT_ID', 'RUNWAY_PLAID_SECRET'],
    isBound: true,
    isNotPulled: true,
    caution:
      'A production Plaid key links real banks; local use should be sandbox keys (npm run runway:plaid-secrets).',
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

const isManagedComment = (line: string) => /^#.*npm run local:/.test(line);
const isKeyLine = (line: string, key: string) =>
  new RegExp(`^\\s*${key}\\s*=`).test(line);

const dropKey = (lines: string[], key: string) =>
  lines.filter(
    (line, index) =>
      !isKeyLine(line, key) &&
      !(isManagedComment(line) && isKeyLine(lines[index + 1] ?? '', key)),
  );

const tidyLines = (lines: string[]) =>
  lines
    .filter(
      (line, index) => line !== '' || (index > 0 && lines[index - 1] !== ''),
    )
    .reduceRight<string[]>(
      (kept, line) =>
        kept.length === 0 && line === '' ? kept : [line, ...kept],
      [],
    );

const rewriteEnv = (file: string, keys: string[], block: string[]) => {
  const rest = tidyLines(keys.reduce(dropKey, readLines(file)));
  const next =
    block.length > 0
      ? [...rest, ...(rest.length > 0 ? [''] : []), ...block]
      : rest;
  writeFileSync(file, next.length > 0 ? `${next.join('\n')}\n` : '', {
    mode: 0o600,
  });
  chmodSync(file, 0o600);
};

const writeSwitch = (names: string[]) =>
  rewriteEnv(
    ENV_FILE,
    [SWITCH],
    names.length > 0
      ? [
          '# Outside services the emulators answer from fixtures even when a key exists (npm run local:services).',
          `${SWITCH}=${names.join(',')}`,
        ]
      : [],
  );

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

const showStatus = (appId?: string) => {
  const isGcloudReady = isSignedInToGcloud();
  const forced = readForced();
  if (!isGcloudReady) {
    console.log(
      "can't check production: not signed in to gcloud (run `gcloud auth login` to see which production keys the emulator would use)\n",
    );
  }
  const shown = FIXTURE_SERVICES.filter((service) => {
    const { appIds } = SERVICES[service];
    return !appId || appIds.includes(appId);
  });
  const width = Math.max(...shown.map((service) => service.length));
  shown.forEach((service) =>
    console.log(
      `${service.padEnd(width)}  ${describeService(service, forced, isGcloudReady)}  [${SERVICES[service].apps}]`,
    ),
  );
  console.log(
    `\nSwitch: npm run local:services -- fixtures <service|all>   or   -- real <service|all>   (${SWITCH} in ${ENV_FILE})`,
  );
};

const applyForced = (mode: 'fixtures' | 'real', targets: FixtureService[]) => {
  const forced = readForced();
  const current = forced.includes('all') ? [...FIXTURE_SERVICES] : forced;
  const next =
    mode === 'fixtures'
      ? [...new Set([...current, ...targets])]
      : current.filter((name) => !targets.some((service) => service === name));
  const isEvery = FIXTURE_SERVICES.every((service) => next.includes(service));
  writeSwitch(isEvery ? ['all'] : next);
  return { next, isEvery };
};

const setMode = (mode: 'fixtures' | 'real', target: string) => {
  const targets = toServices(target);
  const { next, isEvery } = applyForced(mode, targets);
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

const readSecret = (prompt: string) =>
  new Promise<string>((resolve) => {
    const typed: string[] = [];
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const onData = (chunk: string) =>
      [...chunk].forEach((char) => {
        if (char === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (char === '\r' || char === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(typed.join('').trim());
          return;
        }
        if (char === '\u007f') typed.pop();
        else if (char >= ' ') typed.push(char);
      });
    process.stdin.on('data', onData);
  });

const isIgnoredByGit = (file: string) => {
  try {
    execFileSync('git', ['check-ignore', '-q', file], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const readValuesInOrder = (prompts: string[]) =>
  prompts.reduce<Promise<string[]>>(async (done, prompt) => {
    const soFar = await done;
    if (soFar.length < prompts.indexOf(prompt)) return soFar;
    const value = await readSecret(prompt);
    return value ? [...soFar, value] : soFar;
  }, Promise.resolve([]));

const askYesNo = async (question: string, isDefaultYes: boolean) => {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  prompt.on('SIGINT', () => {
    process.stdout.write(
      '\nStopped. Any choices already made are saved; restart the emulators to apply them.\n',
    );
    process.exit(130);
  });
  const answer = (
    await prompt.question(`${question} ${isDefaultYes ? '[Y/n]' : '[y/N]'} `)
  )
    .trim()
    .toLowerCase();
  prompt.close();
  return answer === '' ? isDefaultYes : answer.startsWith('y');
};

const gcloudLogin = { isReady: false, hasFailed: false };

const isGcloudInstalled = () => {
  try {
    execFileSync('gcloud', ['--version'], { stdio: 'ignore', timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
};

const ensureGcloudLogin = () => {
  if (gcloudLogin.isReady) return true;
  if (gcloudLogin.hasFailed) return false;
  if (!isGcloudInstalled()) {
    gcloudLogin.hasFailed = true;
    return false;
  }
  const works = () => {
    try {
      execFileSync('gcloud', ['auth', 'print-access-token'], {
        stdio: 'ignore',
        timeout: 20_000,
      });
      return true;
    } catch {
      return false;
    }
  };
  if (works()) {
    gcloudLogin.isReady = true;
    return true;
  }
  console.log(
    'gcloud is signed out or its sign-in expired; a fresh sign-in is needed to read the production key.',
  );
  try {
    execFileSync('gcloud', ['auth', 'login'], { stdio: 'inherit' });
  } catch {
    gcloudLogin.hasFailed = true;
    return false;
  }
  gcloudLogin.isReady = works();
  gcloudLogin.hasFailed = !gcloudLogin.isReady;
  return gcloudLogin.isReady;
};

const readCommandOutput = (command: string, args: string[]) => {
  try {
    const value = execFileSync(command, args, {
      cwd: tmpdir(),
      env: { ...process.env, DEBUG: undefined },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
    }).trim();
    return /\s/.test(value) ? '' : value;
  } catch {
    return '';
  }
};

const fetchFromFirebase = (key: string) =>
  readCommandOutput(resolve('node_modules/.bin/firebase'), [
    'functions:secrets:access',
    key,
    '--project',
    PROJECT,
  ]);

const fetchFromGcloud = (key: string) =>
  readCommandOutput('gcloud', [
    'secrets',
    'versions',
    'access',
    'latest',
    `--secret=${key}`,
    `--project=${PROJECT}`,
  ]);

const fetchKey = (key: string) =>
  fetchFromFirebase(key) || (ensureGcloudLogin() ? fetchFromGcloud(key) : '');

const isStoredLocally = (service: FixtureService) => {
  const { keys, isBound } = SERVICES[service];
  const values = readValues(isBound ? SECRET_FILE : ENV_FILE);
  return keys.every((key) => Boolean(values[key]));
};

const storeKeys = (service: FixtureService, values: string[]) => {
  const { keys, isBound } = SERVICES[service];
  const file = isBound ? SECRET_FILE : ENV_FILE;
  if (values.some((value) => /[\r\n]/.test(value))) {
    console.log('A key contained a line break, so nothing was written.');
    return false;
  }
  if (!isIgnoredByGit(file)) {
    console.log(
      `${file} is not git-ignored, so nothing was written. Fix .gitignore first.`,
    );
    return false;
  }
  rewriteEnv(file, keys, [
    `# Real ${service} for ${SERVICES[service].apps} in the local emulators; delete it to use fixtures (npm run local:services).`,
    ...keys.map((key, index) => `${key}=${values[index]}`),
  ]);
  console.log(`Saved ${keys.join(' and ')} to ${file}.`);
  return true;
};

const getKeys = async (service: FixtureService) => {
  const { keys, isNotPulled, setup } = SERVICES[service];
  if (!isNotPulled) {
    const fetched = keys.map(fetchKey);
    if (fetched.every(Boolean)) {
      console.log(`Fetched ${keys.join(' and ')} from production.`);
      return storeKeys(service, fetched);
    }
    console.log(
      `Couldn't fetch ${keys.join(' and ')} automatically (the secret may not exist, or you may need firebase login --reauth). Run this, paste the result below, then clear your terminal:`,
    );
    keys.forEach((key) =>
      console.log(
        `  npx firebase functions:secrets:access ${key} --project ${PROJECT}`,
      ),
    );
  } else {
    console.log(`To get one: ${setup}. Then paste it below.`);
  }
  console.log('Paste is hidden; press Enter to skip.');
  const values = await readValuesInOrder(
    keys.map((key) => `${service}: ${key} > `),
  );
  return values.length === keys.length && storeKeys(service, values);
};

const chooseOne = async (service: FixtureService) => {
  const forced = readForced();
  const state = describeService(service, forced, isSignedInToGcloud());
  const isReal = state.startsWith('real');
  const { apps, caution } = SERVICES[service];
  console.log(
    `\n${service} (${apps}): now ${state}.${caution && isReal ? `\n  ⚠ ${caution}` : ''}`,
  );
  const wantsReal = await askYesNo(`Use the real ${service}?`, isReal);
  if (wantsReal) {
    if (isReal) return false;
    if (!isStoredLocally(service) && !(await getKeys(service))) {
      console.log(`No key was set, so ${service} stays on fixtures.`);
      return false;
    }
    applyForced('real', [service]);
    console.log(`${service} will use the real service.`);
    return true;
  }
  const wasForced = isForced(forced, service);
  const isRecoverable = !SERVICES[service].isNotPulled;
  if (isRecoverable) {
    [SECRET_FILE, ENV_FILE]
      .filter((file) => existsSync(file))
      .forEach((file) => rewriteEnv(file, SERVICES[service].keys, []));
  }
  if (!wasForced) applyForced('fixtures', [service]);
  console.log(
    `${service} will use fixtures${isRecoverable ? ' (local key removed)' : ' (your local key is kept: it cannot be fetched back)'}.`,
  );
  return isReal || state.includes('production not checked');
};

const chooseServices = async (appId: string) => {
  const services = FIXTURE_SERVICES.filter(
    (service) =>
      SERVICES[service].appIds.includes(appId) &&
      SERVICES[service].keys.length > 0,
  );
  if (!process.stdin.isTTY) {
    console.log(
      'Not an interactive terminal, so no service was changed (npm run local:services shows them).',
    );
    return;
  }
  const changes = await services.reduce<Promise<boolean[]>>(
    async (done, service) => [...(await done), await chooseOne(service)],
    Promise.resolve([]),
  );
  if (changes.some(Boolean)) process.exitCode = 10;
};

const [mode, target] = process.argv.slice(2);

if (!mode) {
  showStatus();
} else if (mode === 'for' && target) {
  showStatus(target);
} else if (mode === 'choose' && target) {
  await chooseServices(target);
} else if ((mode === 'fixtures' || mode === 'real') && target) {
  setMode(mode, target);
} else {
  console.error(
    'Usage: npm run local:services [-- for <app> | choose <app> | fixtures|real <service|all>]',
  );
  process.exitCode = 1;
}

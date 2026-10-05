import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline/promises';

interface TrustedNetwork {
  name: string;
  mac: string;
}

const TRUSTED_FILE = '.lan-trusted.local';
const LAN_CONFIG = 'firebase.lan.json';

// The gateway's MAC identifies the network; macOS hides the Wi-Fi name from scripts.
function getGatewayMac() {
  if (process.platform !== 'darwin') {
    throw new Error('The LAN guard only supports macOS.');
  }

  const route = execFileSync('route', ['-n', 'get', 'default'], { encoding: 'utf8' });
  const gateway = /gateway:\s*(\S+)/.exec(route)?.[1];
  const arp = gateway ? execFileSync('arp', ['-n', gateway], { encoding: 'utf8' }) : '';
  const mac = /at ([0-9a-f:]+) on/i.exec(arp)?.[1];

  if (!mac) {
    throw new Error('Could not identify the current network. Are you connected?');
  }

  // arp drops leading zeros from each byte.
  const result = mac.split(':').map((byte) => byte.padStart(2, '0')).join(':');
  return result;
}

function getGatewayMacOrNull() {
  try {
    return getGatewayMac();
  } catch {
    return null;
  }
}

function readTrusted(): TrustedNetwork[] {
  if (!fs.existsSync(TRUSTED_FILE)) {
    return [];
  }

  const result = fs
    .readFileSync(TRUSTED_FILE, 'utf8')
    .split('\n')
    .map((line) => /^(.*\S)\s+((?:[0-9a-f]{2}:){5}[0-9a-f]{2})$/i.exec(line.trim()))
    .filter((match) => match !== null)
    .map((match) => ({ name: match[1], mac: match[2].toLowerCase() }));
  return result;
}

function writeTrusted(networks: TrustedNetwork[]) {
  const lines = networks.map((network) => `${network.name}  ${network.mac}`);
  fs.writeFileSync(
    TRUSTED_FILE,
    ['# Networks trusted for the :lan commands (name, then gateway MAC).', '# Managed by `npm run lan:trust` / `lan:untrust` / `lan:list`.', '', ...lines, ''].join('\n'),
  );
}

function assertTrustedNetwork() {
  if (!readTrusted().some((network) => network.mac === getGatewayMac())) {
    throw new Error(
      "This network isn't trusted, so nothing is being exposed. At home, run `npm run lan:trust` once, then try again.",
    );
  }
}

async function askName() {
  if (!process.stdin.isTTY) {
    throw new Error('Pass a name: npm run lan:trust -- Home');
  }

  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  const name = (await prompt.question('Name this network (e.g. Home): ')).trim();
  prompt.close();
  return name;
}

function run(command: string, args: string[]) {
  spawn('npx', ['--no-install', command, ...args], { stdio: 'inherit' }).on(
    'exit',
    (code) => process.exit(code ?? 1),
  );
}

/** Every emulator listens on all interfaces; returns the `--only` list (the UI stays off). */
function writeLanEmulatorConfig() {
  const config = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
  const emulators = Object.fromEntries(
    Object.entries(config.emulators).map(([name, settings]) => [
      name,
      { ...(settings as object), host: '0.0.0.0' },
    ]),
  );
  fs.writeFileSync(LAN_CONFIG, JSON.stringify({ ...config, emulators }, null, 2));
  const only = Object.keys(emulators).filter((name) => name !== 'ui').join(',');
  return only;
}

const TAILSCALE_CLIS = ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];
const VITE_PORT = 5173;
const EMULATOR_READY_URLS = [
  'http://127.0.0.1:8080',
  'http://127.0.0.1:9099',
  'http://127.0.0.1:9000',
];

// Only processes that look like ours are stopped; anything else on these ports is left alone and reported.
const OUR_PROCESS = /vite|firebase|emulator|cloud-storage-rules|pubsub/i;
// The emulators' own ports, plus the hub, logging and Firestore websocket ports they open beside them.
const EXTRA_EMULATOR_PORTS = [4400, 4500, 9150];

const PROCESS_LABELS = [
  { pattern: /vite/i, label: 'Vite dev server', isEmulator: false },
  { pattern: /emulators:start/, label: 'Firebase emulator suite', isEmulator: true },
  { pattern: /firebase-auth-emulator/, label: 'Auth emulator', isEmulator: true },
  { pattern: /cloud-firestore-emulator/, label: 'Firestore emulator', isEmulator: true },
  { pattern: /firebase-database-emulator/, label: 'Realtime Database emulator', isEmulator: true },
  { pattern: /pubsub-emulator/, label: 'Pub/Sub emulator', isEmulator: true },
  { pattern: /cloud-storage-rules/, label: 'Storage emulator', isEmulator: true },
];

const describeProcess = (command: string) =>
  PROCESS_LABELS.find(({ pattern }) => pattern.test(command))?.label ?? 'leftover Firebase or Vite process';

interface Listener {
  pid: number;
  ports: number[];
  command: string;
}

function getListeners(ports: number[]): Listener[] {
  const found = ports.flatMap((port) => {
    try {
      const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return out
        .split('\n')
        .filter((line) => line.startsWith('p'))
        .map((line) => ({ pid: Number(line.slice(1)), port }));
    } catch {
      return [];
    }
  });
  const byPid = found.reduce<Record<number, number[]>>(
    (groups, { pid, port }) => ({ ...groups, [pid]: [...(groups[pid] ?? []), port] }),
    {},
  );

  return Object.entries(byPid)
    .map(([pid, pidPorts]) => ({
      pid: Number(pid),
      ports: pidPorts,
      command: execFileSync('ps', ['-p', pid, '-o', 'args='], { encoding: 'utf8' }).trim(),
    }))
    .filter(({ pid }) => pid !== process.pid);
}

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function stopProcess(pid: number) {
  process.kill(pid, 'SIGTERM');
  for (let waited = 0; waited < 30 && isAlive(pid); waited += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (isAlive(pid)) {
    process.kill(pid, 'SIGKILL');
  }
}

/** Stops our own leftover dev server and emulators, saying what it stopped; fails if something else holds a port. */
async function freePorts() {
  const config = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
  const override = process.env.SHARE_CLEANUP_PORTS;
  const ports = override
    ? override.split(',').map(Number)
    : [
        VITE_PORT,
        ...EXTRA_EMULATOR_PORTS,
        ...Object.values<{ port?: number }>(config.emulators).flatMap(({ port }) => (port ? [port] : [])),
      ];
  const listeners = getListeners(ports);
  const ours = listeners.filter(({ command }) => OUR_PROCESS.test(command));
  const others = listeners.filter(({ command }) => !OUR_PROCESS.test(command));

  if (listeners.length === 0) {
    console.log('✅ Nothing is in the way: the ports are free.');
    return;
  }

  await Promise.all(ours.map(({ pid }) => stopProcess(pid)));
  ours.forEach(({ ports: pidPorts, command }) =>
    console.log(`🛑 Stopped the ${describeProcess(command)} (port ${pidPorts.join(', ')})`),
  );

  if (others.length > 0) {
    others.forEach(({ ports: pidPorts, command }) =>
      console.error(`⚠️  Left alone a program on port ${pidPorts.join(', ')} that isn't ours: ${command.slice(0, 90)}`),
    );
    throw new Error('Something else is using a port we need. Stop it, then run this again.');
  }
}

/** Stops every Firebase emulator process (not the dev server), saying which ones it stopped. */
async function stopEmulators() {
  const processes = execFileSync('ps', ['-axo', 'pid=,args='], { encoding: 'utf8' })
    .split('\n')
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(.*)$/.exec(line);
      return match ? [{ pid: Number(match[1]), command: match[2] }] : [];
    })
    .filter(
      ({ pid, command }) =>
        pid !== process.pid &&
        PROCESS_LABELS.some(({ pattern, isEmulator }) => isEmulator && pattern.test(command)),
    );

  if (processes.length === 0) {
    console.log('✅ No emulators were running.');
    return;
  }

  await Promise.all(processes.map(({ pid }) => stopProcess(pid)));
  new Set(processes.map(({ command }) => describeProcess(command))).forEach((label) =>
    console.log(`🛑 Stopped the ${label}`),
  );
  console.log('✅ All emulators are stopped.');
}

/** Your Mac's Tailscale address, which only people on (or shared into) your tailnet can reach. */
function getTailscaleHost() {
  const override = process.env.SHARE_HOST;
  if (override) {
    return override;
  }

  const ips = TAILSCALE_CLIS.flatMap((cli) => {
    try {
      return [execFileSync(cli, ['ip', '-4'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0]];
    } catch {
      return [];
    }
  }).filter(Boolean);

  if (ips.length === 0) {
    throw new Error(
      "Couldn't find a Tailscale address. Install Tailscale (https://tailscale.com/download), sign in, and try again. See SEEDING.md, \"Sharing with a friend\".",
    );
  }
  return ips[0];
}

async function waitUntilUp(url: string, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const isUp = await fetch(url).then(() => true, () => false);
    if (isUp) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${url} never came up.`);
}

function waitForExit(child: ChildProcess) {
  return new Promise<number>((resolve) => child.on('exit', (code) => resolve(code ?? 1)));
}

const isTty = Boolean(process.stdout.isTTY);
const style = (code: string, text: string) => (isTty ? `\x1b[${code}m${text}\x1b[0m` : text);

/** The one thing to act on, so it is boxed in rules and printed after everything else has settled. */
function banner(url: string, isCopied: boolean) {
  const rule = style('36', '━'.repeat(Math.max(url.length + 10, 60)));
  return [
    '',
    rule,
    `  🌐  ${style('1', 'Share this link')}${isCopied ? '  (copied to your clipboard 📋)' : ''}`,
    '',
    `      👉  ${style('1;36', url)}`,
    '',
    '  📱  They need the Tailscale app, signed in to an account your Mac is shared with.',
    '  🧪  Then pick a fixture account (Alex has the A-List and Waypoint data) from the dev switcher.',
    '  🛑  Press Ctrl+C to stop sharing.',
    rule,
    '',
  ].join('\n');
}

/** One command: emulators, seeded fixtures and the dev server, then the link to send. */
async function share(isDry: boolean) {
  assertTrustedNetwork();
  const url = `http://${getTailscaleHost()}:${VITE_PORT}`;

  if (isDry) {
    console.log(`Would start the LAN emulators, run seed:reset, start Vite, and share ${url}`);
    return;
  }

  const only = writeLanEmulatorConfig();
  console.log('Building functions…');
  execFileSync('npm', ['--prefix', 'functions', 'run', 'build'], { stdio: 'inherit' });

  const children: ChildProcess[] = [];
  const stopAll = () => children.forEach((child) => child.kill('SIGINT'));
  process.on('SIGINT', () => {
    stopAll();
    process.exit(0);
  });
  let lastOutputAt = Date.now();
  const forward = (child: ChildProcess) => {
    child.stdout?.on('data', (chunk: Buffer) => {
      lastOutputAt = Date.now();
      process.stdout.write(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      lastOutputAt = Date.now();
      process.stderr.write(chunk);
    });
  };
  const start = (command: string, args: string[]) => {
    const child = spawn('npx', ['--no-install', command, ...args], { stdio: ['inherit', 'pipe', 'pipe'] });
    children.push(child);
    forward(child);
    return child;
  };

  start('firebase', ['emulators:start', '--only', only, '--config', LAN_CONFIG]);
  await Promise.all(EMULATOR_READY_URLS.map((readyUrl) => waitUntilUp(readyUrl)));

  const seedCode = await waitForExit(spawn('npm', ['run', 'seed:reset'], { stdio: 'inherit' }));
  if (seedCode !== 0) {
    stopAll();
    throw new Error('Seeding failed, so nothing is being shared.');
  }

  const copyToClipboard = () => {
    try {
      execFileSync('pbcopy', { input: url });
      return true;
    } catch {
      return false;
    }
  };
  const isCopied = copyToClipboard();

  let isViteReady = false;
  const vite = spawn(
    'npx',
    ['--no-install', 'vite', '--host', '--port', String(VITE_PORT), '--strictPort'],
    { stdio: ['inherit', 'pipe', 'pipe'] },
  );
  children.push(vite);
  forward(vite);
  vite.stdout?.on('data', (chunk: Buffer) => {
    if (/ready in/i.test(chunk.toString())) {
      isViteReady = true;
    }
  });

  // Emulators and Vite keep logging for a moment after they're up, so the link waits for quiet to land last.
  const announceWhenSettled = async () => {
    for (let waited = 0; waited < 120_000 && !isViteReady; waited += 250) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    for (let waited = 0; waited < 15_000 && Date.now() - lastOutputAt < 2_000; waited += 250) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    console.log(banner(url, isCopied));
  };
  void announceWhenSettled();

  const code = await waitForExit(vite);
  stopAll();
  process.exit(code);
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const commands: Record<string, (args: string[]) => void | Promise<void>> = {
  trust: async (args) => {
    const mac = getGatewayMac();
    const name = args.join(' ').trim() || (await askName());
    const others = readTrusted().filter((network) => network.mac !== mac);

    if (!name) {
      throw new Error('A name is required.');
    }
    if (others.some((network) => sameName(network.name, name))) {
      throw new Error(`Another trusted network is already named "${name}".`);
    }

    writeTrusted([...others, { name, mac }]);
    console.log(`Trusted "${name}" (gateway ${mac}).`);
  },
  untrust: (args) => {
    const name = args.join(' ').trim();
    const networks = readTrusted();
    const match = name
      ? networks.find((network) => sameName(network.name, name))
      : networks.find((network) => network.mac === getGatewayMac());

    if (!match) {
      throw new Error(
        name
          ? `No trusted network named "${name}". See \`npm run lan:list\`.`
          : "The current network isn't trusted.",
      );
    }

    writeTrusted(networks.filter((network) => network.mac !== match.mac));
    console.log(`Stopped trusting "${match.name}".`);
  },
  list: () => {
    const networks = readTrusted();
    const current = getGatewayMacOrNull();

    console.log(
      networks.length
        ? networks
            .map((network) => `${network.name}  ${network.mac}${network.mac === current ? '  (current)' : ''}`)
            .join('\n')
        : 'No trusted networks yet. Run `npm run lan:trust` at home.',
    );
  },
  dev: () => {
    assertTrustedNetwork();
    run('vite', ['--host']);
  },
  emulators: () => {
    assertTrustedNetwork();
    const only = writeLanEmulatorConfig();
    run('firebase', ['emulators:start', '--only', only, '--config', LAN_CONFIG]);
  },
  cleanup: () => freePorts(),
  'stop-emulators': () => stopEmulators(),
  share: (args) => share(args.includes('--dry')),
};

const command = commands[process.argv[2]];

try {
  if (!command) {
    throw new Error(`Use one of: ${Object.keys(commands).join(', ')}.`);
  }
  await command(process.argv.slice(3));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

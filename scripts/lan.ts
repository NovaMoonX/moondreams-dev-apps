import { execFileSync, spawn } from 'node:child_process';
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
    const config = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
    const emulators = Object.fromEntries(
      Object.entries(config.emulators).map(([name, settings]) => [
        name,
        { ...(settings as object), host: '0.0.0.0' },
      ]),
    );
    fs.writeFileSync(LAN_CONFIG, JSON.stringify({ ...config, emulators }, null, 2));
    const only = Object.keys(emulators).filter((name) => name !== 'ui').join(',');
    run('firebase', ['emulators:start', '--only', only, '--config', LAN_CONFIG]);
  },
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

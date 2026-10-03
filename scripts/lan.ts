import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';

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

function readTrusted(): string[] {
  return fs.existsSync(TRUSTED_FILE)
    ? JSON.parse(fs.readFileSync(TRUSTED_FILE, 'utf8'))
    : [];
}

function assertTrustedNetwork() {
  if (!readTrusted().includes(getGatewayMac())) {
    throw new Error(
      "This network isn't trusted, so nothing is being exposed. At home, run `npm run lan:trust` once, then try again.",
    );
  }
}

function run(command: string, args: string[]) {
  spawn('npx', ['--no-install', command, ...args], { stdio: 'inherit' }).on(
    'exit',
    (code) => process.exit(code ?? 1),
  );
}

const commands: Record<string, () => void> = {
  trust: () => {
    const mac = getGatewayMac();
    fs.writeFileSync(TRUSTED_FILE, JSON.stringify([...new Set([...readTrusted(), mac])]));
    console.log(`Trusted this network (gateway ${mac}).`);
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

try {
  const command = commands[process.argv[2]];
  if (!command) {
    throw new Error(`Use one of: ${Object.keys(commands).join(', ')}.`);
  }
  command();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

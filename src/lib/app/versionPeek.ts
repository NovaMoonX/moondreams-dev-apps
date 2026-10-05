import { fetchLatestVersion } from './appVersionQueries';
import { SITE_VERSION } from './app.constants';

const TAPS_NEEDED = 8;
const MAX_GAP_MS = 600;
const MAX_DRIFT_PX = 40;
const PANEL_ID = 'version-peek';
const INTERACTIVE = 'a,button,input,textarea,select,label,[role="button"],[contenteditable="true"]';

type Status = 'checking' | 'latest' | 'outdated' | 'ahead' | 'unknown';

const compareVersions = (a: string, b: string) => {
  const [pa, pb] = [a, b].map((v) => v.split('.').map((n) => Number.parseInt(n, 10) || 0));
  return [0, 1, 2].map((i) => (pa[i] ?? 0) - (pb[i] ?? 0)).find((d) => d !== 0) ?? 0;
};

const getStatus = (remote: string | null): Status => {
  if (!remote) return 'unknown';
  const diff = compareVersions(SITE_VERSION, remote);
  if (diff === 0) return 'latest';
  return diff < 0 ? 'outdated' : 'ahead';
};

const getStatusCopy = (status: Status, remote: string | null) => {
  if (status === 'checking') return 'Checking for updates…';
  if (status === 'latest') return "✨ You're on the latest version";
  if (status === 'outdated') return `Not the latest version (latest is ${remote})`;
  if (status === 'ahead') return `🧪 Newer than the live version (${remote})`;
  return "Couldn't check for updates right now";
};

const el = (tag: string, css: string, text?: string) => {
  const node = document.createElement(tag);
  node.style.cssText = css;
  if (text) node.textContent = text;
  return node;
};

const closePanel = () => document.getElementById(PANEL_ID)?.remove();

const openPanel = () => {
  closePanel();

  const panel = el(
    'div',
    [
      'position:fixed',
      'left:50%',
      'bottom:max(20px,env(safe-area-inset-bottom))',
      'transform:translateX(-50%)',
      'z-index:2147483647',
      'width:min(320px,calc(100vw - 32px))',
      'box-sizing:border-box',
      'padding:16px',
      'border-radius:20px',
      'border:1px solid var(--color-border,rgba(128,128,128,.35))',
      'background:var(--color-card,Canvas)',
      'color:var(--color-foreground,CanvasText)',
      'box-shadow:0 12px 40px rgba(0,0,0,.28)',
      'font:14px/1.4 system-ui,sans-serif',
      'text-align:center',
    ].join(';'),
  );
  panel.id = PANEL_ID;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'App version');

  const title = el('div', 'font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.6', 'MoonDreams Dev Apps');
  const version = el('div', 'font-size:28px;font-weight:700;margin:4px 0', `v${SITE_VERSION}`);
  const status = el('div', 'opacity:.85', getStatusCopy('checking', null));
  const actions = el('div', 'display:flex;gap:8px;justify-content:center;margin-top:12px');

  const actionCss =
    'border-radius:999px;padding:8px 16px;font:inherit;font-weight:600;cursor:pointer;border:1px solid var(--color-border,rgba(128,128,128,.4));background:transparent;color:inherit';
  const closeButton = el('button', actionCss, 'Close');
  closeButton.addEventListener('click', closePanel);
  actions.append(closeButton);

  panel.append(title, version, status, actions);
  document.body.append(panel);

  fetchLatestVersion()
    .catch(() => null)
    .then((remote) => {
      const result = getStatus(remote);
      status.textContent = getStatusCopy(result, remote);
    });
};

/** Plain-DOM, so it works on any screen, including a crash or 404. Eight quick taps in one spot reveal the version. */
export function installVersionPeek() {
  const tap = { count: 0, x: 0, y: 0, at: 0 };

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Element | null;
    if (!target || target.closest(INTERACTIVE) || target.closest(`#${PANEL_ID}`)) return;

    const continues =
      event.timeStamp - tap.at <= MAX_GAP_MS &&
      Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= MAX_DRIFT_PX;
    tap.count = continues ? tap.count + 1 : 1;
    tap.at = event.timeStamp;
    if (tap.count === 1) Object.assign(tap, { x: event.clientX, y: event.clientY });

    if (tap.count >= TAPS_NEEDED) {
      tap.count = 0;
      openPanel();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closePanel();
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
}

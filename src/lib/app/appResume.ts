import { APP_REGISTRY_ID_MAP, getRegistryAppForPath } from './app.registry';

const STORAGE_PREFIX = 'app-resume:';
const memory: Record<string, Record<string, string>> = {};

function readSaved(uid: string): Record<string, string> {
  if (memory[uid]) {
    return memory[uid];
  }
  try {
    const parsed = JSON.parse(sessionStorage.getItem(`${STORAGE_PREFIX}${uid}`) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** An app's own page with only the query params its registry entry allows; `null` for any other page, so a link's token never lands here. */
function toResumeLocation(pathname: string, search: string) {
  const app = getRegistryAppForPath(pathname);
  if (!app || pathname !== app.path) {
    return null;
  }
  const source = new URLSearchParams(search);
  const kept = new URLSearchParams(
    (app.resumeParams ?? []).flatMap((key) => {
      const value = source.get(key);
      return value ? [[key, value] as [string, string]] : [];
    }),
  ).toString();
  const result = kept ? `${app.path}?${kept}` : app.path;
  return result;
}

export function rememberAppLocation(uid: string, pathname: string, search: string) {
  const location = toResumeLocation(pathname, search);
  const app = getRegistryAppForPath(pathname);
  if (!location || !app) {
    return;
  }
  const next = { ...readSaved(uid), [app.id]: location };
  memory[uid] = next;
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${uid}`, JSON.stringify(next));
  } catch {
    // The in-memory copy still serves this tab.
  }
}

/** Where to send someone opening an app: where they last were in it this visit, else its front door. */
export function getAppResumePath(uid: string | null, appId: string, frontDoor: string) {
  const saved = uid && APP_REGISTRY_ID_MAP[appId] ? readSaved(uid)[appId] : undefined;
  if (typeof saved !== 'string') {
    return frontDoor;
  }
  const [pathname, query] = saved.split('?');
  const isOwnApp = getRegistryAppForPath(pathname)?.id === appId;
  const result = (isOwnApp && toResumeLocation(pathname, query ? `?${query}` : '')) || frontDoor;
  return result;
}

/** Forgets every remembered location; sign-out and an account switch call it. */
export function clearAppResume() {
  Object.keys(memory).forEach((uid) => delete memory[uid]);
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(STORAGE_PREFIX))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Storage is unavailable, so nothing was kept there.
  }
}

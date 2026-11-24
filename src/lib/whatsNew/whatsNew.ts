import { compareVersions } from '@/lib/app/appVersionQueries';
import {
  APP_REGISTRY_ID_MAP,
  getRegistryAppForPath,
} from '@/lib/app/app.registry';

import {
  WHATS_NEW_RETENTION_DAYS,
  type WhatsNewKind,
  type WhatsNewNote,
  type WhatsNewScope,
} from './whatsNewTypes';

export const ROLL_UP_HIGHLIGHT_CAP = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const KIND_ORDER: Record<WhatsNewKind, number> = {
  new: 0,
  improved: 1,
  fixed: 2,
};
/** Pages a visitor opens from a link: no site chrome, so nothing to announce. */
const PUBLIC_SHARE_PREFIXES = ['/pinch/shared/', '/going-once/s/'];

export interface WhatsNewContext {
  scope: WhatsNewScope;
  runningVersion: string;
  isDebug: boolean;
  isGateOpen: (app: string, gate: string) => boolean;
}

export interface WhatsNewRollUp {
  highlights: WhatsNewNote[];
  moreHighlights: WhatsNewNote[];
  fixes: WhatsNewNote[];
  sinceAt: number | null;
}

export interface WhatsNewVersionGroup {
  version: string;
  publishedAt: number;
  notes: WhatsNewNote[];
}

export interface WhatsNewMonthGroup {
  key: string;
  at: number;
  highlights: WhatsNewNote[];
  fixes: WhatsNewNote[];
}

/** An app's own scope inside it, the site's on Home, and nothing on other site pages or a visitor's shared link. */
export const getWhatsNewScope = (pathname: string): WhatsNewScope | null => {
  if (pathname === '/') return 'site';
  if (PUBLIC_SHARE_PREFIXES.some((prefix) => pathname.startsWith(prefix)))
    return null;
  return getRegistryAppForPath(pathname)?.id ?? null;
};

export const getScopeName = (scope: WhatsNewScope) =>
  scope === 'site'
    ? 'Moondreams Dev Apps'
    : (APP_REGISTRY_ID_MAP[scope]?.name ?? scope);

/** A local `dev` build counts as the newest release. */
export const isVersionAvailable = (version: string, runningVersion: string) =>
  runningVersion === 'dev' || compareVersions(version, runningVersion) <= 0;

const byNewest = (a: WhatsNewNote, b: WhatsNewNote) =>
  compareVersions(b.version, a.version) || b.publishedAt - a.publishedAt;

const byKindThenNewest = (a: WhatsNewNote, b: WhatsNewNote) =>
  KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || byNewest(a, b);

export const getVisibleNotes = (
  notes: WhatsNewNote[],
  context: WhatsNewContext,
) =>
  notes
    .filter(
      (note) =>
        note.app === context.scope &&
        isVersionAvailable(note.version, context.runningVersion) &&
        (note.audience === 'everyone' || context.isDebug) &&
        (note.gate === null || context.isGateOpen(note.app, note.gate)),
    )
    .sort(byNewest);

export const getNewestVersion = (notes: WhatsNewNote[]) =>
  notes.reduce<string | null>(
    (newest, note) =>
      newest === null || compareVersions(note.version, newest) > 0
        ? note.version
        : newest,
    null,
  );

/** Nothing counts as unseen until the scope has a mark: a first run never shows a changelog. */
export const getUnseenNotes = (
  visible: WhatsNewNote[],
  seenVersion: string | null,
) =>
  seenVersion === null
    ? []
    : visible.filter((note) => compareVersions(note.version, seenVersion) > 0);

/** The mark written on a first encounter: the release the person is running, so its notes count as seen even if they publish late; a `dev` build takes the scope's newest note, or null with none. */
export const getFirstEncounterMark = (
  notes: WhatsNewNote[],
  { scope, runningVersion }: Pick<WhatsNewContext, 'scope' | 'runningVersion'>,
) =>
  runningVersion === 'dev'
    ? getNewestVersion(notes.filter((note) => note.app === scope))
    : runningVersion;

/** Fix-only updates pop up only for a debug viewer who hasn't turned them off. */
export const shouldPopUp = (
  unseen: WhatsNewNote[],
  { isDebug, showFixOnly }: { isDebug: boolean; showFixOnly: boolean | null },
) =>
  unseen.length > 0 &&
  (unseen.some((note) => note.kind !== 'fixed') ||
    (isDebug && showFixOnly !== false));

export const isFixOnly = (notes: WhatsNewNote[]) =>
  notes.every((note) => note.kind === 'fixed');

export const rollUp = (unseen: WhatsNewNote[]): WhatsNewRollUp => {
  const highlights = unseen
    .filter((note) => note.kind !== 'fixed')
    .sort(byKindThenNewest);
  return {
    highlights: highlights.slice(0, ROLL_UP_HIGHLIGHT_CAP),
    moreHighlights: highlights.slice(ROLL_UP_HIGHLIGHT_CAP),
    fixes: unseen.filter((note) => note.kind === 'fixed').sort(byNewest),
    sinceAt:
      unseen.length === 0
        ? null
        : Math.min(...unseen.map((note) => note.publishedAt)),
  };
};

export const groupByVersion = (notes: WhatsNewNote[]): WhatsNewVersionGroup[] =>
  Object.values(
    notes.reduce<Record<string, WhatsNewNote[]>>(
      (groups, note) => ({
        ...groups,
        [note.version]: [...(groups[note.version] ?? []), note],
      }),
      {},
    ),
  )
    .map((group) => ({
      version: group[0].version,
      publishedAt: Math.min(...group.map((note) => note.publishedAt)),
      notes: [...group].sort(byKindThenNewest),
    }))
    .sort((a, b) => compareVersions(b.version, a.version));

const toMonthKey = (at: number) => {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const groupByMonth = (notes: WhatsNewNote[]): WhatsNewMonthGroup[] =>
  Object.entries(
    notes.reduce<Record<string, WhatsNewNote[]>>((groups, note) => {
      const key = toMonthKey(note.publishedAt);
      return { ...groups, [key]: [...(groups[key] ?? []), note] };
    }, {}),
  )
    .map(([key, group]) => ({
      key,
      at: Math.max(...group.map((note) => note.publishedAt)),
      highlights: group
        .filter((note) => note.kind !== 'fixed')
        .sort(byKindThenNewest),
      fixes: group.filter((note) => note.kind === 'fixed').sort(byNewest),
    }))
    .sort((a, b) => b.key.localeCompare(a.key));

/** The history window: what the feed still holds, which is the last six months. */
export const getHistoryNotes = (visible: WhatsNewNote[], now: number) =>
  visible.filter(
    (note) => note.publishedAt >= now - WHATS_NEW_RETENTION_DAYS * DAY_MS,
  );

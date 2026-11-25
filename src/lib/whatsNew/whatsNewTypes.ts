import type { AppId } from '../types/appCatalog';

export type WhatsNewKind = 'new' | 'improved' | 'fixed';

/** Who a note is for: everyone, or only debug viewers (local builds, the admin and listed debug emails). */
export type WhatsNewAudience = 'everyone' | 'debug';

/** Where a note shows: one app, or the site itself (Home, the menu, the top strip). */
export type WhatsNewScope = AppId | 'site';

/** One line as a PR writes it, in a file of the repo's whats-new folder. */
export interface WhatsNewDraft {
  app: WhatsNewScope;
  kind: WhatsNewKind;
  text: string;
  /** The in-site route a "Show me" opens, or null for none. */
  path: string | null;
  /** A feature switch of the note's app; the note is hidden from anyone it is closed for. */
  gate: string | null;
  audience: WhatsNewAudience;
  /** True when the person would want to hear it on opening the app; false for a line that is only listed. Always false for a fix. */
  isTold: boolean;
  /** One emoji for what the change is about, or null. */
  emoji: string | null;
  /** Ids of earlier notes this one supersedes; people see only this one. */
  replaces: string[];
}

export const WHATS_NEW_REPLACES_MAX = 5;

export interface WhatsNewFile {
  notes: WhatsNewDraft[];
}

/** A published line: the draft plus the release that first carried it. */
export interface WhatsNewNote extends WhatsNewDraft {
  /** `<file slug>-<index>`, also its key in the feed. */
  id: string;
  /** The site version (x.y.z) of the merge that added it. */
  version: string;
  publishedAt: number;
}

/** The published feed in the Realtime Database at `whatsNew`. */
export interface WhatsNewFeed {
  notes: Record<string, WhatsNewNote>;
  updatedAt: number;
}

export const WHATS_NEW_FEED_PATH = 'whatsNew';

/** Notes older than this leave the feed, on each deploy and in the weekly sweep. */
export const WHATS_NEW_RETENTION_DAYS = 183;

export const WHATS_NEW_TEXT_MAX = 160;

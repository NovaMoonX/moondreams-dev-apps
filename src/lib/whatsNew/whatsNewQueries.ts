import { queryOptions } from '@tanstack/react-query';

import { APP_REGISTRY_ID_MAP } from '@/lib/app/app.registry';

import {
  WHATS_NEW_FEED_PATH,
  type WhatsNewAudience,
  type WhatsNewKind,
  type WhatsNewNote,
} from './whatsNewTypes';

const FETCH_TIMEOUT_MS = 6000;
const KINDS: readonly WhatsNewKind[] = ['new', 'improved', 'fixed'];
const AUDIENCES: readonly WhatsNewAudience[] = ['everyone', 'debug'];

const isNullableString = (value: unknown): value is string | null | undefined =>
  value === undefined || value === null || typeof value === 'string';

/** One entry of the feed, or null when a field is missing or malformed. The database drops null fields, so an absent `path` or `gate` reads as null. */
export const readNote = (id: string, value: unknown): WhatsNewNote | null => {
  if (typeof value !== 'object' || value === null) return null;
  const {
    app,
    kind,
    text,
    version,
    audience,
    publishedAt,
    path,
    gate,
    isTold,
    emoji,
    replaces,
  } = value as Record<string, unknown>;
  const isValid =
    typeof app === 'string' &&
    (app === 'site' || app in APP_REGISTRY_ID_MAP) &&
    KINDS.includes(kind as WhatsNewKind) &&
    typeof text === 'string' &&
    text.trim() !== '' &&
    typeof version === 'string' &&
    /^\d+\.\d+\.\d+$/.test(version) &&
    AUDIENCES.includes((audience ?? 'everyone') as WhatsNewAudience) &&
    typeof publishedAt === 'number' &&
    isNullableString(path) &&
    isNullableString(gate) &&
    (isTold === undefined || typeof isTold === 'boolean') &&
    isNullableString(emoji) &&
    (replaces === undefined ||
      (Array.isArray(replaces) &&
        replaces.every((id) => typeof id === 'string')));
  if (!isValid) return null;
  return {
    id,
    app: app as WhatsNewNote['app'],
    kind: kind as WhatsNewKind,
    text,
    version,
    audience: (audience ?? 'everyone') as WhatsNewAudience,
    publishedAt,
    path: path ?? null,
    gate: gate ?? null,
    isTold: kind !== 'fixed' && (isTold ?? true),
    emoji: emoji ?? null,
    replaces: (replaces as string[] | undefined) ?? [],
  };
};

export const readWhatsNewNotes = (feed: unknown): WhatsNewNote[] => {
  const notes = (feed as { notes?: unknown } | null)?.notes;
  if (typeof notes !== 'object' || notes === null) return [];
  return Object.entries(notes).flatMap(
    ([id, value]) => readNote(id, value) ?? [],
  );
};

export const fetchWhatsNewNotes = async () => {
  const [{ get, ref }, { realtimeDb }] = await Promise.all([
    import('firebase/database'),
    import('@lib/firebase/config'),
  ]);
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("What's new took too long to load.")),
      FETCH_TIMEOUT_MS,
    ),
  );
  const snapshot = await Promise.race([
    get(ref(realtimeDb, WHATS_NEW_FEED_PATH)),
    timeout,
  ]);
  return readWhatsNewNotes(snapshot?.val());
};

export const whatsNewQueryOptions = () =>
  queryOptions({
    queryKey: ['whatsNew', 'feed'] as const,
    queryFn: fetchWhatsNewNotes,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

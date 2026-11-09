const VIEWS = new Set([
  'home',
  'today',
  'inbox',
  'tasks',
  'settings',
  'activity',
]);
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
export const MAX_SCREEN_VISIBLE = 20;

export interface ScreenRefs {
  view: string;
  focusId: string | null;
  visibleIds: string[];
}

const toTaskId = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  (value as { collection?: unknown }).collection === 'tasks' &&
  typeof (value as { id?: unknown }).id === 'string' &&
  ID_RE.test((value as { id: string }).id)
    ? (value as { id: string }).id
    : null;

/** What a client says its page shows, cut down to a known view name and task ids; nothing else it sent survives. */
export function sanitizeScreen(raw: unknown): ScreenRefs | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { view, focus, visible } = raw as Record<string, unknown>;
  if (typeof view !== 'string' || !VIEWS.has(view)) return null;
  const focusId = toTaskId(focus);
  const visibleIds = [
    ...new Set(
      (Array.isArray(visible) ? visible : [])
        .slice(0, MAX_SCREEN_VISIBLE)
        .flatMap((entry) => toTaskId(entry) ?? []),
    ),
  ].filter((id) => id !== focusId);
  return { view, focusId, visibleIds };
}

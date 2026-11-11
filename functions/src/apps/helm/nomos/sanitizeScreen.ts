const VIEWS = new Set([
  'home',
  'today',
  'inbox',
  'tasks',
  'settings',
  'activity',
  'people',
  'who',
  'place',
  'projects',
  'project',
  'knowledge',
  'topic',
  'howNomosSeesYou',
]);
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
export const MAX_SCREEN_VISIBLE = 20;

export interface ScreenRefs {
  view: string;
  focusId: string | null;
  /** The topic a `topic` page shows. */
  topicId?: string;
  /** Each kept id with its 1-based place in the list the client sent, so "the second one" still points at the second row once others drop out. */
  visible: { id: string; position: number }[];
}

const toTaskId = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  (value as { collection?: unknown }).collection === 'tasks' &&
  typeof (value as { id?: unknown }).id === 'string' &&
  ID_RE.test((value as { id: string }).id)
    ? (value as { id: string }).id
    : null;

const toTopicId = (raw: Record<string, unknown>): string | null => {
  const { topicId, focus } = raw;
  const fromFocus =
    typeof focus === 'object' &&
    focus !== null &&
    (focus as { collection?: unknown }).collection === 'topics'
      ? (focus as { id?: unknown }).id
      : null;
  const id = typeof topicId === 'string' ? topicId : fromFocus;
  return raw.view === 'topic' && typeof id === 'string' && ID_RE.test(id)
    ? id
    : null;
};

/** What a client says its page shows, cut down to a known view name and task ids; nothing else it sent survives. */
export function sanitizeScreen(raw: unknown): ScreenRefs | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { view, focus, visible } = raw as Record<string, unknown>;
  if (typeof view !== 'string' || !VIEWS.has(view)) return null;
  const focusId = toTaskId(focus);
  const kept = (Array.isArray(visible) ? visible : [])
    .slice(0, MAX_SCREEN_VISIBLE)
    .flatMap((entry, index) => {
      const id = toTaskId(entry);
      return id ? [{ id, position: index + 1 }] : [];
    });
  const visibleRefs = kept.filter(
    (entry, index) =>
      kept.findIndex((other) => other.id === entry.id) === index,
  );
  const topicId = toTopicId(raw as Record<string, unknown>);
  const topicRef = topicId ? { topicId } : {};
  return {
    view,
    focusId,
    ...topicRef,
    visible: visibleRefs,
  };
}

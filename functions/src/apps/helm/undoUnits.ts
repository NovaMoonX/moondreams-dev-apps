// Generated from src/apps/helm/utils/undoUnits.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
export interface UnitEffectRef {
  op: string;
  collection: string;
  docId: string;
}

export interface UnitEffect {
  written: Record<string, unknown>;
  previous: Record<string, unknown> | null;
}

export type UnitKind =
  | 'task'
  | 'fact'
  | 'keyDate'
  | 'project'
  | 'note'
  | 'topic'
  | 'procedure'
  | 'run'
  | 'home';

export type UnitChange =
  'added' | 'changed' | 'completed' | 'removed' | 'moved';

/** One thing a person can take back alone: the effects behind one card row, with every effect that rides on the same record. */
export interface UndoUnit {
  /** The `key` of the unit's first drawn result row. */
  key: string;
  effectIndexes: number[];
  docIds: string[];
  kind: UnitKind;
  change: UnitChange;
  title: string | null;
}

export type TopicEffectKind = 'filing' | 'version' | 'placement' | 'made';

/** Which of the four shapes a topic effect has: a filing (`docState`, `pendingNoteIds`), a new version, a move (`parentId`, `depth`) or a topic the turn made (nothing before it). */
export const topicEffectKind = (effect: UnitEffect): TopicEffectKind =>
  'docState' in effect.written || 'pendingNoteIds' in effect.written
    ? 'filing'
    : 'version' in effect.written
      ? 'version'
      : effect.previous === null
        ? 'made'
        : 'depth' in effect.written || 'parentId' in effect.written
          ? 'placement'
          : 'filing';

const toText = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : null;

const isEntityRef = (ref: UnitEffectRef) =>
  ref.collection === 'who' || ref.collection === 'places';

/** Whether an effect is drawn as a row on the card; the one filter the card's rows and the units are both built from. */
export function hasResultRow(
  ref: UnitEffectRef,
  effect: UnitEffect | undefined,
): boolean {
  if (isEntityRef(ref) || ref.collection === 'media') return false;
  if (ref.collection === 'topics') {
    const kind = effect ? topicEffectKind(effect) : 'filing';
    const hasLine =
      kind === 'made' ||
      (kind === 'version' &&
        effect?.written.change !== 'moved' &&
        effect?.written.change !== 'grouped') ||
      (kind === 'placement' && 'parentId' in (effect?.written ?? {}));
    return toText(effect?.written['sealed.title']) !== null && hasLine;
  }
  if (ref.collection === 'procedures' || ref.collection === 'procedureRuns') {
    return toText(effect?.written['sealed.title']) !== null;
  }
  return true;
}

const toTitleOf = (
  ref: UnitEffectRef,
  effect: UnitEffect | undefined,
): string | null => {
  const written = effect?.written ?? {};
  const previous = effect?.previous ?? {};
  if (ref.collection === 'facts') {
    return (
      toText(written['sealed.statement']) ?? toText(written['sealed.title'])
    );
  }
  return (
    toText(written['sealed.title']) ??
    toText(previous['sealed.title']) ??
    toText(written['sealed.name'])
  );
};

const KINDS: Record<string, UnitKind> = {
  tasks: 'task',
  facts: 'fact',
  keyDates: 'keyDate',
  projects: 'project',
  notes: 'note',
  topics: 'topic',
  procedures: 'procedure',
  procedureRuns: 'run',
  profile: 'home',
};

const toChange = (
  ref: UnitEffectRef,
  effect: UnitEffect | undefined,
): UnitChange => {
  if (ref.op === 'create') return 'added';
  if (ref.op === 'delete') return 'removed';
  if (ref.collection === 'topics' && effect) {
    const kind = topicEffectKind(effect);
    if (kind === 'made') return 'added';
    if (kind === 'placement') return 'moved';
  }
  if (ref.collection === 'procedures' && effect?.previous === null) {
    return 'added';
  }
  return effect?.written.status === 'done' ? 'completed' : 'changed';
};

const unique = <T>(values: T[]) => [...new Set(values)];

/** Splits an execution's effects into the units a person can take back alone, plus the effects that ride along (riders), go with the last undo (entities, media, rest) or belong to a unit by what they touch. */
export function buildUndoUnits(input: {
  category: string;
  effectRefs: UnitEffectRef[];
  effects: UnitEffect[];
}): {
  units: UndoUnit[];
  riders: number[];
  entities: number[];
  media: number[];
  rest: number[];
} {
  const { category, effectRefs } = input;
  const effectAt = (index: number): UnitEffect | undefined =>
    input.effects[index];
  const indexes = effectRefs.map((_, index) => index);
  const rows = indexes.filter((index) =>
    hasResultRow(effectRefs[index], effectAt(index)),
  );
  const entities = indexes.filter((index) => isEntityRef(effectRefs[index]));
  const media = indexes.filter(
    (index) => effectRefs[index].collection === 'media',
  );
  const rowless = indexes.filter(
    (index) =>
      !rows.includes(index) &&
      !entities.includes(index) &&
      !media.includes(index),
  );
  const rowTitle = (index: number) => {
    const ref = effectRefs[index];
    return ref.collection === 'notes' ||
      ref.collection === 'topics' ||
      ref.collection === 'procedures'
      ? toTitleOf(ref, effectAt(index))
      : null;
  };
  const topicTitles = new Set(
    rows.flatMap((index) =>
      effectRefs[index].collection === 'topics' && rowTitle(index)
        ? [rowTitle(index)]
        : [],
    ),
  );
  const isHidden = (index: number) => {
    const ref = effectRefs[index];
    const title = rowTitle(index);
    if (ref.collection === 'notes') return !!title && topicTitles.has(title);
    return (
      ref.collection === 'topics' &&
      rows.some(
        (other) =>
          other < index &&
          effectRefs[other].collection === 'topics' &&
          rowTitle(other) === title,
      )
    );
  };
  const drawn = rows.filter((index) => !isHidden(index));
  const keyOf = (index: number) => `${effectRefs[index].docId}:${index}`;
  const toUnit = (members: number[]): UndoUnit => {
    const sorted = [...members].sort((a, b) => a - b);
    const first = sorted.find((index) => drawn.includes(index)) ?? sorted[0];
    const ref = effectRefs[first];
    return {
      key: keyOf(first),
      effectIndexes: sorted,
      docIds: unique(sorted.map((index) => effectRefs[index].docId)),
      kind: KINDS[ref.collection] ?? 'task',
      change: toChange(ref, effectAt(first)),
      title: toTitleOf(ref, effectAt(first)),
    };
  };
  if (category === 'import') {
    return {
      units: indexes.length > 0 ? [toUnit(indexes)] : [],
      riders: [],
      entities: [],
      media: [],
      rest: [],
    };
  }

  const parent = indexes.map((index) => index);
  const find = (index: number): number =>
    parent[index] === index ? index : (parent[index] = find(parent[index]));
  const seen = new Map<string, number>();
  rows.forEach((index) => {
    const ref = effectRefs[index];
    const title = rowTitle(index);
    const isTitled =
      !!title &&
      (ref.collection === 'topics' ||
        (ref.collection === 'notes' && topicTitles.has(title)));
    [`d:${ref.docId}`, ...(isTitled ? [`t:${title}`] : [])].forEach((key) => {
      const other = seen.get(key);
      if (other === undefined) seen.set(key, index);
      else parent[find(index)] = find(other);
    });
  });
  const grouped = rows.reduce<Map<number, number[]>>(
    (groups, index) =>
      groups.set(find(index), [...(groups.get(find(index)) ?? []), index]),
    new Map(),
  );
  const rootsInOrder = [...grouped.entries()].sort(
    ([, a], [, b]) => a[0] - b[0],
  );
  const isFiling = (index: number) => {
    const effect = effectAt(index);
    return (
      effectRefs[index].collection === 'topics' &&
      (!effect || topicEffectKind(effect) === 'filing')
    );
  };
  const riders = rowless.filter(isFiling);
  const joined = rowless
    .filter((index) => !isFiling(index))
    .map((index) => {
      const ref = effectRefs[index];
      const title = ref.collection === 'topics' ? rowTitle(index) : null;
      const target =
        rootsInOrder.find(([, members]) =>
          members.some((member) => effectRefs[member].docId === ref.docId),
        ) ??
        rootsInOrder.find(
          ([, members]) =>
            !!title && members.some((member) => rowTitle(member) === title),
        );
      return { index, root: target?.[0] ?? null };
    });
  const units = rootsInOrder.map(([root, members]) =>
    toUnit([
      ...members,
      ...joined.flatMap((entry) => (entry.root === root ? [entry.index] : [])),
    ]),
  );
  return {
    units,
    riders,
    entities,
    media,
    rest: joined.flatMap((entry) => (entry.root === null ? [entry.index] : [])),
  };
}

/** The units that still have a record this execution wrote left to take back. */
export const getRemainingUnits = (
  units: UndoUnit[],
  undoneDocIds: Set<string>,
): UndoUnit[] =>
  units.filter((unit) => !unit.docIds.every((id) => undoneDocIds.has(id)));

/** How the assistant sees the person: the rules for keeping, refusing and rebuilding its derived lines. Pure and import-free, shared by the device and the server (vendored). */

export const SEEN_AS_KINDS = [
  'whatWorks',
  'whatDoesnt',
  'rhythm',
  'howYouTalk',
  'tendency',
] as const;
export type SeenAsKind = (typeof SEEN_AS_KINDS)[number];
export type SeenAsState = 'shown' | 'corrected' | 'removed';

export const SEEN_AS_LIMITS = {
  /** Lines one rebuild may return. */
  returned: 8,
  /** A line resting on one thing is not a tendency. */
  minSources: 2,
  maxSources: 20,
  line: 140,
  basis: 120,
  corrected: 140,
  /** Records kept per person; removed ones past it keep only their id. */
  records: 40,
  /** Lines sent to the model, corrected first. */
  toModel: 20,
  /** A rebuild runs when the last one is this old, or sooner on enough new observations. */
  rebuildDays: 7,
  rebuildObservations: 3,
} as const;

/** Words that make a line a judgement about the body, a diagnosis or a guessed motive; such a line is never kept. */
export const SEEN_AS_REFUSED = [
  'dizzy',
  'pain',
  'ache',
  'sick',
  'ill',
  'nausea',
  'symptom',
  'diagnos',
  'disorder',
  'depress',
  'anxiety',
  'anxious',
  'adhd',
  'ocd',
  'bipolar',
  'trauma',
  'addict',
  'weight',
  'overweight',
  'medication',
  'meds',
  'dose',
  'lazy',
  'avoid',
  'afraid',
  'deep down',
  'secretly',
  'insecure',
  'because you want',
  'because you fear',
] as const;

export type SeenAsSourceHome = 'patterns' | 'observations' | 'style' | 'habits';

/** `'patterns/{id}'`, `'observations/{id}'`, `'habits/{id}'` or `'style/{scope}#{traitKey}'`. */
export const readSourceKey = (
  key: string,
): { home: SeenAsSourceHome; id: string } | null => {
  const slash = key.indexOf('/');
  if (slash <= 0) return null;
  const home = key.slice(0, slash);
  const id = key.slice(slash + 1);
  if (id === '') return null;
  if (
    home === 'patterns' ||
    home === 'observations' ||
    home === 'style' ||
    home === 'habits'
  ) {
    return { home, id };
  }
  return null;
};

/** The claim with case, punctuation and spacing folded, so a re-derived line lands on its record. */
export const normaliseClaim = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** What a line's id is hashed from: `'sa_'` + the first 24 hex of sha256 of this. */
export const seenAsIdInput = (kind: SeenAsKind, claim: string) =>
  `${kind}|${normaliseClaim(claim)}`;

const REFUSED_RE = new RegExp(
  `(?:^|[^a-z])(?:${SEEN_AS_REFUSED.map((word) => word.replace(/\s+/g, '\\s+')).join('|')})`,
  'i',
);

export const isRefusedLine = (line: string, isAboutHealth: boolean) =>
  isAboutHealth || REFUSED_RE.test(line);

const cut = (text: string, cap: number) => {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= cap) return trimmed;
  const head = trimmed.slice(0, cap - 1);
  const space = head.lastIndexOf(' ');
  return `${(space > cap / 2 ? head.slice(0, space) : head).trimEnd()}…`;
};

export const cutSeenAsLine = (text: string) => cut(text, SEEN_AS_LIMITS.line);
export const cutCorrection = (text: string) =>
  cut(text, SEEN_AS_LIMITS.corrected);

const countWord = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** The code-built line under a line: what it rests on, by kind of source. */
export const buildSeenAsBasis = (sourceKeys: readonly string[]) => {
  const homes = sourceKeys.flatMap((key) => {
    const read = readSourceKey(key);
    return read ? [read.home] : [];
  });
  const count = (home: SeenAsSourceHome) =>
    homes.filter((each) => each === home).length;
  const parts = [
    count('observations') > 0
      ? countWord(count('observations'), 'thing you said', 'things you said')
      : null,
    count('patterns') > 0
      ? countWord(count('patterns'), 'pattern', 'patterns')
      : null,
    count('habits') > 0
      ? countWord(count('habits'), "habit's ticks", "habits' ticks")
      : null,
    count('style') > 0 ? 'how you write' : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return SEEN_AS_FROM_YOU;
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return cut(`From ${list}`, SEEN_AS_LIMITS.basis);
};

/** The basis of a corrected line whose sources are gone. */
export const SEEN_AS_FROM_YOU = 'From what you told me';

export interface SeenAsExisting {
  id: string;
  kind: SeenAsKind;
  state: SeenAsState;
  sourceKeys: string[];
  subjectRefs: string[];
  dontDrawFrom: string[];
  correctedAt: number | null;
  removedAt: number | null;
}

export interface SeenAsCandidate {
  /** The id worked out from `seenAsIdInput(kind, line)`. */
  id: string;
  kind: SeenAsKind;
  line: string;
  /** Resolved source keys, in the order given. */
  sourceKeys: string[];
  subjectRefs: string[];
  isAboutHealth: boolean;
  /** The newest instant among its sources. */
  newestSourceAt: number;
}

export type SeenAsRefusal =
  | 'fewSources'
  | 'health'
  | 'removed'
  | 'dontDraw'
  | 'corrected'
  | 'contradictsCorrection'
  | 'duplicate'
  | 'overCap';

/** Which returned lines may be written: at least two different sources, nothing about the body, never a removed line or one drawn from a removal's sources, and never over the person's correction unless it rests on something newer. */
export function checkSeenAsCandidates(
  candidates: readonly SeenAsCandidate[],
  existing: readonly SeenAsExisting[],
): {
  kept: SeenAsCandidate[];
  refused: { id: string; reason: SeenAsRefusal }[];
} {
  const byId = new Map(existing.map((line) => [line.id, line]));
  const removed = existing.filter((line) => line.state === 'removed');
  const corrected = existing.filter((line) => line.state === 'corrected');
  const reasonFor = (
    candidate: SeenAsCandidate,
    sources: string[],
  ): SeenAsRefusal | null => {
    if (sources.length < SEEN_AS_LIMITS.minSources) return 'fewSources';
    if (isRefusedLine(candidate.line, candidate.isAboutHealth)) return 'health';
    const same = byId.get(candidate.id);
    if (same?.state === 'removed') return 'removed';
    if (same?.state === 'corrected') return 'corrected';
    const isDrawnFromRemoval = removed.some(
      (line) =>
        line.kind === candidate.kind &&
        line.dontDrawFrom.some((key) => sources.includes(key)),
    );
    if (isDrawnFromRemoval) return 'dontDraw';
    const isOverCorrection = corrected.some(
      (line) =>
        line.kind === candidate.kind &&
        line.subjectRefs.some((ref) => candidate.subjectRefs.includes(ref)) &&
        candidate.newestSourceAt <= (line.correctedAt ?? 0),
    );
    if (isOverCorrection) return 'contradictsCorrection';
    return null;
  };
  return candidates.reduce<{
    kept: SeenAsCandidate[];
    refused: { id: string; reason: SeenAsRefusal }[];
  }>(
    (result, candidate) => {
      const sources = Array.from(new Set(candidate.sourceKeys)).slice(
        0,
        SEEN_AS_LIMITS.maxSources,
      );
      const reason = result.kept.some((kept) => kept.id === candidate.id)
        ? 'duplicate'
        : result.kept.length >= SEEN_AS_LIMITS.returned
          ? 'overCap'
          : reasonFor(candidate, sources);
      if (reason !== null) {
        return {
          ...result,
          refused: [...result.refused, { id: candidate.id, reason }],
        };
      }
      return {
        ...result,
        kept: [
          ...result.kept,
          {
            ...candidate,
            line: cutSeenAsLine(candidate.line),
            sourceKeys: sources,
          },
        ],
      };
    },
    { kept: [], refused: [] },
  );
}

export interface SeenAsRebuildPlan {
  /** New or re-derived shown lines, written whole. */
  write: SeenAsCandidate[];
  /** Shown lines this rebuild no longer derives, or whose sources fell under two. */
  remove: string[];
  /** Corrected lines whose sources changed: the kept keys and the new basis. */
  recite: { id: string; sourceKeys: string[]; basis: string }[];
  /** Removed lines past the cap: kept with only their id and state, so they still block. */
  strip: string[];
}

/** One rebuild: the kept lines replace the shown ones, corrections and removals stay, a corrected line drops the sources that are gone, and removed lines past the cap keep only their id. */
export function planSeenAsRebuild(
  kept: readonly SeenAsCandidate[],
  existing: readonly SeenAsExisting[],
  isSourceLive: (key: string) => boolean,
): SeenAsRebuildPlan {
  const keptIds = new Set(kept.map((line) => line.id));
  const remove = existing
    .filter((line) => line.state === 'shown' && !keptIds.has(line.id))
    .map((line) => line.id);
  const recite = existing
    .filter((line) => line.state === 'corrected')
    .flatMap((line) => {
      const live = line.sourceKeys.filter(isSourceLive);
      if (live.length === line.sourceKeys.length) return [];
      return [
        {
          id: line.id,
          sourceKeys: live,
          basis:
            live.length < SEEN_AS_LIMITS.minSources
              ? SEEN_AS_FROM_YOU
              : buildSeenAsBasis(live),
        },
      ];
    });
  const heldCount =
    kept.length +
    existing.filter((line) => line.state === 'corrected').length;
  const room = Math.max(0, SEEN_AS_LIMITS.records - heldCount);
  const strip = existing
    .filter((line) => line.state === 'removed')
    .sort((left, right) => (right.removedAt ?? 0) - (left.removedAt ?? 0))
    .slice(room)
    .filter((line) => line.sourceKeys.length > 0 || line.dontDrawFrom.length > 0)
    .map((line) => line.id);
  return { write: [...kept], remove, recite, strip };
}

/** When a shown line loses a source: the keys left, or null when under two are left and the line goes. */
export const cascadeShownLine = (
  sourceKeys: readonly string[],
  goneKey: string,
): string[] | null => {
  const left = sourceKeys.filter((key) => key !== goneKey);
  return left.length < SEEN_AS_LIMITS.minSources ? null : left;
};

/** The lines the model reads: corrected first, then shown, newest first within each, removed never. */
export const orderSeenAsForModel = <
  T extends { state: SeenAsState; at: number },
>(
  lines: readonly T[],
) =>
  [...lines]
    .filter((line) => line.state !== 'removed')
    .sort(
      (left, right) =>
        Number(right.state === 'corrected') -
          Number(left.state === 'corrected') || right.at - left.at,
    )
    .slice(0, SEEN_AS_LIMITS.toModel);

/** Whether the nightly pass should rebuild the lines tonight. */
export const isSeenAsRebuildDue = (
  lastRebuildAt: number | null,
  newObservationsSince: number,
  now: number,
) =>
  lastRebuildAt === null ||
  now - lastRebuildAt >= SEEN_AS_LIMITS.rebuildDays * 86_400_000 ||
  newObservationsSince >= SEEN_AS_LIMITS.rebuildObservations;

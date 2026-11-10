import { createOptionMatcher } from '../../../vendor/optionMatchUtils.js';
import type { MentionKind } from './commands.js';

export interface KnownWho {
  id: string;
  kind: MentionKind;
  name: string;
  aliases: string[];
}

export interface KnownPlace {
  id: string;
  name: string;
  aliases: string[];
  address?: string | null;
}

export type EntityMatch =
  | { kind: 'match'; id: string }
  | { kind: 'new' }
  | { kind: 'unsure'; candidateIds: string[] }
  | { kind: 'dropped' };

interface Named {
  id: string;
  name: string;
  aliases: string[];
}

type Matcher = ReturnType<typeof createOptionMatcher<Named>>;

const whoMatcher = createOptionMatcher<Named>({
  names: (known) => [known.name, ...known.aliases],
});

// "the Ferry Building" and "Ferry Building" are one place; a person's name keeps its words.
const placeMatcher = createOptionMatcher<Named>({
  names: (known) => [known.name, ...known.aliases],
  prepare: (text) => text.replace(/^\s*the\s+/i, ''),
});

export const MAX_CANDIDATES = 4;

const rankCandidates = (
  matcher: Matcher,
  name: string,
  known: Named[],
  sureId: string | null,
) => {
  const wordsOf = (text: string) =>
    matcher
      .comparable(text)
      .split(' ')
      .filter((word) => word.length > 1);
  const words = new Set(wordsOf(name));
  const scored = known.flatMap((option, index) => {
    const shared = Math.max(
      0,
      ...[option.name, ...option.aliases].map(
        (other) => wordsOf(other).filter((word) => words.has(word)).length,
      ),
    );
    return option.id === sureId || shared > 0
      ? [
          {
            id: option.id,
            index,
            rank: option.id === sureId ? Infinity : shared,
          },
        ]
      : [];
  });
  return scored
    .sort((left, right) => right.rank - left.rank || left.index - right.index)
    .slice(0, MAX_CANDIDATES)
    .map(({ id }) => id);
};

const settle = (
  matcher: Matcher,
  name: string,
  known: Named[],
  assistantName: string | null,
  isSameKind: (option: Named) => boolean,
): EntityMatch => {
  const wordsOf = (text: string) =>
    matcher
      .comparable(text)
      .split(' ')
      .filter((word) => word.length > 1);
  const comparable = matcher.comparable(name);
  if (comparable === '') return { kind: 'dropped' };
  if (assistantName && comparable === matcher.comparable(assistantName)) {
    return { kind: 'dropped' };
  }
  const sure = matcher.match(name, known);
  if (sure)
    return isSameKind(sure)
      ? { kind: 'match', id: sure.id }
      : {
          kind: 'unsure',
          candidateIds: rankCandidates(matcher, name, known, sure.id),
        };
  const words = new Set(wordsOf(name));
  const isNearby = known.some((option) =>
    [option.name, ...option.aliases].some((other) =>
      wordsOf(other).some((word) => words.has(word)),
    ),
  );
  return isNearby
    ? {
        kind: 'unsure',
        candidateIds: rankCandidates(matcher, name, known, null),
      }
    : { kind: 'new' };
};

/** One result per mention; the same name on another kind of who is unsure, never a match, and an unsure result lists the people it might be, best first. */
export function matchWho(input: {
  mentions: { name: string; kind: MentionKind }[];
  known: KnownWho[];
  assistantName: string | null;
}): EntityMatch[] {
  const kinds = new Map(input.known.map((who) => [who.id, who.kind]));
  return input.mentions.map((mention) =>
    settle(
      whoMatcher,
      mention.name,
      input.known,
      input.assistantName,
      (option) => kinds.get(option.id) === mention.kind,
    ),
  );
}

/** The same for the person's places: names and aliases, one result per name. */
export function matchPlaces(input: {
  names: string[];
  known: KnownPlace[];
  assistantName: string | null;
}): EntityMatch[] {
  return input.names.map((name) =>
    settle(placeMatcher, name, input.known, input.assistantName, () => true),
  );
}

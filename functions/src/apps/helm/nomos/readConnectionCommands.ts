import { toComparable } from '../../../vendor/optionMatchUtils.js';
import type { AliasBook } from './aliases.js';
import {
  CONNECTION_COMMAND_KINDS,
  MAX_CONNECTIONS_PER_TURN,
  type CaptureReading,
  type ConnectionCommand,
} from './commands.js';
import {
  CONNECTION_KINDS,
  CONNECTION_STATUSES,
  type ConnectionRelation,
} from './connections.js';
import { toKinKind } from './kin.js';
import { KIN_KINDS, type KinKind } from './kinKinds.js';
import { isQuestion } from './route.js';
import { getDayIn, toKnownZone } from './spoken.js';

export interface ConnectionReadContext {
  people?: AliasBook;
  reading: CaptureReading;
  captureText?: string;
  /** Every name and alias each listed person answers to, by id. */
  personNames?: Map<string, string[]>;
  timeZone?: string;
}

type Party = { isKnown: true; id: string | null } | { isKnown: false };

const toParty = (alias: unknown, people: AliasBook | undefined): Party => {
  if (typeof alias !== 'string') return { isKnown: false };
  if (alias.trim().toLowerCase() === 'me') return { isKnown: true, id: null };
  const id = people?.idOf(alias) ?? null;
  return id ? { isKnown: true, id } : { isKnown: false };
};

const OWNER_WORDS = /\b(?:i|me|my|myself|mine)\b/i;

const isNamedIn = (
  party: { id: string | null },
  text: string,
  words: string,
  names: Map<string, string[]> | undefined,
) =>
  party.id === null
    ? OWNER_WORDS.test(text)
    : (names?.get(party.id) ?? []).some((name) => {
        const comparable = toComparable(name);
        return comparable !== '' && words.includes(` ${comparable} `);
      });

const CASUAL_KIN: Partial<Record<KinKind, string[]>> = {
  mother: ['mom', 'mum', 'mommy', 'mama', 'ma'],
  father: ['dad', 'daddy', 'papa', 'pa'],
  grandmother: ['grandma', 'granny', 'nana'],
  grandfather: ['grandpa', 'granddad'],
  stepmother: ['stepmom', 'stepmum'],
  stepfather: ['stepdad'],
};

/** How the person calls someone by their family word ("my mother", "my mom"), from the context's family text such as "older sister". */
export const toKinCallNames = (kinText: string | null): string[] => {
  const text = ` ${(kinText ?? '').trim().toLowerCase()}`;
  const entry = [...KIN_KINDS]
    .sort((a, b) => b.spoken.length - a.spoken.length)
    .find((known) => text.endsWith(` ${known.spoken}`));
  if (!entry) return [];
  return [entry.spoken, ...(CASUAL_KIN[entry.kind] ?? [])].map(
    (word) => `my ${word}`,
  );
};

const toRelation = (value: unknown): ConnectionRelation | null =>
  value === 'friend' || value === 'coworker' ? value : toKinKind(value);

const toSince = (
  value: unknown,
  reading: CaptureReading,
  timeZone: string,
): number | null => {
  const span =
    typeof value === 'string'
      ? reading.dates.find((entry) => entry.id === value)
      : undefined;
  if (!span || span.precision) return null;
  return span.due.kind === 'day'
    ? span.due.date
    : getDayIn(span.due.at, toKnownZone(timeZone));
};

/** Both people must be listed in the context (or the person themself) and named in the words, the quote must be from the turn, one command stands for a pair (the last said), and a question links no one. */
export const readConnectionCommands = (
  items: Record<string, unknown>[],
  context: ConnectionReadContext,
): ConnectionCommand[] => {
  const text = context.captureText ?? '';
  if (isQuestion(text.trim())) return [];
  const words = ` ${toComparable(text)} `;
  const timeZone = context.timeZone ?? 'UTC';
  const read = items
    .filter((item) =>
      (CONNECTION_COMMAND_KINDS as readonly unknown[]).includes(item.kind),
    )
    .flatMap((item): ConnectionCommand[] => {
      const quote =
        typeof item.requestQuote === 'string' ? item.requestQuote.trim() : '';
      const first = toParty(item.whoAlias, context.people);
      const second = toParty(item.otherWhoAlias, context.people);
      const isQuoted =
        toComparable(quote).split(' ').filter(Boolean).length >= 2 &&
        words.includes(` ${toComparable(quote)} `);
      if (!first.isKnown || !second.isKnown || !isQuoted) return [];
      if (first.id === second.id) return [];
      if (
        !isNamedIn(first, text, words, context.personNames) ||
        !isNamedIn(second, text, words, context.personNames)
      )
        return [];
      const connectionKind =
        CONNECTION_KINDS.find((entry) => entry === item.connectionKind) ?? null;
      const isCouple =
        connectionKind === 'couple' ||
        (item.kind === 'updateConnection' && connectionKind === null);
      const status = isCouple
        ? (CONNECTION_STATUSES.find((entry) => entry === item.coupleStatus) ??
          null)
        : null;
      const since = isCouple
        ? toSince(item.dateSpanId, context.reading, timeZone)
        : null;
      const relation =
        connectionKind === 'family' || connectionKind === null
          ? toRelation(item.connectionRelation)
          : null;
      const pair = { firstWhoId: first.id, secondWhoId: second.id };
      if (item.kind === 'disconnect')
        return [
          { kind: 'disconnect', ...pair, connectionKind, requestQuote: quote },
        ];
      if (item.kind === 'updateConnection') {
        const isChange = relation !== null || status !== null || since !== null;
        return isChange
          ? [
              {
                kind: 'updateConnection',
                ...pair,
                connectionKind,
                relation,
                status,
                since,
                requestQuote: quote,
              },
            ]
          : [];
      }
      if (connectionKind === null) return [];
      if (
        connectionKind === 'family' &&
        (relation === null || relation === 'friend' || relation === 'coworker')
      )
        return [];
      return [
        {
          kind: 'connect',
          ...pair,
          connectionKind,
          relation,
          status,
          since,
          requestQuote: quote,
        },
      ];
    });
  return [
    ...new Map(
      read.map((command) => [
        [command.firstWhoId ?? 'me', command.secondWhoId ?? 'me']
          .sort()
          .join(':'),
        command,
      ]),
    ).values(),
  ].slice(0, MAX_CONNECTIONS_PER_TURN);
};

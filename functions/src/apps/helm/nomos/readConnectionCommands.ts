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
import { isQuestion } from './route.js';
import { getDayIn, toKnownZone } from './spoken.js';

export interface ConnectionReadContext {
  people?: AliasBook;
  reading: CaptureReading;
  captureText?: string;
  timeZone?: string;
}

type Party = { isKnown: true; id: string | null } | { isKnown: false };

const toParty = (alias: unknown, people: AliasBook | undefined): Party => {
  if (typeof alias !== 'string') return { isKnown: false };
  if (alias.trim().toLowerCase() === 'me') return { isKnown: true, id: null };
  const id = people?.idOf(alias) ?? null;
  return id ? { isKnown: true, id } : { isKnown: false };
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

/** Reads the reply's link commands from their own list. Both people must be ones the context listed (or the person themself), the words must be quoted from the turn, and a question never links anyone. */
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
        `${command.kind}:${command.firstWhoId ?? 'me'}:${command.secondWhoId ?? 'me'}:${command.connectionKind ?? ''}`,
        command,
      ]),
    ).values(),
  ].slice(0, MAX_CONNECTIONS_PER_TURN);
};

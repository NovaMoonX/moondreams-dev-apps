import { openForHelm, type HelmKey } from '../helmKey.js';
import {
  isPrivateInEffect,
  readPrivacyFacts,
  type PrivacyFacts,
} from '../privacy.js';
import type { SealedPayload } from '../../../appKeys/seal.js';
import { MAX_CONTEXT_PEOPLE, type ContextPerson } from './buildContext.js';
import {
  readContactPoints,
  sortPrimaryFirst,
  type ContactPoint,
} from './contactPoints.js';
import type { ByWho } from '../keyDateIndex.js';
import { normalizeKin, type KinBirthday } from './kin.js';
import { KIN_KINDS, type WhoKin } from './kinKinds.js';
import {
  inferFamilyLinks,
  isShownConnection,
  reverseRelation,
  type ConnectionKind,
  type ConnectionRelation,
  type ConnectionSource,
  type CoupleStatus,
  type ImpliedConnectionState,
  type InferredLink,
} from './connections.js';

export interface PersonRecord {
  id: string;
  isSelf: boolean;
  kind: 'person' | 'pet' | 'organization';
  isPrivate: boolean;
  lastMentionedAt: number | null;
  words: {
    name: string;
    aliases: string[];
    relation: string | null;
    kin: unknown;
    phones: ContactPoint[];
    emails: ContactPoint[];
  };
}

export const toPrivateMark = (value: unknown): PrivacyFacts['privateMark'] =>
  value === 'health' || value === 'care' || value === 'person' ? value : null;

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/** A who document as the context reads it. Privacy comes from the sealed facts, as `readPeople` reads it: a who's mark is sealed, never a readable field. Null when it will not open. */
export const toPersonRecord = (
  key: HelmKey,
  doc: { id: string; get: (field: string) => unknown },
): PersonRecord | null => {
  try {
    const words = openForHelm(key, doc.get('sealed') as SealedPayload);
    if (typeof words.name !== 'string') return null;
    const lastMentionedAt = doc.get('lastMentionedAt');
    return {
      id: doc.id,
      isSelf: doc.get('isSelf') === true,
      kind:
        doc.get('kind') === 'pet' || doc.get('kind') === 'organization'
          ? (doc.get('kind') as 'pet' | 'organization')
          : 'person',
      isPrivate: isPrivateInEffect(
        readPrivacyFacts({
          privateMark: toPrivateMark(words.privateMark),
          isPrivacyCleared: words.isPrivacyCleared === true,
        }),
      ),
      lastMentionedAt: Number.isFinite(lastMentionedAt)
        ? Number(lastMentionedAt)
        : null,
      words: {
        name: words.name,
        aliases: isStringList(words.aliases) ? words.aliases : [],
        relation: typeof words.relation === 'string' ? words.relation : null,
        kin: words.kin,
        phones: readContactPoints('phone', words),
        emails: readContactPoints('email', words),
      },
    };
  } catch {
    return null;
  }
};

/** "younger brother": the family word as the person says it, with its order first. */
export const toKinText = (kin: WhoKin) =>
  [
    kin.order,
    KIN_KINDS.find((entry) => entry.kind === kin.kind)?.spoken ?? kin.kind,
  ]
    .filter(Boolean)
    .join(' ');

/** The most labelled numbers or addresses of one kind a person's context line carries, the primary always first. */
export const MAX_CONTEXT_CONTACTS = 2;

export const MAX_CONTEXT_CONNECTIONS = 8;

const toContextContacts = (points: ContactPoint[]) =>
  sortPrimaryFirst(points)
    .slice(0, MAX_CONTEXT_CONTACTS)
    .map(({ value, label, isPrimary }) => ({ value, label, isPrimary }));

const toConnectionWords = (
  whoId: string,
  connections: ContextConnection[],
  figuredOut: InferredLink[],
  names: Map<string, string>,
) => {
  const lines = [
    ...connections
      .filter((connection) => connection.whoIds.includes(whoId))
      .flatMap((connection) => toConnectionText(connection, whoId, names)),
    ...figuredOut
      .filter((link) => [link.firstId, link.secondId].includes(whoId))
      .flatMap((link) => toFiguredText(link, whoId, names)),
  ].slice(0, MAX_CONTEXT_CONNECTIONS);
  return lines.length > 0 ? { connections: lines } : {};
};

/** What reaching a person is read as: nothing for a private person, whose numbers and addresses never leave the device in a turn. */
const toContactWords = (record: PersonRecord) =>
  record.isPrivate
    ? {}
    : {
        ...(record.words.phones.length > 0 && {
          phones: toContextContacts(record.words.phones),
        }),
        ...(record.words.emails.length > 0 && {
          emails: toContextContacts(record.words.emails),
        }),
      };

export interface ContextConnection {
  whoIds: [string, string];
  kind: ConnectionKind;
  source: ConnectionSource;
  fromFirst: ConnectionRelation | null;
  fromSecond: ConnectionRelation | null;
  status: CoupleStatus | null;
  since: number | null;
}

const STATUS_PHRASES: Record<CoupleStatus, (name: string) => string> = {
  dating: (name) => `dating ${name}`,
  engaged: (name) => `engaged to ${name}`,
  married: (name) => `married to ${name}`,
  separated: (name) => `separated from ${name}`,
  divorced: (name) => `divorced from ${name}`,
  widowed: (name) => `widowed, ${name} passed away`,
};

const toRelationText = (relation: ConnectionRelation | null) =>
  relation === null || relation === 'friend' || relation === 'coworker'
    ? null
    : (KIN_KINDS.find((entry) => entry.kind === relation)?.written ?? null);

/** Never for a pair with a private, pet or organization end, a refusal, or words that would not open. */
const toConnectionText = (
  connection: ContextConnection,
  whoId: string,
  names: Map<string, string>,
) => {
  const [first, second] = connection.whoIds;
  const isFirst = whoId === first;
  const otherId = isFirst ? second : first;
  const other = names.get(otherId);
  if (!other) return [];
  const relation = isFirst ? connection.fromSecond : connection.fromFirst;
  const sinceText =
    connection.since === null
      ? ''
      : ` since ${new Date(connection.since).getUTCFullYear()}`;
  if (connection.kind === 'couple')
    return [
      `${
        connection.status === null
          ? `partner of ${other}`
          : STATUS_PHRASES[connection.status](other)
      }${sinceText}`,
    ];
  if (connection.kind === 'friend') return [`friends with ${other}`];
  if (connection.kind === 'work') return [`works with ${other}`];
  const word = toRelationText(relation);
  return [word ? `${other} is their ${word}` : `${other} is family`];
};

const toFiguredText = (
  link: InferredLink,
  whoId: string,
  names: Map<string, string>,
) => {
  const isFirst = link.firstId === whoId;
  const otherId = isFirst ? link.secondId : link.firstId;
  const other = names.get(otherId);
  if (!other) return [];
  const relation = isFirst
    ? link.relationOfFirstToSecond === null
      ? null
      : reverseRelation(link.relationOfFirstToSecond, link.genders.second)
    : link.relationOfFirstToSecond;
  const word = toRelationText(relation);
  return [
    `${word ? `${other === 'you' ? 'you are' : `${other} is`} their ${word}` : `${other === 'you' ? 'you are' : `${other} is`} family`} (figured out)`,
  ];
};

/** The people the model is shown to link a name to: never the self, and on an unattended turn never a private one; those with another name or a family word first, then the most recently named. */
export function toContextPeople(
  records: PersonRecord[],
  options: {
    isUnattended: boolean;
    connections?: ContextConnection[];
    unreadableConnections?: ImpliedConnectionState[];
    selfWhoId?: string | null;
  },
): ContextPerson[] {
  const linkable = new Map(
    records
      .filter(
        (record) =>
          record.kind === 'person' &&
          !record.isPrivate &&
          record.words.name.trim() !== '',
      )
      .map((record) => [record.id, record.isSelf ? 'you' : record.words.name]),
  );
  const shownConnections = (options.connections ?? []).filter(
    (connection) =>
      isShownConnection(connection) &&
      connection.whoIds.every((id) => linkable.has(id)),
  );
  const kinById = new Map(
    records.map((record) => [record.id, normalizeKin(record.words.kin)]),
  );
  const figuredOut = inferFamilyLinks({
    selfId:
      records.find((record) => record.isSelf)?.id ?? options.selfWhoId ?? null,
    people: records.map((record) => ({
      id: record.id,
      kin: kinById.get(record.id) ?? null,
      isPrivate: record.isPrivate,
      isPerson: record.kind === 'person',
    })),
    connections: [
      ...(options.connections ?? []).map((connection) => ({
        ...connection,
        isUnreadable: false,
      })),
      ...(options.unreadableConnections ?? []).map((connection) => ({
        ...connection,
        fromFirst: null,
        fromSecond: null,
        isUnreadable: true,
      })),
    ],
  });
  return records
    .filter(
      (record) =>
        !record.isSelf &&
        record.words.name.trim() !== '' &&
        !(options.isUnattended && record.isPrivate),
    )
    .map((record) => ({
      record,
      kin: normalizeKin(record.words.kin),
    }))
    .sort(
      (a, b) =>
        Number(b.kin !== null || b.record.words.aliases.length > 0) -
          Number(a.kin !== null || a.record.words.aliases.length > 0) ||
        (b.record.lastMentionedAt ?? 0) - (a.record.lastMentionedAt ?? 0),
    )
    .slice(0, MAX_CONTEXT_PEOPLE)
    .map(({ record, kin }) => ({
      id: record.id,
      name: record.words.name,
      alsoCalled: record.words.aliases,
      relation: record.words.relation,
      kin: kin ? toKinText(kin) : null,
      ...toContactWords(record),
      ...toConnectionWords(record.id, shownConnections, figuredOut, linkable),
    }));
}

/** Each person's birthday from the yearly index (a year only when one was given); a person with none is left out. */
export const toBirthdays = (byWho: ByWho): Record<string, KinBirthday | null> =>
  Object.fromEntries(
    Object.entries(byWho).flatMap(([whoId, entries]) => {
      const birthday = entries.find((entry) => entry[1] === 'birthday');
      return birthday
        ? [[whoId, { month: birthday[2], day: birthday[3], year: birthday[4] }]]
        : [];
    }),
  );

import { createHmac } from 'node:crypto';

import type { SealedPayload } from '../../../appKeys/seal.js';
import { buildWhoDoc } from './executeCommands.js';
import type { Effect, EffectRef } from './executeCommands.js';
import { formatYearlyDate } from '../../../vendor/yearlyDateUtils.js';
import type { IndexChange } from '../keyDateIndex.js';
import { matchWho } from './matchEntities.js';
import {
  MAX_YEARLY_PER_WHO,
  checkKeyDateParts,
  partsPaths,
  toIndexEntry,
  type KeyDateParts,
} from './planKeyDates.js';
import { buildKeyDateLine } from './summaries.js';
import { readWhoTier } from './whoTier.js';

export const PHOTOS_PER_WHO = 12;

/** What a person's Google contact is read as; the planner never sees anything else about it. */
export interface ContactInput {
  resourceName: string;
  name: string;
  emails: string[];
  phones: string[];
  photoUrl: string | null;
  /** Google's birthday; the year is null when Google gives none. */
  birthday?: { month: number; day: number; year: number | null } | null;
}

export interface ImportedFrom {
  connectorId: 'google:contacts';
  accountId: string;
  resourceName: string;
  importedAt: number;
}

/** A who the person already has, its words opened. */
export interface ExistingWho {
  id: string;
  kind: 'person' | 'pet' | 'organization';
  isSelf: boolean;
  name: string;
  aliases: string[];
  email: string | null;
  phone: string | null;
  photoMediaId: string | null;
  mediaIds: string[];
  importedFrom: ImportedFrom | null;
  importedFields: Record<string, string>;
  lastMentionedAt: number | null;
  sealed: Record<string, unknown>;
  /** The nonce of the sealed words as read, so a write can tell the who changed meanwhile. */
  sealedNonce: string;
  /** How many dates that come back the who holds. */
  yearlyDateCount: number;
  /** The who's birthday as the yearly index holds it. */
  birthday: BirthdayOf | null;
}

interface Birthday {
  month: number;
  day: number;
  year: number | null;
}

export interface BirthdayOf {
  id: string;
  month: number;
  day: number | null;
  year: number | null;
}

type TextField = 'name' | 'email' | 'phone';

export interface WhoChange {
  id: string;
  before: ExistingWho | null;
  contact: ContactInput;
  /** The words to write: every field for a new who, only the empty or unedited ones for an existing one. */
  fields: Partial<Record<TextField, string>>;
  photo: { mediaId: string; url: string } | null;
  /** Google's birthday: written into an empty one, or replacing one the person has not edited. */
  birthday: BirthdayChange | null;
}

export type BirthdayChange =
  | { kind: 'add'; id: string; value: Birthday }
  | { kind: 'replace'; id: string; value: Birthday; was: BirthdayOf };

export type NewId = (collection: 'who' | 'media' | 'keyDates') => string;

export type Digest = (field: string, value: string) => string;

/** A keyed digest of a field's value: it tells later whether the field is still as imported without keeping the value readable. */
export const createDigest =
  (key: Buffer): Digest =>
  (field, value) =>
    createHmac('sha256', key).update(`${field}\n${value}`).digest('hex');

/** A who id derived from the contact, so two imports of one contact cannot both create it. */
export const toWhoId = (
  digest: Digest,
  accountId: string,
  resourceName: string,
) => digest('whoId', `${accountId}\n${resourceName}`).slice(0, 20);

const emailKey = (email: string) => email.trim().toLowerCase();

const phoneKey = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : null;
};

const findMatch = (
  contact: ContactInput,
  known: ExistingWho[],
  accountId: string,
) => {
  const people = known.filter((who) => who.kind === 'person' && !who.isSelf);
  const emails = new Set(contact.emails.map(emailKey));
  const phones = new Set(
    contact.phones.flatMap((phone) => phoneKey(phone) ?? []),
  );
  const isSameContact = (who: ExistingWho) =>
    who.importedFrom?.accountId === accountId &&
    who.importedFrom.resourceName === contact.resourceName;
  const isNameCandidate = (who: ExistingWho) => {
    const phone = who.phone === null ? null : phoneKey(who.phone);
    return (
      who.importedFrom === null &&
      (who.email === null || emails.has(emailKey(who.email))) &&
      (phone === null || phones.has(phone))
    );
  };
  const byName = matchWho({
    mentions: [{ name: contact.name, kind: 'person' }],
    known: people.filter(isNameCandidate).map((who) => ({
      id: who.id,
      kind: who.kind,
      name: who.name,
      aliases: who.aliases,
      lastMentionedAt: who.lastMentionedAt,
    })),
    assistantName: null,
  })[0];
  return (
    people.find(isSameContact) ??
    people.find(
      (who) => who.email !== null && emails.has(emailKey(who.email)),
    ) ??
    people.find((who) => {
      const key = who.phone === null ? null : phoneKey(who.phone);
      return key !== null && phones.has(key);
    }) ??
    (byName.kind === 'match'
      ? people.find((who) => who.id === byName.id)
      : undefined) ??
    null
  );
};

const birthdayKey = (value: {
  month: number;
  day: number | null;
  year: number | null;
}) => `${value.month}-${value.day}-${value.year ?? ''}`;

/** Google's birthday as the code would keep it: a year that can't be one is dropped, a day that can't be one drops the birthday. */
const usableBirthday = (birthday: Birthday | null | undefined) => {
  if (!birthday) return null;
  const thisYear = new Date().getFullYear();
  const check = (year: number | null) =>
    checkKeyDateParts(
      {
        kind: 'birthday',
        label: null,
        month: birthday.month,
        day: birthday.day,
        year,
      },
      thisYear,
    );
  const refusal = check(birthday.year);
  if (refusal === null) return birthday;
  return refusal === 'badYear' && check(null) === null
    ? { ...birthday, year: null }
    : null;
};

/** A birthday goes into an empty one only, and never past the cap of dates a who holds. */
const addBirthday = (
  contact: ContactInput,
  who: ExistingWho | null,
  newId: NewId,
): BirthdayChange | null => {
  const value = usableBirthday(contact.birthday);
  return value &&
    who?.birthday == null &&
    (who?.yearlyDateCount ?? 0) < MAX_YEARLY_PER_WHO
    ? { kind: 'add', id: newId('keyDates'), value }
    : null;
};

const photoFor = (
  contact: ContactInput,
  who: ExistingWho | null,
  newId: NewId,
) =>
  contact.photoUrl !== null && (who?.mediaIds.length ?? 0) < PHOTOS_PER_WHO
    ? { mediaId: newId('media'), url: contact.photoUrl }
    : null;

/** Decides, for each picked contact Google really returned, whether it makes a who or fills an existing one's empty fields. A requested name Google didn't return is ignored, and so is anything the caller said about it. */
export function planContactImport(input: {
  requested: string[];
  fetched: ContactInput[];
  existing: ExistingWho[];
  accountId: string;
  digest: Digest;
  newId: NewId;
}): { changes: WhoChange[]; alreadyIn: number } {
  const byName = new Map(
    input.fetched.map((contact) => [contact.resourceName, contact]),
  );
  const contacts = [...new Set(input.requested)].flatMap(
    (name) => byName.get(name) ?? [],
  );
  const settled = contacts.reduce<{
    known: ExistingWho[];
    touched: Set<string>;
    changes: WhoChange[];
    alreadyIn: number;
  }>(
    (state, contact) => {
      const match = findMatch(contact, state.known, input.accountId);
      const importedFrom: ImportedFrom = {
        connectorId: 'google:contacts',
        accountId: input.accountId,
        resourceName: contact.resourceName,
        importedAt: 0,
      };
      if (match && state.touched.has(match.id))
        return { ...state, alreadyIn: state.alreadyIn + 1 };
      if (!match) {
        const id = toWhoId(input.digest, input.accountId, contact.resourceName);
        const made: ExistingWho = {
          id,
          kind: 'person',
          isSelf: false,
          name: contact.name,
          aliases: [],
          email: contact.emails[0] ?? null,
          phone: contact.phones[0] ?? null,
          photoMediaId: null,
          mediaIds: [],
          importedFrom,
          importedFields: {},
          lastMentionedAt: null,
          sealed: {},
          sealedNonce: '',
          yearlyDateCount: 0,
          birthday: null,
        };
        return {
          ...state,
          known: [...state.known, made],
          touched: new Set([...state.touched, id]),
          changes: [
            ...state.changes,
            {
              id,
              before: null,
              contact,
              fields: {
                name: contact.name,
                ...(made.email && { email: made.email }),
                ...(made.phone && { phone: made.phone }),
              },
              photo: photoFor(contact, null, input.newId),
              birthday: addBirthday(contact, null, input.newId),
            },
          ],
        };
      }
      const fields: WhoChange['fields'] = {
        ...(match.email === null && contact.emails[0]
          ? { email: contact.emails[0] }
          : {}),
        ...(match.phone === null && contact.phones[0]
          ? { phone: contact.phones[0] }
          : {}),
      };
      const photo =
        match.photoMediaId === null
          ? photoFor(contact, match, input.newId)
          : null;
      const birthday = addBirthday(contact, match, input.newId);
      if (Object.keys(fields).length === 0 && !photo && !birthday)
        return { ...state, alreadyIn: state.alreadyIn + 1 };
      const filled: ExistingWho = {
        ...match,
        importedFrom: match.importedFrom ?? importedFrom,
        email: fields.email ?? match.email,
        phone: fields.phone ?? match.phone,
        photoMediaId: photo ? photo.mediaId : match.photoMediaId,
      };
      return {
        ...state,
        known: state.known.map((who) => (who.id === match.id ? filled : who)),
        touched: new Set([...state.touched, match.id]),
        changes: [
          ...state.changes,
          { id: match.id, before: match, contact, fields, photo, birthday },
        ],
      };
    },
    { known: input.existing, touched: new Set(), changes: [], alreadyIn: 0 },
  );
  return { changes: settled.changes, alreadyIn: settled.alreadyIn };
}

/** "Update from Google" for one who: a field Google changed is replaced only when it still equals what was imported, so an edited (or cleared) field survives; a field never imported is filled when empty. */
export function planContactUpdate(input: {
  contact: ContactInput;
  who: ExistingWho;
  digest: Digest;
  newId: NewId;
}): WhoChange | null {
  const { contact, who, digest } = input;
  const current: Record<TextField, string | null> = {
    name: who.name,
    email: who.email,
    phone: who.phone,
  };
  const incoming: Record<TextField, string | null> = {
    name: contact.name,
    email: contact.emails[0] ?? null,
    phone: contact.phones[0] ?? null,
  };
  const fields = (['name', 'email', 'phone'] as const).flatMap((field) => {
    const next = incoming[field];
    const was = who.importedFields[field];
    const value = current[field];
    if (next === null || next === value) return [];
    const isUnedited =
      was === undefined
        ? value === null
        : value !== null && digest(field, value) === was;
    return isUnedited ? [[field, next] as const] : [];
  });
  const isPhotoNew =
    contact.photoUrl !== null &&
    digest('photoUrl', contact.photoUrl) !== who.importedFields.photoUrl;
  const isPhotoUntouched =
    who.photoMediaId === null ||
    digest('photo', who.photoMediaId) === who.importedFields.photo;
  const photo =
    isPhotoNew && isPhotoUntouched && who.mediaIds.length < PHOTOS_PER_WHO
      ? photoFor(contact, who, input.newId)
      : null;
  const incomingBirthday = usableBirthday(contact.birthday);
  const isBirthdayUnedited =
    who.birthday !== null &&
    who.importedFields.birthday !== undefined &&
    digest('birthday', birthdayKey(who.birthday)) ===
      who.importedFields.birthday;
  const birthday: BirthdayChange | null =
    incomingBirthday === null
      ? null
      : who.birthday === null
        ? who.importedFields.birthday === undefined
          ? addBirthday(contact, who, input.newId)
          : null
        : isBirthdayUnedited &&
            birthdayKey(who.birthday) !== birthdayKey(incomingBirthday)
          ? {
              kind: 'replace',
              id: who.birthday.id,
              value: incomingBirthday,
              was: who.birthday,
            }
          : null;
  return fields.length === 0 && !photo && !birthday
    ? null
    : {
        id: who.id,
        before: who,
        contact,
        fields: Object.fromEntries(fields),
        photo,
        birthday,
      };
}

const sealBirthday = (birthday: BirthdayChange, ownerName: string) => {
  const { value } = birthday;
  const sealedParts: KeyDateParts = {
    kind: 'birthday',
    label: null,
    month: value.month,
    day: value.day,
    year: value.year,
    captureId: null,
  };
  const title = buildKeyDateLine({
    verb: birthday.kind === 'add' ? 'Added' : 'Changed',
    owner: ownerName,
    kind: 'birthday',
    label: null,
    when: formatYearlyDate(value),
  });
  return { title, sealedParts, birthday };
};

export interface PhotoSeal {
  bytesNonce: string;
  thumbNonce: string;
}

export interface ImportWrites {
  whoCreates: { id: string; data: Record<string, unknown> }[];
  whoUpdates: { id: string; data: Record<string, unknown> }[];
  media: { id: string; data: Record<string, unknown> }[];
  keyDateCreates: { id: string; data: Record<string, unknown> }[];
  keyDateUpdates: { id: string; data: Record<string, unknown> }[];
  /** Index changes for the birthdays written, applied in the same transaction. */
  indexChanges: IndexChange[];
  /** Dates gained per existing who; a new who's count is in its document. */
  counterDeltas: Map<string, number>;
  effectRefs: EffectRef[];
  effects: Effect[];
  createdCount: number;
}

/** The documents and Execution record for the planned changes. A photo that could not be fetched or shrunk is simply not attached. */
export function buildImportWrites(input: {
  changes: WhoChange[];
  photos: Map<string, PhotoSeal>;
  accountId: string;
  now: number;
  executionId: string;
  keyId: string;
  digest: Digest;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}): ImportWrites {
  const { now, seal, digest } = input;
  const parts = input.changes.map((change) => {
    const { before, contact, fields, photo } = change;
    const sealedPhoto = photo
      ? (input.photos.get(photo.mediaId) ?? null)
      : null;
    const kept = photo && sealedPhoto ? { photo, sealed: sealedPhoto } : null;
    const importedFrom: ImportedFrom = before?.importedFrom ?? {
      connectorId: 'google:contacts',
      accountId: input.accountId,
      resourceName: contact.resourceName,
      importedAt: now,
    };
    const importedFields = {
      ...before?.importedFields,
      ...Object.fromEntries(
        Object.entries(fields).map(([field, value]) => [
          field,
          digest(field, value),
        ]),
      ),
      ...(kept
        ? {
            photo: digest('photo', kept.photo.mediaId),
            photoUrl: digest('photoUrl', kept.photo.url),
          }
        : {}),
      ...(change.birthday
        ? { birthday: digest('birthday', birthdayKey(change.birthday.value)) }
        : {}),
    };
    const ownerName = before?.name ?? contact.name;
    const dated = change.birthday
      ? sealBirthday(change.birthday, ownerName)
      : null;
    const mediaIds = [
      ...(before?.mediaIds ?? []),
      ...(kept ? [kept.photo.mediaId] : []),
    ];
    const mediaDoc = kept
      ? {
          id: kept.photo.mediaId,
          data: {
            kind: 'photo',
            role: 'photo',
            status: 'kept',
            mimeType: 'image/webp',
            hasThumb: true,
            attachedTo: [{ kind: 'who', id: change.id }],
            decidedBy: 'person',
            createdAt: now,
            decidedAt: now,
            deleteAfter: null,
            sealed: seal({
              bytesNonce: kept.sealed.bytesNonce,
              thumbNonce: kept.sealed.thumbNonce,
              keyId: input.keyId,
            }),
          },
        }
      : null;
    const photoFields = kept
      ? { photoMediaId: kept.photo.mediaId, mediaIds }
      : {};
    if (before === null) {
      const tier = readWhoTier({
        tier: 'regular',
        tierSetBy: 'nomos',
        mentionDayKeys: [],
        taskLinkCount: 0,
        hasRole: false,
      });
      const doc = {
        ...buildWhoDoc({
          mention: {
            ref: change.id,
            name: contact.name,
            kind: 'person',
            relation: null,
            species: null,
            organizationKind: null,
          },
          name: contact.name,
          tier,
          executionId: input.executionId,
          lastMentionedAt: now,
          now,
          seal: (words) =>
            seal({
              ...words,
              email: fields.email ?? null,
              phone: fields.phone ?? null,
            }),
        }),
        lastMentionedAt: null,
        createdBy: 'person',
        yearlyDateCount: dated?.birthday.kind === 'add' ? 1 : 0,
        importedFrom,
        importedFields,
        ...photoFields,
      };
      const effect: Effect = {
        written: {
          'sealed.name': contact.name,
          kind: 'person',
          tier,
        },
        previous: null,
      };
      return { change, mediaDoc, create: doc, update: null, effect, dated };
    }
    const label = { 'sealed.name': before.name };
    const update = {
      sealed: seal({ ...before.sealed, ...fields }),
      importedFrom,
      importedFields,
      ...photoFields,
    };
    const effect: Effect = {
      written: {
        ...label,
        ...Object.fromEntries(
          Object.entries(fields).map(([field, value]) => [
            `sealed.${field}`,
            value,
          ]),
        ),
        importedFrom,
        importedFields,
        ...photoFields,
      },
      previous: {
        ...label,
        ...Object.fromEntries(
          Object.keys(fields).map((field) => [
            `sealed.${field}`,
            before.sealed[field] ?? null,
          ]),
        ),
        importedFrom: before.importedFrom,
        importedFields: before.importedFields,
        ...(kept
          ? { photoMediaId: before.photoMediaId, mediaIds: before.mediaIds }
          : {}),
      },
    };
    return { change, mediaDoc, create: null, update, effect, dated };
  });

  const refs = parts.flatMap(({ change, mediaDoc, create, effect, dated }) => [
    {
      ref: {
        op: create ? 'create' : 'update',
        collection: 'who',
        docId: change.id,
      } as EffectRef,
      effect,
    },
    ...(dated
      ? [
          {
            ref: {
              op: dated.birthday.kind === 'add' ? 'create' : 'update',
              collection: 'keyDates',
              docId: dated.birthday.id,
            } as EffectRef,
            effect: {
              written: {
                'sealed.title': dated.title,
                ...(dated.birthday.kind === 'add'
                  ? { whoId: change.id, shape: 'yearly' }
                  : {}),
                ...partsPaths(dated.sealedParts),
              },
              previous:
                dated.birthday.kind === 'add'
                  ? null
                  : {
                      'sealed.title': dated.title,
                      ...partsPaths({
                        kind: 'birthday',
                        label: null,
                        month: dated.birthday.was.month,
                        day: dated.birthday.was.day,
                        year: dated.birthday.was.year,
                        captureId: null,
                      } as KeyDateParts),
                    },
            } as Effect,
          },
        ]
      : []),
    ...(mediaDoc
      ? [
          {
            ref: {
              op: 'create',
              collection: 'media',
              docId: mediaDoc.id,
            } as EffectRef,
            effect: {
              written: { attachedTo: [{ kind: 'who', id: change.id }] },
              previous: null,
            } as Effect,
          },
        ]
      : []),
  ]);

  return {
    whoCreates: parts.flatMap(({ change, create }) =>
      create ? [{ id: change.id, data: create }] : [],
    ),
    whoUpdates: parts.flatMap(({ change, update }) =>
      update ? [{ id: change.id, data: update }] : [],
    ),
    media: parts.flatMap(({ mediaDoc }) => (mediaDoc ? [mediaDoc] : [])),
    keyDateCreates: parts.flatMap(({ change, dated }) =>
      dated && dated.birthday.kind === 'add'
        ? [
            {
              id: dated.birthday.id,
              data: {
                whoId: change.id,
                shape: 'yearly',
                source: 'google:contacts',
                createdBy: 'person',
                executionId: input.executionId,
                createdAt: now,
                lastEditedAt: null,
                sealed: seal({ ...dated.sealedParts }),
              },
            },
          ]
        : [],
    ),
    keyDateUpdates: parts.flatMap(({ dated }) =>
      dated && dated.birthday.kind === 'replace'
        ? [
            {
              id: dated.birthday.id,
              data: {
                sealed: seal({ ...dated.sealedParts }),
                lastEditedAt: now,
              },
            },
          ]
        : [],
    ),
    indexChanges: parts.flatMap(({ change, dated }): IndexChange[] =>
      dated
        ? [
            {
              op: 'upsert',
              whoId: change.id,
              entry: toIndexEntry(dated.birthday.id, dated.sealedParts),
            },
          ]
        : [],
    ),
    counterDeltas: new Map(
      parts.flatMap(({ change, create, dated }): [string, number][] =>
        !create && dated?.birthday.kind === 'add' ? [[change.id, 1]] : [],
      ),
    ),
    effectRefs: refs.map((entry) => entry.ref),
    effects: refs.map((entry) => entry.effect),
    createdCount: parts.filter(({ create }) => create).length,
  };
}

const people = (count: number) =>
  `${count} ${count === 1 ? 'person' : 'people'}`;

/** The one line Activity shows for an import or an update. */
export const buildImportSummary = (input: {
  created: number;
  filled: number;
  updatedName: string | null;
}) =>
  input.updatedName !== null
    ? `Updated ${input.updatedName} from Google`
    : input.created > 0 && input.filled > 0
      ? `Brought in ${people(input.created)} from Google and filled in ${input.filled} you already had`
      : input.created > 0
        ? `Brought in ${people(input.created)} from Google`
        : `Filled in ${people(input.filled)} from Google`;

/** The Execution an import or an update writes: a person's own action, with Undo from the effects. */
export const buildImportExecution = (input: {
  writes: ImportWrites;
  summary: string;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}): Record<string, unknown> => ({
  captureId: null,
  actor: 'person',
  category: 'import',
  autonomyLevel: 1,
  state: 'succeeded',
  effectRefs: input.writes.effectRefs,
  linkedWhoIds: input.writes.effectRefs.flatMap((ref) =>
    ref.collection === 'who' ? [ref.docId] : [],
  ),
  linkedPlaceIds: [],
  undoesExecutionId: null,
  undoneByExecutionId: null,
  questionRef: null,
  errorCode: null,
  createdAt: input.now,
  decidedAt: input.now,
  finishedAt: input.now,
  sealed: input.seal({
    summary: input.summary,
    commands: [],
    effects: input.writes.effects,
    undoReport: null,
    goneIds: null,
    spoken: null,
  }),
});

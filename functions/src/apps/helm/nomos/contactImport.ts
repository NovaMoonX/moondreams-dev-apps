import { createHmac } from 'node:crypto';

import type { SealedPayload } from '../../../appKeys/seal.js';
import { buildWhoDoc } from './executeCommands.js';
import type { Effect, EffectRef } from './executeCommands.js';
import { matchWho } from './matchEntities.js';
import { readWhoTier } from './whoTier.js';

export const PHOTOS_PER_WHO = 12;

/** What a person's Google contact is read as; the planner never sees anything else about it. */
export interface ContactInput {
  resourceName: string;
  name: string;
  emails: string[];
  phones: string[];
  photoUrl: string | null;
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
}

type TextField = 'name' | 'email' | 'phone';

export interface WhoChange {
  id: string;
  before: ExistingWho | null;
  contact: ContactInput;
  /** The words to write: every field for a new who, only the empty or unedited ones for an existing one. */
  fields: Partial<Record<TextField, string>>;
  photo: { mediaId: string; url: string } | null;
}

export type NewId = (collection: 'who' | 'media') => string;

export type Digest = (field: string, value: string) => string;

/** A keyed digest of a field's value: it tells later whether the field is still as imported without keeping the value readable. */
export const createDigest =
  (key: Buffer): Digest =>
  (field, value) =>
    createHmac('sha256', key).update(`${field}\n${value}`).digest('hex');

const emailKey = (email: string) => email.trim().toLowerCase();

const phoneKey = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : null;
};

const findMatch = (contact: ContactInput, known: ExistingWho[]) => {
  const people = known.filter((who) => who.kind === 'person' && !who.isSelf);
  const emails = new Set(contact.emails.map(emailKey));
  const phones = new Set(
    contact.phones.flatMap((phone) => phoneKey(phone) ?? []),
  );
  const byName = matchWho({
    mentions: [{ name: contact.name, kind: 'person' }],
    known: people.map((who) => ({
      id: who.id,
      kind: who.kind,
      name: who.name,
      aliases: who.aliases,
      lastMentionedAt: who.lastMentionedAt,
    })),
    assistantName: null,
  })[0];
  return (
    people.find(
      (who) => who.importedFrom?.resourceName === contact.resourceName,
    ) ??
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
      const match = findMatch(contact, state.known);
      if (match && state.touched.has(match.id))
        return { ...state, alreadyIn: state.alreadyIn + 1 };
      if (!match) {
        const id = input.newId('who');
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
          importedFrom: null,
          importedFields: {},
          lastMentionedAt: null,
          sealed: {},
          sealedNonce: '',
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
      if (Object.keys(fields).length === 0 && !photo)
        return { ...state, alreadyIn: state.alreadyIn + 1 };
      const filled: ExistingWho = {
        ...match,
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
          { id: match.id, before: match, contact, fields, photo },
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
  return fields.length === 0 && !photo
    ? null
    : {
        id: who.id,
        before: who,
        contact,
        fields: Object.fromEntries(fields),
        photo,
      };
}

export interface PhotoSeal {
  bytesNonce: string;
  thumbNonce: string;
}

export interface ImportWrites {
  whoCreates: { id: string; data: Record<string, unknown> }[];
  whoUpdates: { id: string; data: Record<string, unknown> }[];
  media: { id: string; data: Record<string, unknown> }[];
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
    };
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
      return { change, mediaDoc, create: doc, update: null, effect };
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
    return { change, mediaDoc, create: null, update, effect };
  });

  const refs = parts.flatMap(({ change, mediaDoc, create, effect }) => [
    {
      ref: {
        op: create ? 'create' : 'update',
        collection: 'who',
        docId: change.id,
      } as EffectRef,
      effect,
    },
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

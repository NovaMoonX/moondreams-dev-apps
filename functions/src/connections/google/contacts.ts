import { getFirestore } from 'firebase-admin/firestore';

import { GOOGLE_CONTACTS_MANIFEST } from './contactsManifest.js';
import { googleGet, googleGetPublicBytes } from './client.js';
import type { ConnectorOption } from '../../vendor/connectionsContract.js';
import type { SourceAdapter } from '../registry.js';
import { GOOGLE_SECRETS, getGoogleAccessToken } from '../tokens.js';

const PEOPLE_API = 'https://people.googleapis.com/v1';
const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,photos';
const PAGE_SIZE = 1000;
export const MAX_CONTACTS = 2000;
export const MAX_BATCH = 50;
const MAX_NAME = 100;
const MAX_EMAIL = 254;
const MAX_PHONE = 40;
const MAX_ENTRIES = 5;
const RESOURCE_PATTERN = /^people\/[A-Za-z0-9_-]{1,64}$/;
const PHOTO_HOST_PATTERN = /^lh\d{1,2}\.googleusercontent\.com$/;

/** What a contact is read as: only these four things, each cut to a sane length. */
export interface Contact {
  resourceName: string;
  name: string;
  emails: string[];
  phones: string[];
  photoUrl: string | null;
}

interface Entry {
  value?: unknown;
  url?: unknown;
  displayName?: unknown;
  default?: unknown;
  metadata?: { primary?: unknown };
}

interface Person {
  resourceName?: unknown;
  names?: Entry[];
  emailAddresses?: Entry[];
  phoneNumbers?: Entry[];
  photos?: Entry[];
}

export const isContactRef = (ref: string) => RESOURCE_PATTERN.test(ref);

/** A photo address is used only when it is https on one of Google's picture hosts. */
export const isGooglePhotoUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.port === '' &&
      PHOTO_HOST_PATTERN.test(parsed.hostname)
    );
  } catch {
    return false;
  }
};

const primaryFirst = (entries: Entry[] | undefined) =>
  [...(entries ?? [])].sort(
    (left, right) =>
      Number(right.metadata?.primary === true) -
      Number(left.metadata?.primary === true),
  );

const texts = (entries: Entry[] | undefined, key: 'value', max: number) =>
  primaryFirst(entries)
    .flatMap((entry) => {
      const text = entry[key];
      return typeof text === 'string' && text.trim() !== ''
        ? [text.trim().slice(0, max)]
        : [];
    })
    .slice(0, MAX_ENTRIES);

const SIZED_PHOTO = /=s\d+(-c)?$/;

const toPhotoUrl = (entries: Entry[] | undefined) => {
  const url = primaryFirst(entries).find(
    (entry) =>
      entry.default !== true &&
      typeof entry.url === 'string' &&
      isGooglePhotoUrl(entry.url),
  )?.url;
  return typeof url === 'string' ? url.replace(SIZED_PHOTO, '=s512') : null;
};

/** A contact without a name is left out: a nameless card has nothing to bring in. */
export const toContact = (person: Person): Contact | null => {
  const { resourceName } = person;
  const name = primaryFirst(person.names).find(
    (entry) =>
      typeof entry.displayName === 'string' && entry.displayName.trim() !== '',
  )?.displayName;
  if (
    typeof resourceName !== 'string' ||
    !isContactRef(resourceName) ||
    typeof name !== 'string'
  )
    return null;
  return {
    resourceName,
    name: name.trim().slice(0, MAX_NAME),
    emails: texts(person.emailAddresses, 'value', MAX_EMAIL),
    phones: texts(person.phoneNumbers, 'value', MAX_PHONE),
    photoUrl: toPhotoUrl(person.photos),
  };
};

interface ListPage {
  connections?: Person[];
  nextPageToken?: string;
}

/** Pages the account's contacts, at most 2,000, held by the caller in memory only. */
export async function listContacts(
  token: string,
  email: string | null,
): Promise<Contact[]> {
  const readFrom = async (
    pageToken: string | null,
    soFar: Contact[],
  ): Promise<Contact[]> => {
    const params = new URLSearchParams({
      personFields: PERSON_FIELDS,
      pageSize: String(PAGE_SIZE),
      sortOrder: 'LAST_NAME_ASCENDING',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await googleGet<ListPage>(
      token,
      `${PEOPLE_API}/people/me/connections?${params}`,
      { email },
    );
    const next = [
      ...soFar,
      ...(page.connections ?? []).flatMap((person) => toContact(person) ?? []),
    ].slice(0, MAX_CONTACTS);
    return page.nextPageToken && next.length < MAX_CONTACTS
      ? readFrom(page.nextPageToken, next)
      : next;
  };
  return readFrom(null, []);
}

interface BatchResponse {
  responses?: { person?: Person }[];
}

/** Reads the named contacts again from Google; a name Google does not know is simply absent. */
export async function readContacts(
  token: string,
  email: string | null,
  resourceNames: string[],
): Promise<Contact[]> {
  const valid = resourceNames.filter(isContactRef).slice(0, MAX_BATCH);
  if (valid.length === 0) return [];
  const params = new URLSearchParams({ personFields: PERSON_FIELDS });
  valid.forEach((name) => params.append('resourceNames', name));
  const body = await googleGet<BatchResponse>(
    token,
    `${PEOPLE_API}/people:batchGet?${params}`,
    { email },
  );
  return (body.responses ?? []).flatMap((entry) =>
    entry.person ? (toContact(entry.person) ?? []) : [],
  );
}

/** A contact's photo bytes, only from an allowlisted Google host; null when it has none or Google won't give it. */
export async function readContactPhoto(
  token: string,
  email: string | null,
  photoUrl: string | null,
): Promise<Uint8Array | null> {
  if (photoUrl === null || !isGooglePhotoUrl(photoUrl)) return null;
  return googleGetPublicBytes(token, photoUrl, { email }).catch(() => null);
}

export const toContactOption = (contact: Contact): ConnectorOption => ({
  id: contact.resourceName,
  name: contact.name,
  colour: null,
  detail: contact.emails[0] ?? contact.phones[0] ?? null,
  photoUrl: contact.photoUrl,
  isPrimary: false,
  isOnByDefault: false,
});

/** Contacts are read when the person opens the picker or imports, so this source has nothing to copy. */
export function createGoogleContactsAdapter(): SourceAdapter {
  return {
    manifest: GOOGLE_CONTACTS_MANIFEST,
    secrets: GOOGLE_SECRETS,
    status: async (ctx) => {
      const state = (
        await getFirestore()
          .doc(`connections/${ctx.uid}/accounts/${ctx.accountId}`)
          .get()
      ).get('status');
      return state === 'needsReconnect' ? 'needsReconnect' : 'ok';
    },
    syncPage: async () => ({
      records: [],
      deletedRefs: [],
      cursor: null,
      isFull: true,
      isDone: true,
      resumeState: null,
    }),
    deepLink: () => null,
    readOptions: async ({ firestore, uid, accountId }) => {
      const [token, account] = await Promise.all([
        getGoogleAccessToken(firestore, uid, accountId),
        firestore.doc(`connections/${uid}/accounts/${accountId}`).get(),
      ]);
      const email = account.get('email');
      const contacts = await listContacts(
        token,
        typeof email === 'string' ? email : null,
      );
      return contacts.map(toContactOption);
    },
  };
}

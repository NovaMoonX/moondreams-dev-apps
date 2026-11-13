import { getFirestore } from 'firebase-admin/firestore';

import { GOOGLE_GMAIL_MANIFEST } from './gmailManifest.js';
import { googleGet } from './client.js';
import { readAddresses, toWrittenText } from './mailText.js';
import type { SourceAdapter } from '../registry.js';
import { GOOGLE_SECRETS } from '../tokens.js';

const MAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const MAX_RESULTS = 10;
const MAX_SNIPPET = 300;
const MAX_TEXT = 4000;
const MAX_LINE = 200;
const REF_PATTERN = /^[0-9A-Za-z_-]{1,64}$/;

export interface MailSummary {
  ref: string;
  title: string;
  from: string;
  at: number;
  snippet: string;
}

export interface MailMessage {
  ref: string;
  title: string;
  from: string;
  at: number;
  text: string;
}

interface MailPart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string };
  parts?: MailPart[];
}

interface MailPayload extends MailPart {
  headers?: { name?: string; value?: string }[];
}

interface MailResource {
  id?: string;
  snippet?: string;
  internalDate?: string;
  payload?: MailPayload;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const toCodePoint = (code: number, fallback: string) =>
  Number.isInteger(code) && code > 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : fallback;

/** Decodes each entity once, so an encoded `&amp;lt;` stays `&lt;`. */
const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X'))
      return toCodePoint(Number.parseInt(name.slice(2), 16), whole);
    if (name.startsWith('#'))
      return toCodePoint(Number.parseInt(name.slice(1), 10), whole);
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });

const squash = (text: string) =>
  text
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const htmlToText = (html: string) =>
  squash(
    decodeEntities(
      html
        .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]*>/g, ' '),
    ),
  );

const decodeBody = (data: string) =>
  Buffer.from(data, 'base64url').toString('utf8');

const flatten = (part: MailPart): MailPart[] => [
  part,
  ...(part.parts ?? []).flatMap(flatten),
];

const isAttachment = (part: MailPart) =>
  Boolean(part.filename) || Boolean(part.body?.attachmentId);

const readText = (payload: MailPayload) => {
  const bodies = flatten(payload).filter(
    (part) => !isAttachment(part) && typeof part.body?.data === 'string',
  );
  const plain = bodies.find((part) => part.mimeType === 'text/plain');
  const html = bodies.find((part) => part.mimeType === 'text/html');
  if (plain) return squash(decodeBody(plain.body?.data ?? ''));
  return html ? htmlToText(decodeBody(html.body?.data ?? '')) : '';
};

const header = (payload: MailPayload | undefined, name: string) =>
  payload?.headers?.find((entry) => entry.name?.toLowerCase() === name)
    ?.value ?? '';

const toSender = (from: string) => {
  const named = /^\s*"?([^"<]*?)"?\s*<([^>]*)>\s*$/.exec(from);
  return (named?.[1].trim() || named?.[2] || from).trim().slice(0, MAX_LINE);
};

const toTime = (resource: MailResource) => {
  const internal = Number(resource.internalDate);
  if (Number.isFinite(internal) && internal > 0) return internal;
  const parsed = Date.parse(header(resource.payload, 'date'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toBase = (resource: MailResource, ref: string) => ({
  ref,
  title: decodeEntities(header(resource.payload, 'subject')).slice(0, MAX_LINE),
  from: toSender(decodeEntities(header(resource.payload, 'from'))),
  at: toTime(resource),
});

const fixtureFor = (email: string) => ({ email });

export const isMailRef = (ref: string) => REF_PATTERN.test(ref);

/** Finds up to ten messages for a Gmail search; only headers and Google's snippet are read. */
export async function searchMail(
  token: string,
  email: string,
  query: string,
): Promise<MailSummary[]> {
  const list = await googleGet<{ messages?: { id?: string }[] }>(
    token,
    `${MAIL_API}?${new URLSearchParams({ q: query.slice(0, 200), maxResults: String(MAX_RESULTS) })}`,
    fixtureFor(email),
  );
  const refs = (list.messages ?? [])
    .map((message) => message.id)
    .filter((id): id is string => typeof id === 'string' && isMailRef(id))
    .slice(0, MAX_RESULTS);
  const params = new URLSearchParams({ format: 'metadata' });
  ['From', 'Subject', 'Date'].forEach((name) =>
    params.append('metadataHeaders', name),
  );
  return Promise.all(
    refs.map(async (ref) => {
      const resource = await googleGet<MailResource>(
        token,
        `${MAIL_API}/${ref}?${params}`,
        fixtureFor(email),
      );
      return {
        ...toBase(resource, ref),
        snippet: decodeEntities(resource.snippet ?? '').slice(0, MAX_SNIPPET),
      };
    }),
  );
}

/** Reads one message as text; attachments are never fetched. */
export async function readMail(
  token: string,
  email: string,
  ref: string,
): Promise<MailMessage> {
  const resource = await googleGet<MailResource>(
    token,
    `${MAIL_API}/${ref}?format=full`,
    fixtureFor(email),
  );
  return {
    ...toBase(resource, ref),
    text: (resource.payload ? readText(resource.payload) : '').slice(
      0,
      MAX_TEXT,
    ),
  };
}

export interface SentMail {
  to: string[];
  at: number;
  text: string;
}

const SENT_QUERY = 'in:sent newer_than:6m';
const MAX_SENT = 300;
const SENT_PAGE = 100;
const SENT_READS_AT_ONCE = 20;

const chunk = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

/** Reads the person's sent mail from the last six months as plain written text, newest first, up to 300 messages. */
export async function listSentMail(
  token: string,
  email: string,
  { max }: { max: number },
): Promise<SentMail[]> {
  const limit = Math.max(0, Math.min(Math.floor(max), MAX_SENT));
  const readRefs = async (
    found: string[],
    pageToken: string | null,
  ): Promise<string[]> => {
    if (found.length >= limit) return found.slice(0, limit);
    const params = new URLSearchParams({
      q: SENT_QUERY,
      maxResults: String(Math.min(SENT_PAGE, limit - found.length)),
    });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await googleGet<{
      messages?: { id?: string }[];
      nextPageToken?: string;
    }>(token, `${MAIL_API}?${params}`, fixtureFor(email));
    const refs = [
      ...found,
      ...(page.messages ?? [])
        .map((message) => message.id)
        .filter((id): id is string => typeof id === 'string' && isMailRef(id)),
    ];
    return page.nextPageToken
      ? readRefs(refs, page.nextPageToken)
      : refs.slice(0, limit);
  };
  const refs = await readRefs([], null);
  const mails = await chunk(refs, SENT_READS_AT_ONCE).reduce(
    async (done, group) => [
      ...(await done),
      ...(await Promise.all(
        group.map(async (ref): Promise<SentMail> => {
          const resource = await googleGet<MailResource>(
            token,
            `${MAIL_API}/${ref}?format=full`,
            fixtureFor(email),
          );
          return {
            to: readAddresses(header(resource.payload, 'to')),
            at: toTime(resource),
            text: resource.payload
              ? toWrittenText(readText(resource.payload))
              : '',
          };
        }),
      )),
    ],
    Promise.resolve<SentMail[]>([]),
  );
  return mails.filter((mail) => mail.text !== '');
}

/** Mail is read when asked, so this source has nothing to copy. */
export function createGoogleMailAdapter(): SourceAdapter {
  return {
    manifest: GOOGLE_GMAIL_MANIFEST,
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
  };
}

import { getFirestore } from 'firebase-admin/firestore';

import { readPdf } from '../../files/pdfText.js';
import { GOOGLE_DRIVE_MANIFEST } from './driveManifest.js';
import { googleGet, googleGetBytes } from './client.js';
import type { SourceAdapter } from '../registry.js';
import { GOOGLE_SECRETS } from '../tokens.js';

const FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DOC_MIME = 'application/vnd.google-apps.document';
const PDF_MIME = 'application/pdf';
const MAX_RESULTS = 10;
const MAX_NAME = 200;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENT_TEXT = 50_000;
const MAX_PASSAGES = 5;
const MAX_PASSAGE = 300;
const PASSAGE_LEAD = 100;
const MIN_FIND_WORD = 3;
const MAX_FIND = 100;
const REF_PATTERN = /^[A-Za-z0-9_-]{10,128}$/;

export type DocumentKind = 'doc' | 'pdf' | 'other';

export interface DocumentSummary {
  ref: string;
  title: string;
  kind: DocumentKind;
  at: number;
}

export interface DocumentContent extends DocumentSummary {
  /** The document's text, or null for a kind that is never opened. */
  text: string | null;
}

interface DriveFile {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  trashed?: boolean;
}

export const isDocumentRef = (ref: string) => REF_PATTERN.test(ref);

const toKind = (mimeType: string | undefined): DocumentKind =>
  mimeType === DOC_MIME ? 'doc' : mimeType === PDF_MIME ? 'pdf' : 'other';

const toTime = (file: DriveFile) => {
  const parsed = Date.parse(file.modifiedTime ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
};

const toSummary = (file: DriveFile, ref: string): DocumentSummary => ({
  ref,
  title: (file.name ?? '').slice(0, MAX_NAME),
  kind: toKind(file.mimeType),
  at: toTime(file),
});

const quoteTerm = (query: string) =>
  `'${query.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const squash = (text: string) =>
  text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const fixtureFor = (email: string) => ({ email });

/** The text of a PDF, or null when it cannot be read. */
export const readPdfText = async (bytes: Uint8Array) => {
  const reading = await readPdf(bytes, { maxPages: Number.MAX_SAFE_INTEGER });
  return reading.status === 'ok' ? reading.text : null;
};

/** Finds up to ten files by name or full text; only names, kinds and times are read. */
export async function searchDocuments(
  token: string,
  email: string,
  query: string,
): Promise<DocumentSummary[]> {
  const term = quoteTerm(query.slice(0, 200));
  const params = new URLSearchParams({
    q: `(name contains ${term} or fullText contains ${term}) and trashed = false`,
    fields: 'files(id,name,mimeType,modifiedTime)',
    pageSize: String(MAX_RESULTS),
  });
  const list = await googleGet<{ files?: DriveFile[] }>(
    token,
    `${FILES_API}?${params}`,
    fixtureFor(email),
  );
  return (list.files ?? [])
    .flatMap((file) =>
      typeof file.id === 'string' && isDocumentRef(file.id)
        ? [toSummary(file, file.id)]
        : [],
    )
    .slice(0, MAX_RESULTS);
}

/** Reads one Google Doc or PDF as text; any other file, and a PDF over 10 MB, is never downloaded. */
export async function readDocument(
  token: string,
  email: string,
  ref: string,
): Promise<DocumentContent> {
  const file = await googleGet<DriveFile>(
    token,
    `${FILES_API}/${ref}?${new URLSearchParams({ fields: 'id,name,mimeType,size,modifiedTime,trashed' })}`,
    fixtureFor(email),
  );
  const summary = toSummary(file, ref);
  if (file.trashed === true) return { ...summary, kind: 'other', text: null };
  const decode = (bytes: Uint8Array) =>
    squash(Buffer.from(bytes).toString('utf8')).slice(0, MAX_DOCUMENT_TEXT);
  if (summary.kind === 'doc') {
    const bytes = await googleGetBytes(
      token,
      `${FILES_API}/${ref}/export?${new URLSearchParams({ mimeType: 'text/plain' })}`,
      fixtureFor(email),
    );
    return { ...summary, text: decode(bytes) };
  }
  const size = Number(file.size);
  if (
    summary.kind === 'pdf' &&
    Number.isFinite(size) &&
    size <= MAX_PDF_BYTES
  ) {
    const bytes = await googleGetBytes(
      token,
      `${FILES_API}/${ref}?alt=media`,
      fixtureFor(email),
    );
    const text =
      bytes.byteLength <= MAX_PDF_BYTES ? await readPdfText(bytes) : null;
    return text === null
      ? { ...summary, kind: 'other', text: null }
      : { ...summary, text: text.slice(0, MAX_DOCUMENT_TEXT) };
  }
  return { ...summary, kind: 'other', text: null };
}

const sentenceStart = (text: string, index: number) => {
  const from = Math.max(0, index - PASSAGE_LEAD);
  const boundary = [...text.slice(from, index).matchAll(/[.!?]\s+|\n+/g)].pop();
  if (boundary) return from + boundary.index + boundary[0].length;
  if (from === 0) return 0;
  const space = text.indexOf(' ', from);
  return space === -1 || space > index ? index : space + 1;
};

const windowEnd = (text: string, start: number, hit: number) => {
  const paragraph = text.indexOf('\n', hit);
  const limit = Math.min(
    start + MAX_PASSAGE,
    paragraph === -1 ? text.length : paragraph,
  );
  if (limit >= text.length || text[limit] === '\n') return limit;
  const cut = text.slice(start, limit);
  const sentence = [...cut.matchAll(/[.!?](?=\s)/g)].pop();
  if (sentence && sentence.index > MAX_PASSAGE / 2) {
    return start + sentence.index + 1;
  }
  const space = cut.lastIndexOf(' ');
  return space > 0 ? start + space : limit;
};

const FIND_STOPWORDS = new Set(
  'the and for are was were what when where which who whom whose does did has have had say says said about with from that this these those into onto than then there their they them our your you its not but can could would should will shall how why any all'.split(
    ' ',
  ),
);

/** Up to five separate stretches of the text around the words of `find`, rarest words first, in reading order; the first paragraphs when it names nothing in the text. */
export const findPassages = (text: string, find: string): string[] => {
  const words = Array.from(
    new Set(
      find
        .slice(0, MAX_FIND)
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(
          (word) => word.length >= MIN_FIND_WORD && !FIND_STOPWORDS.has(word),
        ),
    ),
  );
  const hits = words
    .map((word) =>
      Array.from(
        text.matchAll(new RegExp(escapeRegExp(word), 'giu')),
        (m) => m.index,
      ),
    )
    .filter((found) => found.length > 0)
    .sort((a, b) => a.length - b.length)
    .flat();
  const chosen = hits.reduce<{ start: number; end: number }[]>(
    (windows, hit) => {
      if (
        windows.length >= MAX_PASSAGES ||
        windows.some((window) => hit >= window.start && hit < window.end)
      ) {
        return windows;
      }
      const start = sentenceStart(text, hit);
      const end = windowEnd(text, start, hit);
      const overlaps = windows.some(
        (window) => start < window.end && end > window.start,
      );
      return overlaps || text.slice(start, end).trim() === ''
        ? windows
        : [...windows, { start, end }];
    },
    [],
  );
  if (chosen.length > 0) {
    return [...chosen]
      .sort((a, b) => a.start - b.start)
      .map((window) => text.slice(window.start, window.end).trim());
  }
  return text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((paragraph) => paragraph.slice(0, MAX_PASSAGE));
};

const escapeRegExp = (word: string) =>
  word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Documents are read when asked, so this source has nothing to copy. */
export function createGoogleDriveAdapter(): SourceAdapter {
  return {
    manifest: GOOGLE_DRIVE_MANIFEST,
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

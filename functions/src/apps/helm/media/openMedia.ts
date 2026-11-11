import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { gcmDecrypt } from '../../../appKeys/gcm.js';
import type { SealedPayload } from '../../../appKeys/seal.js';
import type { ToolLoopContent } from '../../../ai/modelProvider.js';
import { readPdf } from '../../../files/pdfText.js';
import { toWebpCopy } from '../../../share/imageCopies.js';
import { openForHelm, type HelmKey } from '../helmKey.js';
import {
  ATTACHMENT_IMAGE_PX,
  MAX_ATTACHMENTS_PER_TURN,
  MAX_MARKDOWN_CHARS,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  PDF_TEXT_TO_MODEL,
} from './mediaCaps.js';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface MediaBucket {
  file(path: string): {
    download(): Promise<[Buffer]>;
    delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
  };
}

export const mediaObjectPath = (uid: string, id: string, isThumb = false) =>
  `apps/helm/media/${uid}/${id}${isThumb ? '.thumb' : ''}`;

/** The Storage objects a medium keeps: none for a Markdown file (its text is sealed in the document), the one object for a PDF or recording, and a photo's thumbnail too. */
export const mediaObjectPaths = (uid: string, id: string, kind: unknown) =>
  kind === 'markdown'
    ? []
    : kind === 'pdf' || kind === 'voiceNote'
      ? [mediaObjectPath(uid, id)]
      : [mediaObjectPath(uid, id), mediaObjectPath(uid, id, true)];

/** The readable part of a medium that decides whether a turn may read it. */
export interface MediaRow {
  kind?: unknown;
  status?: unknown;
  sourceCaptureId?: unknown;
  sealed?: unknown;
}

type ReadKind = 'photo' | 'pdf' | 'markdown';

/** One file as the model reads it, in the `<files>` block; a PDF with no text layer has `text: null` and travels as a document block. */
export interface FileEntry {
  alias: string;
  kind: 'pdf' | 'markdown';
  name: string;
  pages: number | null;
  text: string | null;
  isCut: boolean;
}

/** A medium opened for the model, with the words sealed beside it. */
export interface OpenedMedia {
  id: string;
  alias: string;
  kind: ReadKind;
  words: Record<string, unknown>;
  blocks: ToolLoopContent[];
  file: FileEntry | null;
}

export type UnreadableReason =
  'locked' | 'unreadable' | 'tooManyPages' | 'tooLarge';

const FILE_NAME_CAP = 120;
const KINDS = ['photo', 'pdf', 'markdown', 'voiceNote'];

const listIds = (listed: unknown): string[] => [
  ...new Set(
    (Array.isArray(listed) ? listed : []).filter(
      (id): id is string => typeof id === 'string' && ID_RE.test(id),
    ),
  ),
];

/** The media a turn sent that it may read: only those still received and sent with this very capture, each once, at most the cap; the rest of the eligible ones are refused. */
export const chooseMedia = (
  listed: unknown,
  captureId: string,
  rows: Map<string, MediaRow | undefined>,
): { ids: string[]; refused: string[] } => {
  const eligible = listIds(listed).filter((id) => {
    const row = rows.get(id);
    return (
      typeof row?.kind === 'string' &&
      KINDS.includes(row.kind) &&
      row.status === 'received' &&
      row.sourceCaptureId === captureId
    );
  });
  return {
    ids: eligible.slice(0, MAX_ATTACHMENTS_PER_TURN),
    refused: eligible.slice(MAX_ATTACHMENTS_PER_TURN),
  };
};

const nameOf = (words: Record<string, unknown>) =>
  typeof words.fileName === 'string' && words.fileName !== ''
    ? words.fileName.slice(0, FILE_NAME_CAP)
    : 'file';

type Opened =
  | { status: 'opened'; blocks: ToolLoopContent[]; file: FileEntry | null }
  | { status: 'unreadable'; reason: UnreadableReason }
  | { status: 'failed' };

const FAILED: Opened = { status: 'failed' };

/** The ids a turn lists, read under the person's own account. `voiceIds` are recordings (never sent to the model), `unreadable` the files that would not read, `unopened` the rest that would not open; every one of them, and `refused`, is let go by code. */
export async function openMedia(input: {
  firestore: Firestore;
  bucket: MediaBucket;
  base: string;
  uid: string;
  key: HelmKey;
  captureId: string;
  listed: unknown;
}): Promise<{
  media: OpenedMedia[];
  voiceIds: string[];
  unreadable: { id: string; name: string; reason: UnreadableReason }[];
  unopened: string[];
  refused: string[];
}> {
  const { firestore, bucket, base, uid, key, captureId, listed } = input;
  const candidates = listIds(listed).slice(0, 2 * MAX_ATTACHMENTS_PER_TURN);
  const snapshots = candidates.length
    ? await firestore.getAll(
        ...candidates.map((id) => firestore.doc(`${base}/media/${id}`)),
      )
    : [];
  const rows = new Map<string, MediaRow | undefined>(
    snapshots.map((snapshot) => [
      snapshot.id,
      snapshot.data() as MediaRow | undefined,
    ]),
  );
  const { ids, refused } = chooseMedia(candidates, captureId, rows);
  const voiceIds = ids.filter((id) => rows.get(id)?.kind === 'voiceNote');
  const readBytes = async (id: string, words: Record<string, unknown>) => {
    if (typeof words.bytesNonce !== 'string') return null;
    const [sealed] = await bucket.file(mediaObjectPath(uid, id)).download();
    return gcmDecrypt(
      key.key,
      sealed.toString('base64'),
      words.bytesNonce,
      null,
    );
  };
  const openMarkdown = (words: Record<string, unknown>): Opened =>
    typeof words.text === 'string' && words.text.length <= MAX_MARKDOWN_CHARS
      ? {
          status: 'opened',
          blocks: [],
          file: {
            alias: '',
            kind: 'markdown',
            name: nameOf(words),
            pages: null,
            text: words.text,
            isCut: false,
          },
        }
      : FAILED;
  const openPdf = async (plain: Buffer, name: string): Promise<Opened> => {
    if (plain.byteLength > MAX_PDF_BYTES) {
      return { status: 'unreadable', reason: 'tooLarge' };
    }
    const reading = await readPdf(plain, { maxPages: MAX_PDF_PAGES });
    if (reading.status !== 'ok') {
      return { status: 'unreadable', reason: reading.status };
    }
    return {
      status: 'opened',
      blocks: reading.hasTextLayer
        ? []
        : [
            {
              type: 'document',
              mediaType: 'application/pdf',
              data: plain.toString('base64'),
            },
          ],
      file: {
        alias: '',
        kind: 'pdf',
        name,
        pages: reading.pageCount,
        text: reading.hasTextLayer
          ? reading.text.slice(0, PDF_TEXT_TO_MODEL)
          : null,
        isCut: reading.hasTextLayer && reading.text.length > PDF_TEXT_TO_MODEL,
      },
    };
  };
  const openOne = async (
    kind: ReadKind,
    id: string,
    words: Record<string, unknown>,
  ): Promise<Opened> => {
    if (kind === 'markdown') return openMarkdown(words);
    const plain = await readBytes(id, words);
    if (plain === null) return FAILED;
    if (kind === 'pdf') return openPdf(plain, nameOf(words));
    const copy = await toWebpCopy(plain, ATTACHMENT_IMAGE_PX);
    return {
      status: 'opened',
      blocks: [
        {
          type: 'image',
          mediaType: 'image/webp',
          data: copy.toString('base64'),
        },
      ],
      file: null,
    };
  };
  const opened = await Promise.all(
    ids
      .filter((id) => !voiceIds.includes(id))
      .map(async (id) => {
        const kind = rows.get(id)?.kind as ReadKind;
        try {
          const words = openForHelm(key, rows.get(id)?.sealed as SealedPayload);
          const result =
            words.keyId === key.keyId ? await openOne(kind, id, words) : FAILED;
          return { id, kind, words, result };
        } catch (error) {
          logger.warn('helm.media.openFailed', {
            cause: error instanceof Error ? error.name : 'unknown',
          });
          return { id, kind, words: {}, result: FAILED };
        }
      }),
  );
  const readable = opened.flatMap((entry) =>
    entry.result.status === 'opened'
      ? [{ ...entry, result: entry.result }]
      : [],
  );
  return {
    media: readable.map((entry, index): OpenedMedia => ({
      id: entry.id,
      alias: `m${index + 1}`,
      kind: entry.kind,
      words: entry.words,
      blocks: entry.result.blocks,
      file: entry.result.file
        ? { ...entry.result.file, alias: `m${index + 1}` }
        : null,
    })),
    voiceIds,
    unreadable: opened.flatMap((entry) =>
      entry.result.status === 'unreadable'
        ? [
            {
              id: entry.id,
              name: nameOf(entry.words),
              reason: entry.result.reason,
            },
          ]
        : [],
    ),
    unopened: opened.flatMap((entry) =>
      entry.result.status === 'failed' ? [entry.id] : [],
    ),
    refused,
  };
}

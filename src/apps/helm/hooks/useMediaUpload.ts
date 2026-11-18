import { useEffect, useRef, useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useImageUpload } from '@/hooks/useImageUpload';
import { generateUuid } from '@/utils/idUtils';
import { compressImageForUse } from '@/utils/imageCompression';
import { HELM_COPY } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  addPhoto,
  removeAttachment,
  type PhotoOwner,
  transcribeVoiceNote,
  uploadAttachment,
} from '@apps/helm/store/actions/mediaActions';
import {
  type AttachmentKind,
  checkMeasured,
  fitAttachments,
  kindOfFile,
  type PickRefusal,
} from '@apps/helm/utils/mediaCaps';
import { measurePdf } from '@lib/pdf/pdfPages';

/** Adds a picked photo to a who or place: shrunk on this device (512 px for a who's main photo, 1280 px otherwise), a 512 px thumbnail made, both sealed and uploaded. Says what happened in a toast. */
export function useMediaUpload(owner: PhotoOwner, isMain: boolean) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const { pick, clear, error } = useImageUpload(
    null,
    isMain ? 'avatar' : 'photo',
  );

  const add = async (selected: File | null) => {
    if (!user || !selected) return;
    if (!navigator.onLine) {
      addToast({ title: HELM_COPY.photoNeedsConnection, type: 'info' });
      return;
    }
    setIsUploading(true);
    try {
      const file = await pick(selected);
      if (!file) return;
      const thumb =
        (await compressImageForUse(file, 'thumbnail').catch(() => null)) ??
        file;
      const encryption = await getHelmEncryption(user.uid);
      const result = await addPhoto(user.uid, encryption, owner, {
        file,
        thumb,
      });
      clear();
      addToast({
        title:
          result === 'added'
            ? HELM_COPY.photoAdded
            : result === 'full'
              ? HELM_COPY.photoFull
              : HELM_COPY.photoGone,
        type: result === 'added' ? 'success' : 'info',
      });
    } catch (failure) {
      console.error('Helm photo was not added', failure);
      clear();
      addToast({ title: HELM_COPY.photoFailed, type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  return { add, isUploading, error };
}

export interface TurnAttachment {
  key: string;
  kind: AttachmentKind;
  /** The picked photo as shown while it uploads and after; null for any other kind. */
  previewUrl: string | null;
  source: File;
  /** What the device measured: a PDF's pages, a Markdown file's text, a voice note's length. */
  measured: {
    pageCount: number | null;
    text: string | null;
    durationMs: number | null;
  };
  status: 'uploading' | 'transcribing' | 'ready' | 'failed';
  /** Why a failed chip failed; null while it has not. */
  failure: 'upload' | 'transcribe' | 'usedUp' | 'tooLong' | null;
  /** True once a voice note's words are in the field. */
  isWritten: boolean;
  mediaId: string | null;
}

interface TurnAttachmentsOptions {
  timeZone: string;
  /** Receives a voice note's words once they are written out; the caller puts them in its field. */
  onTranscript: (text: string) => void;
}

type PdfIssue = 'locked' | 'unreadable';

const NO_MEASURE = { pageCount: null, text: null, durationMs: null };

const MIME_OF_KIND = { pdf: 'application/pdf', markdown: 'text/markdown' };

const toPreview = (source: File, kind: AttachmentKind) =>
  kind === 'photo' ? URL.createObjectURL(source) : null;

const revoke = (entry: TurnAttachment) => {
  if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
};

const TOO_LARGE_TEXT: Record<AttachmentKind, string> = {
  photo: HELM_COPY.attachTooMany,
  pdf: HELM_COPY.attachPdfTooLarge,
  markdown: HELM_COPY.attachMarkdownTooLarge,
  voiceNote: HELM_COPY.attachVoiceTooLong,
};

const refusalText = (
  reason: PickRefusal | PdfIssue,
  file: File,
  measured: { pages: number | null; chars: number | null } | null = null,
) => {
  const kind = kindOfFile(file);
  if (reason === 'locked') return HELM_COPY.attachPdfLocked;
  if (reason === 'unreadable') return HELM_COPY.attachPdfUnreadable;
  if (reason === 'notSupported') return HELM_COPY.attachNotSupported;
  if (reason === 'tooManyPages') {
    return HELM_COPY.attachTooManyPages(measured?.pages ?? 0);
  }
  if (reason === 'tooLong') {
    return kind === 'voiceNote'
      ? HELM_COPY.attachVoiceTooLong
      : HELM_COPY.attachMarkdownTooLong(measured?.chars ?? 0);
  }
  if (reason === 'tooLarge') return TOO_LARGE_TEXT[kind ?? 'markdown'];
  return HELM_COPY.attachTooMany;
};

/** The photos, PDFs, Markdown files and voice notes picked for the turn being written, in pick order: each is measured on this device (a PDF's pages, a Markdown file's characters), refused before upload when over its cap, sealed and uploaded as it is picked, and listed for Send once it is `ready`. A voice note is then written out and its words handed to `onTranscript`. A sixth item is refused before any work. */
export function useTurnAttachments({
  timeZone,
  onTranscript,
}: TurnAttachmentsOptions) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [items, setItems] = useState<TurnAttachment[]>([]);
  const latest = useRef<TurnAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const transcript = useRef(onTranscript);
  useEffect(() => {
    transcript.current = onTranscript;
  });

  const update = (change: (held: TurnAttachment[]) => TurnAttachment[]) => {
    latest.current = change(latest.current);
    setItems(latest.current);
  };
  const patch = (key: string, fields: Partial<TurnAttachment>) =>
    update((held) =>
      held.map((entry) =>
        entry.key === key ? { ...entry, ...fields } : entry,
      ),
    );

  useEffect(
    () => () => {
      latest.current.forEach(revoke);
    },
    [],
  );

  const refuse = (
    key: string,
    file: File,
    reason: PickRefusal | PdfIssue,
    measured: {
      pages: number | null;
      chars: number | null;
    },
  ) => {
    const text = refusalText(reason, file, measured);
    addToast({ title: text, type: 'info' });
    setNotice(text);
    update((held) => held.filter((entry) => entry.key !== key));
  };

  const write = async (key: string, mediaId: string) => {
    patch(key, { status: 'transcribing', failure: null });
    try {
      const result = await transcribeVoiceNote(mediaId, timeZone);
      if (!latest.current.some((entry) => entry.key === key)) return;
      if (result.status === 'ready') {
        patch(key, { status: 'ready', isWritten: true });
        transcript.current(result.text);
        return;
      }
      patch(key, {
        status: 'failed',
        failure:
          result.reason === 'listenLimit' || result.reason === 'budgetReached'
            ? 'usedUp'
            : result.reason === 'tooLong'
              ? 'tooLong'
              : 'transcribe',
      });
    } catch (failure) {
      console.error('Helm voice note was not written out', failure);
      patch(key, { status: 'failed', failure: 'transcribe' });
    }
  };

  const measure = async (entry: TurnAttachment) => {
    if (entry.kind === 'pdf') {
      const result = await measurePdf(
        new Uint8Array(await entry.source.arrayBuffer()),
      );
      return {
        ...NO_MEASURE,
        pageCount: result.status === 'ok' ? result.pageCount : null,
        pdfIssue: result.status === 'ok' ? null : result.status,
      };
    }
    if (entry.kind === 'markdown') {
      return {
        ...NO_MEASURE,
        text: await entry.source.text(),
        pdfIssue: null,
      };
    }
    return { ...entry.measured, pdfIssue: null };
  };

  const run = async (key: string) => {
    const entry = latest.current.find((held) => held.key === key);
    if (!user || !entry) return;
    if (!navigator.onLine) {
      patch(key, {
        status: 'failed',
        failure: entry.mediaId ? 'transcribe' : 'upload',
      });
      return;
    }
    patch(key, { status: 'uploading', failure: null });
    try {
      if (entry.mediaId) {
        await write(key, entry.mediaId);
        return;
      }
      const { pdfIssue, ...measured } = await measure(entry);
      if (!latest.current.some((held) => held.key === key)) return;
      if (pdfIssue) {
        refuse(key, entry.source, pdfIssue, {
          pages: null,
          chars: null,
        });
        return;
      }
      const refusal = checkMeasured(entry.kind, {
        pages: measured.pageCount,
        chars: measured.text?.length ?? null,
        durationMs: measured.durationMs,
      });
      if (refusal) {
        refuse(key, entry.source, refusal, {
          pages: measured.pageCount,
          chars: measured.text?.length ?? null,
        });
        return;
      }
      patch(key, { measured });
      const encryption = await getHelmEncryption(user.uid);
      const isPhoto = entry.kind === 'photo';
      const file = isPhoto
        ? await compressImageForUse(entry.source, 'cover')
        : entry.source;
      if (!file) throw new Error('This browser could not open the photo.');
      const thumb = isPhoto
        ? ((await compressImageForUse(file, 'thumbnail').catch(() => null)) ??
          file)
        : null;
      const mediaId = await uploadAttachment(user.uid, encryption, {
        kind: entry.kind,
        mimeType:
          isPhoto || entry.kind === 'voiceNote'
            ? file.type
            : MIME_OF_KIND[entry.kind as 'pdf' | 'markdown'],
        file: entry.kind === 'markdown' ? null : file,
        thumb,
        durationMs: measured.durationMs,
        pageCount: measured.pageCount,
        fileName:
          entry.kind === 'pdf' || entry.kind === 'markdown'
            ? entry.source.name.slice(0, 120)
            : null,
        text: measured.text,
      });
      // Removed while it uploaded: nothing lists it, so it is let go now rather than left for the sweep.
      if (!latest.current.some((held) => held.key === key)) {
        void removeAttachment(user.uid, mediaId, entry.kind).catch(
          (error: unknown) =>
            console.error('An attachment was not removed', error),
        );
        return;
      }
      patch(key, { status: 'ready', mediaId });
      if (entry.kind === 'voiceNote') await write(key, mediaId);
    } catch (failure) {
      console.error('Helm attachment was not uploaded', failure);
      patch(key, { status: 'failed', failure: 'upload' });
    }
  };

  const enqueue = (
    accepted: { file: File; kind: AttachmentKind }[],
    durationMs: number | null,
  ) => {
    const added = accepted.map(({ file, kind }): TurnAttachment => ({
      key: generateUuid(),
      kind,
      previewUrl: toPreview(file, kind),
      source: file,
      measured: { ...NO_MEASURE, durationMs },
      status: 'uploading',
      failure: null,
      isWritten: false,
      mediaId: null,
    }));
    update((held) => [...held, ...added]);
    added.forEach((entry) => void run(entry.key));
  };

  const add = (picked: File[]) => {
    if (!user || picked.length === 0) return;
    if (!navigator.onLine) {
      addToast({ title: HELM_COPY.attachNeedsConnection, type: 'info' });
      return;
    }
    const { accepted, refused } = fitAttachments(latest.current.length, picked);
    const first = refused.find((entry) => entry.reason === 'tooMany');
    const other = refused[0];
    const refusal = first
      ? accepted.length > 0
        ? HELM_COPY.attachSomeFit(accepted.length)
        : HELM_COPY.attachTooMany
      : other
        ? refusalText(other.reason, other.file)
        : null;
    if (refusal) addToast({ title: refusal, type: 'info' });
    setNotice(refusal);
    enqueue(accepted, null);
  };

  /** A voice note just recorded, counted like any pick. */
  const addVoiceNote = (file: File, durationMs: number) => {
    const { accepted } = fitAttachments(latest.current.length, [file]);
    if (accepted.length === 0) {
      addToast({ title: HELM_COPY.attachTooMany, type: 'info' });
      setNotice(HELM_COPY.attachTooMany);
      return;
    }
    setNotice(null);
    enqueue(accepted, durationMs);
  };

  const retry = (key: string) => void run(key);

  const remove = (key: string) => {
    const found = latest.current.find((entry) => entry.key === key);
    if (!found || !user) return;
    revoke(found);
    update((held) => held.filter((entry) => entry.key !== key));
    if (found.mediaId) {
      void removeAttachment(user.uid, found.mediaId, found.kind).catch(
        (error: unknown) =>
          console.error('An attachment was not removed', error),
      );
    }
  };

  /** Forgets the chips once their files are sent; the files stay. */
  const clear = () => {
    latest.current.forEach(revoke);
    setNotice(null);
    update(() => []);
  };

  /** Puts chips for files already uploaded back, after the turn that carried them did not send. */
  const restore = (sent: TurnAttachment[]) =>
    update((held) => [
      ...held,
      ...sent.map((entry) => ({
        ...entry,
        previewUrl: toPreview(entry.source, entry.kind),
      })),
    ]);

  return {
    items,
    add,
    addVoiceNote,
    say: setNotice,
    retry,
    remove,
    clear,
    restore,
    notice,
    isUploading: items.some((entry) => entry.status === 'uploading'),
    isWriting: items.some((entry) => entry.status === 'transcribing'),
    hasFailed: items.some((entry) => entry.status === 'failed'),
    hasWrittenVoiceNote: items.some((entry) => entry.isWritten),
    mediaIds: items.flatMap((entry) =>
      entry.mediaId !== null ? [entry.mediaId] : [],
    ),
  };
}

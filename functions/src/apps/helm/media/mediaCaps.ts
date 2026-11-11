// Generated from src/apps/helm/utils/mediaCaps.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
/** What one turn may bring in; checked on the device before upload and again on the server. */
export const MAX_ATTACHMENTS_PER_TURN = 5;
export const ATTACHMENT_IMAGE_PX = 1_600;
export const MEDIA_CAPTION_CAP = 200;
export const LET_GO_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MEDIA_SWEEP_LIMIT = 20;
export type AttachmentKind = 'photo' | 'pdf' | 'voiceNote' | 'markdown';
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 20;
export const PDF_TEXT_TO_MODEL = 12_000;
export const MAX_MARKDOWN_CHARS = 20_000;
export const MAX_MARKDOWN_BYTES = 100 * 1024;
export const MAX_VOICE_NOTE_MS = 5 * 60_000;
export const MAX_VOICE_NOTE_BYTES = 10 * 1024 * 1024;
export const MAX_TRANSCRIPT_CHARS = 5_000;
export type PickRefusal =
  'tooMany' | 'notSupported' | 'tooLarge' | 'tooManyPages' | 'tooLong';
const MARKDOWN_NAME = /\.md$/i;
/** image/* → photo; application/pdf → pdf; audio/* → voiceNote; text/markdown, or text/plain or no type with a .md name → markdown. */
export function kindOfFile(file: {
  type: string;
  name: string;
}): AttachmentKind | null {
  if (file.type.startsWith('image/')) return 'photo';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('audio/')) return 'voiceNote';
  if (file.type === 'text/markdown') return 'markdown';
  return (file.type === 'text/plain' || file.type === '') &&
    MARKDOWN_NAME.test(file.name)
    ? 'markdown'
    : null;
}
const MAX_BYTES: Record<AttachmentKind, number> = {
  photo: Number.POSITIVE_INFINITY,
  pdf: MAX_PDF_BYTES,
  markdown: MAX_MARKDOWN_BYTES,
  voiceNote: MAX_VOICE_NOTE_BYTES,
};
/** Synchronous: kind, bytes and the 5-a-turn count, in pick order (reduce, as now). */
export function fitAttachments<
  T extends { type: string; size: number; name: string },
>(held: number, picked: T[]) {
  return picked.reduce(
    (state, file) => {
      const kind = kindOfFile(file);
      const refuse = (reason: PickRefusal) => ({
        ...state,
        refused: [...state.refused, { file, reason }],
      });
      if (kind === null) return refuse('notSupported');
      if (file.size > MAX_BYTES[kind]) return refuse('tooLarge');
      if (held + state.accepted.length >= MAX_ATTACHMENTS_PER_TURN) {
        return refuse('tooMany');
      }
      return { ...state, accepted: [...state.accepted, { file, kind }] };
    },
    {
      accepted: [] as { file: T; kind: AttachmentKind }[],
      refused: [] as { file: T; reason: PickRefusal }[],
    },
  );
}
/** After measuring: pages > 20 → tooManyPages, chars > 20,000 or ms > 5 min → tooLong. */
export function checkMeasured(
  kind: AttachmentKind,
  measured: {
    pages: number | null;
    chars: number | null;
    durationMs: number | null;
  },
): PickRefusal | null {
  if (kind === 'pdf' && (measured.pages ?? 0) > MAX_PDF_PAGES) {
    return 'tooManyPages';
  }
  if (kind === 'markdown' && (measured.chars ?? 0) > MAX_MARKDOWN_CHARS) {
    return 'tooLong';
  }
  if (kind === 'voiceNote' && (measured.durationMs ?? 0) > MAX_VOICE_NOTE_MS) {
    return 'tooLong';
  }
  return null;
}
export const isMediaExpired = (deleteAfter: number | null, now: number) =>
  deleteAfter !== null && deleteAfter <= now;

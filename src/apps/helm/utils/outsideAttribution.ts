import { HELM_COPY } from '@apps/helm/constants';
import type { OpenCapture, OpenNote, TopicSource } from '@apps/helm/types';

/** The outside assistant a note came from; null for any other note. */
export const outsideNoteVia = (
  note: OpenNote | undefined,
  captureById: Map<string, OpenCapture>,
) =>
  note?.source === 'outside'
    ? note.via ||
      captureById.get(note.sourceCaptureId ?? '')?.via ||
      HELM_COPY.outsideUnnamed
    : null;

/** The outside assistant a topic source came from: an outside note, or a message from a turn an outside assistant sent. */
export const outsideSourceVia = (
  source: TopicSource,
  noteById: Map<string, OpenNote>,
  captureById: Map<string, OpenCapture>,
) => {
  if (source.kind === 'note') {
    return outsideNoteVia(noteById.get(source.noteId), captureById);
  }
  if (source.kind !== 'message') return null;
  const capture = captureById.get(source.captureId);
  return capture?.medium === 'mcp'
    ? capture.via || HELM_COPY.outsideUnnamed
    : outsideNoteVia(noteById.get(source.noteId ?? ''), captureById);
};

/** The distinct outside assistants behind a list of sources, in order. */
export const outsideVias = (
  sources: TopicSource[],
  noteById: Map<string, OpenNote>,
  captureById: Map<string, OpenCapture>,
) => [
  ...new Set(
    sources.flatMap((source) => {
      const via = outsideSourceVia(source, noteById, captureById);
      return via === null ? [] : [via];
    }),
  ),
];

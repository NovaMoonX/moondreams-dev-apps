/** What one turn may bring in; checked on the device before upload and again on the server. */
export const MAX_ATTACHMENTS_PER_TURN = 5;
export const ATTACHMENT_IMAGE_PX = 1_600;
export const MEDIA_CAPTION_CAP = 200;
export const LET_GO_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MEDIA_SWEEP_LIMIT = 20;
export type PickRefusal = 'tooMany' | 'notPhoto';
export function fitAttachments<T extends { type: string; size: number }>(
  held: number,
  picked: T[],
) {
  return picked.reduce(
    (state, file) => {
      if (!file.type.startsWith('image/')) {
        return {
          ...state,
          refused: [
            ...state.refused,
            { file, reason: 'notPhoto' as PickRefusal },
          ],
        };
      }
      if (held + state.accepted.length >= MAX_ATTACHMENTS_PER_TURN) {
        return {
          ...state,
          refused: [
            ...state.refused,
            { file, reason: 'tooMany' as PickRefusal },
          ],
        };
      }
      return { ...state, accepted: [...state.accepted, file] };
    },
    { accepted: [] as T[], refused: [] as { file: T; reason: PickRefusal }[] },
  );
}
export const isMediaExpired = (deleteAfter: number | null, now: number) =>
  deleteAfter !== null && deleteAfter <= now;

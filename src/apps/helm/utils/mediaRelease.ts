import type { MediaAttachment, MediaStatus } from '@apps/helm/types';
import { LET_GO_WINDOW_MS } from '@apps/helm/utils/mediaCaps';

export interface ReleasablePhoto {
  id: string;
  status: MediaStatus;
  attachedTo: MediaAttachment[];
  decidedAt: number | null;
  deleteAfter: number | null;
}

export interface PhotoRelease {
  id: string;
  /** What to write when the records are deleted. */
  forward: Record<string, unknown>;
  /** What to write to put the photo back as it was. */
  back: Record<string, unknown>;
}

const isOn = (entry: MediaAttachment, records: MediaAttachment[]) =>
  records.some(
    (record) => record.kind === entry.kind && record.id === entry.id,
  );

/** What deleting records does to the kept photos on them: a photo only on those records is let go for 24 hours, one also on another record just loses them. */
export const planPhotoRelease = (
  photos: ReleasablePhoto[],
  records: MediaAttachment[],
  now: number,
): PhotoRelease[] =>
  photos
    .filter(
      (photo) =>
        photo.status === 'kept' &&
        photo.attachedTo.some((entry) => isOn(entry, records)),
    )
    .map((photo) => {
      const remaining = photo.attachedTo.filter(
        (entry) => !isOn(entry, records),
      );
      return {
        id: photo.id,
        forward:
          remaining.length > 0
            ? { attachedTo: remaining }
            : {
                status: 'discarded',
                attachedTo: [],
                decidedAt: now,
                deleteAfter: now + LET_GO_WINDOW_MS,
              },
        back: {
          attachedTo: photo.attachedTo,
          status: photo.status,
          decidedAt: photo.decidedAt,
          deleteAfter: photo.deleteAfter,
        },
      };
    });

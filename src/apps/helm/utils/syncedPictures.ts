import { readPictureLink } from '@/lib/connections/contract';
import type { AppSource, SyncedRecord } from '@apps/helm/types';

/** Where a synced record's sealed picture copy is kept in Storage. */
export const getSyncedPicturePath = (uid: string, id: string) =>
  `apps/helm/syncedPictures/${uid}/${id}`;

/** The synced record, with a picture copy, that a who was brought in from; null when there is none. */
export const findAppPicture = (
  synced: SyncedRecord[],
  appSources: AppSource[],
): SyncedRecord | null =>
  synced.find(
    (record) =>
      record.picture !== null &&
      record.connectorId !== '' &&
      appSources.some(
        (source) =>
          source.connectorId === record.connectorId &&
          source.sourceRef === record.sourceRef,
      ),
  ) ?? null;

/** A movie's poster link, only when it is an https address; it is drawn from its source and never copied. */
export const getPosterLink = (record: SyncedRecord) =>
  readPictureLink(record.sealed.extra.posterUrl);

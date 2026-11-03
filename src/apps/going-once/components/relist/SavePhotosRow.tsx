import { useEffect, useState } from 'react';

import { getBlob, ref } from 'firebase/storage';
import { Download, ImageDown } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import { storage } from '@/lib/firebase/config';
import { canShareFiles, shareOrDownloadFiles } from '@/utils/fileUtils';
import type { Item } from '@apps/going-once/types';
import { getItemName } from '@apps/going-once/utils/listing';

interface SavePhotosRowProps {
  item: Pick<Item, 'title' | 'photos'>;
}

interface Fetched {
  key: string;
  blobs: Blob[];
  isFailed: boolean;
}

const toFileBase = (title: string) =>
  title
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Photo';

const plural = (count: number) =>
  `${count} ${count === 1 ? 'photo' : 'photos'}`;

/** Fetches the thing's photos as soon as the row mounts (the drawer's More view), so the tap can hand them to the share sheet at once. */
function useFetchedPhotos(paths: string[], attempt: number) {
  const key = `${attempt}:${paths.join('|')}`;
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [loaded, setLoaded] = useState({ key, count: 0 });

  useEffect(() => {
    let isCurrent = true;
    const counts = { done: 0 };
    Promise.all(
      paths.map(async (path) => {
        const blob = await getBlob(ref(storage, path));
        counts.done += 1;
        if (isCurrent) setLoaded({ key, count: counts.done });
        return blob;
      }),
    )
      .then((blobs) => {
        if (isCurrent) setFetched({ key, blobs, isFailed: false });
      })
      .catch(() => {
        if (isCurrent) setFetched({ key, blobs: [], isFailed: true });
      });
    return () => {
      isCurrent = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `paths`
  }, [key]);

  return {
    result: fetched?.key === key ? fetched : null,
    loadedCount: loaded.key === key ? loaded.count : 0,
  };
}

/** Sends the thing's photos to the device's share sheet, or downloads them where there is none. */
function SavePhotosRow({ item }: SavePhotosRowProps) {
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const paths = item.photos.map((photo) => photo.path);
  const { result, loadedCount } = useFetchedPhotos(paths, attempt);
  const base = toFileBase(getItemName(item));
  const files =
    result === null || result.isFailed
      ? []
      : result.blobs.map(
          (blob, index) =>
            new File([blob], `${base} ${index + 1}.jpg`, {
              type: blob.type || 'image/jpeg',
            }),
        );
  const count = paths.length;
  if (count === 0) return null;

  const canShare = canShareFiles(files);
  const getSubtitle = () => {
    if (outcome !== null) return outcome;
    if (result === null)
      return `Getting ${plural(count)} ready… ${loadedCount} of ${count}`;
    if (result.isFailed) return "Some photos didn't load. Tap to try again.";
    return canShare ? `${plural(count)} to your device` : plural(count);
  };

  const save = async () => {
    if (result === null || isSaving) return;
    if (result.isFailed) {
      setOutcome(null);
      setAttempt((current) => current + 1);
      return;
    }
    setIsSaving(true);
    try {
      const done = await shareOrDownloadFiles(files, { title: base });
      setOutcome(done === 'downloaded' ? `Downloaded ${plural(count)}` : null);
    } catch {
      setOutcome("Couldn't open the share sheet. Tap to try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ActionRow
      isGrouped
      isRoomy
      icon={canShare ? <ImageDown /> : <Download />}
      label={canShare || result === null ? 'Save photos' : 'Download photos'}
      subtitle={getSubtitle()}
      isDisabled={result === null}
      onClick={() => void save()}
    />
  );
}

export default SavePhotosRow;

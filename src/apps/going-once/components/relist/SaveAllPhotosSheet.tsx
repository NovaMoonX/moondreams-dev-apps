import { useEffect, useState } from 'react';

import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import { Loader2 } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { functions, storage } from '@/lib/firebase/config';
import { useAppSelector } from '@/store';
import { selectItems } from '@apps/going-once/store/selectors';
import type { Item } from '@apps/going-once/types';

const MAX_PHOTOS = 1500;
const PHOTOS_PER_THING = 12;
const BUILD_TIMEOUT_MS = 560_000;
const MEGABYTE = 1024 * 1024;
const CANT_BUILD =
  "We couldn't build the zip. Check your connection and try again.";
/** These answers repeat if asked again, so the sheet shows them without a retry. */
const FINAL_CODES = [
  'functions/failed-precondition',
  'functions/resource-exhausted',
  'functions/not-found',
  'functions/permission-denied',
];

type Phase =
  | { name: 'idle' }
  | { name: 'building' }
  | { name: 'ready'; url: string }
  | { name: 'failed'; reason: string; canRetry: boolean };

interface Built {
  url: string;
}

const buildCallable = httpsCallable<
  { saleId: string },
  { path: string; photoCount: number; sizeBytes: number }
>(functions, 'buildSalePhotoArchive', { timeout: BUILD_TIMEOUT_MS });

/** A build keeps running when the sheet closes, so reopening finds it by sale. */
const running = new Map<string, Promise<Built>>();

const startBuild = (saleId: string) => {
  const existing = running.get(saleId);
  if (existing) return existing;
  const started = buildCallable({ saleId })
    .then(({ data }) => getDownloadURL(ref(storage, data.path)))
    .then((url) => ({ url }))
    .finally(() => running.delete(saleId));
  running.set(saleId, started);
  return started;
};

const toFailure = (error: unknown): Phase => {
  const code = error instanceof FirebaseError ? error.code : '';
  return FINAL_CODES.includes(code) && error instanceof Error
    ? { name: 'failed', reason: error.message, canRetry: false }
    : { name: 'failed', reason: CANT_BUILD, canRetry: true };
};

const isSaved = (item: Item) =>
  item.status === 'AVAILABLE' || item.status === 'PENDING';

/** What the zip will hold, from the sizes the photos were saved with. */
function getArchiveTotals(items: Item[]) {
  const photos = items
    .filter(isSaved)
    .flatMap((item) => item.photos.slice(0, PHOTOS_PER_THING));
  return {
    count: photos.length,
    bytes: photos.reduce((sum, photo) => sum + photo.sizeBytes, 0),
  };
}

const formatAbout = (bytes: number) =>
  bytes < MEGABYTE
    ? 'under 1 MB'
    : `about ${Math.round(bytes / MEGABYTE).toLocaleString()} MB`;

interface SaveAllPhotosSheetProps {
  saleId: string;
  onClose: () => void;
}

/** Save all photos: states the count and size, builds one zip of the Available and Pending things' photos (a folder per thing), then offers the download. */
function SaveAllPhotosSheet({ saleId, onClose }: SaveAllPhotosSheetProps) {
  const items = useAppSelector((state) => selectItems(state, saleId));
  const { count, bytes } = getArchiveTotals(items);
  const [phase, setPhase] = useState<Phase>(() =>
    running.has(saleId) ? { name: 'building' } : { name: 'idle' },
  );
  const isTooMany = count > MAX_PHOTOS;

  const watch = (build: Promise<Built>) =>
    build.then(
      ({ url }) => setPhase({ name: 'ready', url }),
      (error: unknown) => setPhase(toFailure(error)),
    );

  const build = () => {
    setPhase({ name: 'building' });
    void watch(startBuild(saleId));
  };

  useEffect(() => {
    const pending = running.get(saleId);
    if (pending) void watch(pending);
    // Only on open: it picks up a build that began before the sheet was closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = (() => {
    if (count === 0)
      return 'Nothing to save yet. Photos of Available and Pending things land here.';
    if (isTooMany)
      return "That's more than 1,500 photos. Save fewer at a time.";
    return `${count} ${count === 1 ? 'photo' : 'photos'} · ${formatAbout(bytes)} · best on Wi-Fi`;
  })();

  const body = (() => {
    if (phase.name === 'building')
      return (
        <p className='text-muted-foreground flex items-center gap-2 text-sm'>
          <Loader2 className='size-4 animate-spin' aria-hidden='true' />
          Building your zip. You can close this and it keeps going.
        </p>
      );
    if (phase.name === 'ready')
      return (
        <p className='text-muted-foreground text-sm'>
          Your zip is ready. On an iPhone it lands in Files; on Android and
          computers, in Downloads.
        </p>
      );
    if (phase.name === 'failed')
      return (
        <p className='text-destructive text-sm' role='alert'>
          {phase.reason}
        </p>
      );
    return (
      <p className='text-muted-foreground text-sm'>
        One folder for each Available or Pending thing, named after it, with its
        photos at listing quality. Sold and taken-off things are left out.
      </p>
    );
  })();

  const primary = (() => {
    if (phase.name === 'ready')
      return (
        <Button type='button' onClick={() => window.location.assign(phase.url)}>
          Download
        </Button>
      );
    if (phase.name === 'failed' && !phase.canRetry) return null;
    return (
      <Button
        type='button'
        disabled={phase.name === 'building' || count === 0 || isTooMany}
        onClick={build}
      >
        {phase.name === 'failed' ? 'Build again' : 'Build the zip'}
      </Button>
    );
  })();

  return (
    <FormSheet isOpen onClose={onClose} title='Save all photos'>
      <div className='space-y-3 pb-4'>
        <p className='text-foreground font-medium'>{summary}</p>
        {body}
      </div>
      <ModalFooterActions
        cancelAction={
          <Button type='button' variant='tertiary' onClick={onClose}>
            Close
          </Button>
        }
        rightActions={primary}
      />
    </FormSheet>
  );
}

export default SaveAllPhotosSheet;

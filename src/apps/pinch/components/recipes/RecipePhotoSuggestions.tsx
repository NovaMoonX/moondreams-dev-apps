import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useQuery } from '@tanstack/react-query';

import FormSection from '@/components/FormSection';
import ImageChoiceGrid from '@/components/ImageChoiceGrid';
import { DEBOUNCE_MS, useDebouncedCallback } from '@/hooks/useDebounce';
import {
  PHOTO_PROBE_TIMEOUT_MS,
  PHOTO_RESULT_COUNT,
} from '@apps/pinch/constants';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';
import { webPhotosQueryOptions } from '@apps/pinch/queries/photoQueries';
import type { WebPhoto } from '@apps/pinch/types';
import { getPhotoQuery, getPhotoQueryKey } from '@apps/pinch/utils/recipeCover';

const POT = '🍲';

// A hotlinked photo is often gone or refuses to be shown elsewhere, so the person hears it at the tap, not after saving.

const probeImage = (url: string, timeoutMs: number) =>
  new Promise<boolean>((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(false), timeoutMs);
    const settle = (isLoaded: boolean) => {
      window.clearTimeout(timer);
      resolve(isLoaded);
    };
    image.referrerPolicy = 'no-referrer';
    image.onload = () => settle(true);
    image.onerror = () => settle(false);
    image.src = url;
  });

const SKELETON_TILES = Array.from(
  { length: PHOTO_RESULT_COUNT },
  (_, index) => index,
);

interface RecipePhotoSuggestionsProps {
  uid: string;
  title: string;
  selectedUrl: string | null;
  onPick: (photo: WebPhoto) => void;
}

function RecipePhotoSuggestions({
  uid,
  title,
  selectedUrl,
  onPick,
}: RecipePhotoSuggestionsProps) {
  const { settings, save } = usePinchSettings(uid);
  const { addToast } = useToast();
  const query = getPhotoQuery(title);
  const [searched, setSearched] = useState<string | null>(null);
  const [checkingUrl, setCheckingUrl] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState<string[]>([]);
  const [hasFailedPick, setHasFailedPick] = useState(false);
  const latestPick = useRef<string | null>(null);
  const { run } = useDebouncedCallback(
    (next: string | null) => setSearched(next),
    DEBOUNCE_MS.autocomplete,
  );

  useEffect(() => {
    run(query);
  }, [query, run]);

  useEffect(
    () => () => {
      latestPick.current = null;
    },
    [],
  );

  const { data, isError, isPending } = useQuery({
    ...webPhotosQueryOptions(searched ?? ''),
    enabled: settings.suggestPhotos && searched !== null,
  });

  if (!settings.suggestPhotos || query === null) {
    return null;
  }

  const isWaiting =
    searched === null ||
    getPhotoQueryKey(searched) !== getPhotoQueryKey(query) ||
    (isPending && !isError);

  const handlePick = async (photo: WebPhoto) => {
    if (photo.imageUrl === selectedUrl || photo.imageUrl === checkingUrl) {
      return;
    }
    latestPick.current = photo.imageUrl;
    setHasFailedPick(false);
    setCheckingUrl(photo.imageUrl);
    const isReachable = await probeImage(
      photo.imageUrl,
      PHOTO_PROBE_TIMEOUT_MS,
    );
    if (latestPick.current !== photo.imageUrl) return;
    latestPick.current = null;
    setCheckingUrl(null);
    if (isReachable) {
      onPick(photo);
      return;
    }
    setUnreachable((urls) => [...urls, photo.imageUrl]);
    setHasFailedPick(true);
  };

  const handleTurnOff = async () => {
    if (!(await save({ suggestPhotos: false }))) return;
    addToast({
      title: 'Photo suggestions are off',
      type: 'info',
      action: {
        label: 'Undo',
        onClick: () => void save({ suggestPhotos: true }),
      },
    });
  };

  const getBody = () => {
    if (isWaiting) {
      return (
        <>
          <div className='grid grid-cols-3 gap-2' aria-hidden='true'>
            {SKELETON_TILES.map((tile) => (
              <div
                key={tile}
                className='bg-accent aspect-4/3 animate-pulse rounded-xl'
              />
            ))}
          </div>
          <p className='text-muted-foreground text-xs' role='status'>
            Searching…
          </p>
        </>
      );
    }
    if (isError) {
      return (
        <p className='text-muted-foreground text-sm'>
          We couldn’t look up photos just now. You can still choose your own
          above.
        </p>
      );
    }
    if (!data || data.length === 0) {
      return (
        <p className='text-muted-foreground text-sm'>
          Nothing turned up for this title. You can still choose your own photo
          above.
        </p>
      );
    }
    return (
      <>
        <ImageChoiceGrid
          label='Photos from the web'
          choices={data.map((photo) => ({
            key: photo.imageUrl,
            src: photo.thumbUrl,
            label: `${photo.title || 'Photo'} from ${photo.host}`,
            isUnavailable: unreachable.includes(photo.imageUrl),
          }))}
          selectedKey={selectedUrl}
          checkingKey={checkingUrl}
          fallback={POT}
          onPick={(key) => {
            const photo = data.find((entry) => entry.imageUrl === key);
            if (photo) void handlePick(photo);
          }}
        />
        {hasFailedPick && (
          <p className='text-destructive text-sm' role='alert'>
            That photo can’t be reached right now. Try another one.
          </p>
        )}
      </>
    );
  };

  return (
    <FormSection
      title='Photos from the web'
      action={
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          rounded='full'
          className='border-border text-foreground! h-10 border px-3 font-normal'
          onClick={() => void handleTurnOff()}
        >
          Turn off
        </Button>
      }
    >
      <p className='text-muted-foreground text-xs'>
        Searches the web with this title. Nothing else is sent.
      </p>
      <div className='space-y-2'>{getBody()}</div>
    </FormSection>
  );
}

export default RecipePhotoSuggestions;

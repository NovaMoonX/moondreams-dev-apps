import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { Camera, ImagePlus, Plus, X } from 'lucide-react';

import ActionChips, { type ActionChip } from '@/components/ActionChips';
import FallbackImage from '@/components/FallbackImage';
import { useCanTakePhoto } from '@/hooks/useCanTakePhoto';
import { openFileChooser } from '@/utils/fileUtils';
import { IDEA_KIND_EMOJIS, MAX_RECIPE_FILES } from '@apps/pinch/constants';
import { useStorageImageUrl } from '@apps/pinch/hooks/useStorageImageUrl';
import type { IdeaPhoto } from '@apps/pinch/hooks/useIdeaPhotos';

interface IdeaPhotoTileProps {
  url: string | null;
  size?: 'sm' | 'lg' | 'fill';
}

const TILE_SIZES = {
  sm: 'size-16',
  lg: 'size-24',
  fill: 'aspect-square w-full',
};

export function IdeaPhotoTile({ url, size = 'lg' }: IdeaPhotoTileProps) {
  return (
    <span
      className={`bg-accent grid shrink-0 place-items-center overflow-hidden rounded-xl text-3xl ${TILE_SIZES[size]}`}
      aria-hidden='true'
    >
      {url ? (
        <FallbackImage
          src={url}
          alt=''
          fallback={IDEA_KIND_EMOJIS.PHOTO}
          className='size-full object-cover'
        />
      ) : (
        IDEA_KIND_EMOJIS.PHOTO
      )}
    </span>
  );
}

export function SavedIdeaPhotoTile({
  path,
  version,
  size,
}: {
  path: string;
  version: number;
  size?: 'sm' | 'lg' | 'fill';
}) {
  return <IdeaPhotoTile url={useStorageImageUrl(path, version)} size={size} />;
}

interface IdeaPhotosFieldProps {
  photos: IdeaPhoto[];
  error: string | null;
  isPreparing: boolean;
  /** Pictures already stored with the idea, shown until the person picks new ones, which replace them as a set. */
  savedPaths?: string[];
  savedVersion?: number;
  onAdd: (files: File[]) => void;
  onClear: () => void;
}

/** Up to three photos or screenshots kept as one idea: the picked ones side by side, a count line, and chips to add another or start over. */
function IdeaPhotosField({
  photos,
  error,
  isPreparing,
  savedPaths = [],
  savedVersion = 0,
  onAdd,
  onClear,
}: IdeaPhotosFieldProps) {
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const isTouch = useCanTakePhoto();
  const isReplacing = photos.length === 0 && savedPaths.length > 0;
  const count = photos.length + (isPreparing ? 1 : 0);

  const getSummary = () => {
    if (photos.length > 1) {
      return `${photos.length} photos, kept as one idea. The first is its picture.`;
    }
    if (photos.length === 1) {
      return `Add up to ${MAX_RECIPE_FILES} photos or screenshots of the same idea.`;
    }
    if (isReplacing) {
      return savedPaths.length > 1
        ? `${savedPaths.length} photos kept. Choosing new ones replaces them.`
        : 'Choosing new photos replaces this one.';
    }
    return `Up to ${MAX_RECIPE_FILES} photos or screenshots, kept as one idea.`;
  };

  const chips: ActionChip[] = [
    ...(photos.length < MAX_RECIPE_FILES && count > 0
      ? [
          {
            key: 'another',
            icon: <Plus className='h-4 w-4' />,
            label: 'Add another photo',
            description: `Add a photo, up to ${MAX_RECIPE_FILES}`,
            onClick: () => openFileChooser(fileInput),
          },
        ]
      : []),
    ...(photos.length === 0 && !isPreparing && isReplacing
      ? [
          {
            key: 'replace',
            icon: <ImagePlus className='h-4 w-4' />,
            label: 'Replace photos',
            onClick: () => openFileChooser(fileInput),
          },
        ]
      : []),
    ...(photos.length > 0
      ? [
          {
            key: 'clear',
            icon: <X className='h-4 w-4' />,
            label:
              photos.length === 1 ? 'Remove the photo' : 'Remove the photos',
            onClick: onClear,
          },
        ]
      : []),
  ];

  return (
    <div className='space-y-2'>
      <span className='block text-sm font-medium'>Pictures</span>
      <div className='flex flex-wrap items-center gap-2'>
        {photos.length > 0
          ? photos.map((photo) => (
              <IdeaPhotoTile key={photo.key} url={photo.previewUrl} />
            ))
          : savedPaths.map((path) => (
              <SavedIdeaPhotoTile
                key={path}
                path={path}
                version={savedVersion}
              />
            ))}
        {photos.length === 0 && savedPaths.length === 0 && (
          <IdeaPhotoTile url={null} />
        )}
        {photos.length === 0 && savedPaths.length === 0 && (
          <div className='flex flex-col items-start gap-2'>
            <Button
              type='button'
              variant='secondary'
              loading={isPreparing}
              disabled={isPreparing}
              onClick={() => openFileChooser(fileInput)}
            >
              Choose photos
            </Button>
            {isTouch && (
              <Button
                type='button'
                variant='tertiary'
                disabled={isPreparing}
                onClick={() => openFileChooser(fileInput, { isCamera: true })}
              >
                <Camera className='h-4 w-4' />
                Take a photo
              </Button>
            )}
          </div>
        )}
      </div>
      {error ? (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      ) : (
        <p className='text-muted-foreground text-xs'>{getSummary()}</p>
      )}
      <ActionChips
        actions={chips}
        label='What else you can do with the photos'
      />
      <Input
        key={fileKey}
        ref={setFileInput}
        type='file'
        multiple
        accept='image/*'
        aria-label='Choose photos for this idea'
        className='hidden'
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          if (picked.length > 0) onAdd(picked);
          setFileKey((current) => current + 1);
        }}
      />
    </div>
  );
}

export default IdeaPhotosField;

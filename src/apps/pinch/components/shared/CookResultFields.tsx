import { useState } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Camera } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';
import PhotoPicker from '@/components/forms/PhotoPicker';
import StarRating from '@/components/StarRating';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { useCookPhotoUrl } from '@apps/pinch/hooks/useCookPhotoUrl';
import { setCookReview } from '@apps/pinch/store/actions/cookActions';
import { selectCooksById } from '@apps/pinch/store/selectors';

interface CookResultFieldsProps {
  uid: string;
  cookId: string;
  /** A larger picture, for the screen whose job is this cook; the last panel keeps it small. */
  isLarge?: boolean;
}

/** How a cook turned out: a half-star rating and one photo. Each is written the moment it is set, on its own, so the screen around it is never locked and nothing needs a Save. */
function CookResultFields({ uid, cookId, isLarge = false }: CookResultFieldsProps) {
  const dispatch = useAppDispatch();
  const cook = useAppSelector(selectCooksById).get(cookId) ?? null;
  const storedUrl = useCookPhotoUrl(cook);
  const upload = useImageUpload(null);
  const { pick, clear } = upload;
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (cook === null) return null;

  const shownUrl = storedUrl ?? upload.previewUrl;
  const hasPhoto = cook.photoPath != null || upload.previewUrl !== null;

  const write = async (patch: { rating?: number | null; photoFile?: File | null }) => {
    setError(null);
    try {
      await dispatch(setCookReview({ uid, id: cookId, ...patch })).unwrap();
    } catch (writeError) {
      setError(getErrorMessage(writeError, 'Unable to save that.'));
      throw writeError;
    }
  };

  const handlePick = async (file: File | null) => {
    if (file === null) return;
    pick(file);
    setIsUploading(true);
    try {
      await write({ photoFile: file });
    } catch {
      clear();
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    setIsUploading(true);
    try {
      await write({ photoFile: null });
      clear();
    } catch {
      // The photo stays, and the line under the buttons says why.
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className='space-y-3'>
      <div
        className={join(
          'flex gap-4',
          isLarge ? 'flex-col' : 'items-center max-[359px]:flex-col max-[359px]:items-start',
        )}
      >
        <span
          className={join(
            'bg-accent text-accent-foreground relative grid shrink-0 place-items-center overflow-hidden rounded-2xl',
            isLarge
              ? 'aspect-4/3 max-h-44 w-full text-5xl'
              : 'size-24 text-3xl',
          )}
          aria-hidden={shownUrl === null ? true : undefined}
        >
          {shownUrl ? (
            <FallbackImage
              src={shownUrl}
              alt='Your photo of this cook'
              fallback={<Camera className='h-8 w-8' aria-hidden='true' />}
              className='absolute inset-0 size-full object-cover object-center'
            />
          ) : (
            <Camera className='h-8 w-8' aria-hidden='true' />
          )}
        </span>
        <div className='flex min-w-0 flex-1 flex-col items-start gap-2'>
          <StarRating
            size='lg'
            value={cook.rating ?? null}
            onChange={(rating) => void write({ rating }).catch(() => undefined)}
          />
          <PhotoPicker
            photoUrl={hasPhoto ? (shownUrl ?? '') : null}
            showPreview={false}
            loading={isUploading}
            uploadLabel='Add a photo'
            changeLabel='Change photo'
            onSelect={(file) => void handlePick(file)}
            onRemove={() => void handleRemove()}
          />
        </div>
      </div>
      {(error ?? upload.error) && (
        <p className='text-destructive text-sm' role='alert'>
          {error ?? upload.error}
        </p>
      )}
    </div>
  );
}

export default CookResultFields;

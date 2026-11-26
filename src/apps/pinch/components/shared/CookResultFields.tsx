import { useState } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import PhotoSetPicker from '@/components/forms/PhotoSetPicker';
import StarRating from '@/components/StarRating';
import { usePhotoSetUploads } from '@/hooks/usePhotoSetUploads';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { MAX_COOK_PHOTOS } from '@apps/pinch/constants';
import { useCookPhotoUrls } from '@apps/pinch/hooks/useCookPhotoUrl';
import {
  addCookPhoto,
  removeCookPhoto,
  reorderCookPhotos,
  setCookReview,
} from '@apps/pinch/store/actions/cookActions';
import { selectCooksById } from '@apps/pinch/store/selectors';
import { getCookPhotoPaths } from '@apps/pinch/utils/cooks';

interface CookResultFieldsProps {
  uid: string;
  cookId: string;
  /** Left-aligned where the cook is the whole screen; centred otherwise. */
  isLarge?: boolean;
}

/** How a cook turned out (half stars, up to three photos), each saved the moment it is set. */
function CookResultFields({
  uid,
  cookId,
  isLarge = false,
}: CookResultFieldsProps) {
  const dispatch = useAppDispatch();
  const cook = useAppSelector(selectCooksById).get(cookId) ?? null;
  const paths = cook === null ? [] : getCookPhotoPaths(cook);
  const photos = useCookPhotoUrls(paths);
  const uploads = usePhotoSetUploads(
    (file) => addCookPhoto(uid, cookId, file),
    paths,
    'photo',
  );
  const [error, setError] = useState<string | null>(null);

  if (cook === null) return null;

  const rate = async (rating: number | null) => {
    setError(null);
    try {
      await dispatch(setCookReview({ uid, id: cookId, rating })).unwrap();
    } catch (writeError) {
      setError(getErrorMessage(writeError, 'Unable to save that.'));
    }
  };

  return (
    <div
      className={join('space-y-3', !isLarge && 'flex flex-col items-center')}
    >
      <StarRating
        size='lg'
        isCaptionReserved={false}
        value={cook.rating ?? null}
        onChange={(rating) => void rate(rating)}
      />
      <div className={join(!isLarge && 'w-fit max-w-full')}>
        <PhotoSetPicker
          photos={photos}
          uploads={uploads}
          max={MAX_COOK_PHOTOS}
          hasAddTile
          onReorder={(ids) => reorderCookPhotos(uid, cookId, ids)}
          onRemove={(path) => removeCookPhoto(uid, cookId, path)}
        />
      </div>
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
}

export default CookResultFields;

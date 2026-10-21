import FallbackImage from '@/components/FallbackImage';
import PhotoPicker from '@/components/forms/PhotoPicker';
import SummaryEditor from '@/components/SummaryEditor';
import RecipePhotoSuggestions from '@apps/pinch/components/recipes/RecipePhotoSuggestions';
import type { WebPhoto } from '@apps/pinch/types';
import type { ShownCover } from '@apps/pinch/utils/recipeCover';

const PLACEHOLDER = '🍲';
const UPLOAD_NOTE =
  "A photo under 5 MB. It's shrunk to fit and saved with the recipe.";

interface RecipePhotoFieldProps {
  uid: string;
  cover: ShownCover | null;
  error: string | null;
  canSuggest: boolean;
  title: string;
  onSelect: (file: File | null) => void;
  onPickWeb: (photo: WebPhoto) => void;
  onRemove: () => void;
}

function RecipePhotoField({
  uid,
  cover,
  error,
  canSuggest,
  title,
  onSelect,
  onPickWeb,
  onRemove,
}: RecipePhotoFieldProps) {
  return (
    <SummaryEditor
      label='Photo'
      title='Photo'
      summary={cover ? 'Photo added' : ''}
      placeholder='Add a photo'
      problem={error}
      shouldFocus={false}
      leading={
        <span className='bg-accent relative grid size-12 place-items-center overflow-hidden rounded-xl text-2xl'>
          {cover ? (
            <FallbackImage
              src={cover.thumbUrl}
              alt=''
              fallback={PLACEHOLDER}
              className='absolute inset-0 size-full object-cover object-center'
            />
          ) : (
            PLACEHOLDER
          )}
        </span>
      }
    >
      <div className='space-y-4 [@media(max-height:600px)_and_(min-width:640px)]:grid [@media(max-height:600px)_and_(min-width:640px)]:grid-cols-2 [@media(max-height:600px)_and_(min-width:640px)]:items-start [@media(max-height:600px)_and_(min-width:640px)]:gap-5 [@media(max-height:600px)_and_(min-width:640px)]:space-y-0'>
        <PhotoPicker
          variant='cover'
          isCompact={canSuggest}
          photoUrl={cover?.url ?? null}
          placeholder={PLACEHOLDER}
          uploadLabel='Choose a photo'
          changeLabel='Choose another'
          note={
            cover?.host
              ? `From ${cover.host}. Kept as a web link, not a copy, so it can disappear.`
              : UPLOAD_NOTE
          }
          error={error}
          onSelect={onSelect}
          onRemove={onRemove}
        />
        {canSuggest && (
          <RecipePhotoSuggestions
            uid={uid}
            title={title}
            selectedUrl={cover?.host ? cover.url : null}
            onPick={onPickWeb}
          />
        )}
      </div>
    </SummaryEditor>
  );
}

export default RecipePhotoField;

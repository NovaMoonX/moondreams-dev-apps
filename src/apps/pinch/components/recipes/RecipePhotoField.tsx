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
  /** The cover the form shows now, or null. */
  cover: ShownCover | null;
  error: string | null;
  /** Web photo suggestions are for a recipe being made, never for one being edited. */
  canSuggest: boolean;
  /** The recipe's title as it is typed, which the suggestions search with. */
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
        <span className='bg-accent grid size-12 place-items-center overflow-hidden rounded-xl text-2xl'>
          {cover ? (
            <FallbackImage
              src={cover.thumbUrl}
              alt=''
              fallback={PLACEHOLDER}
              className='size-full object-cover'
            />
          ) : (
            PLACEHOLDER
          )}
        </span>
      }
    >
      <div className='space-y-5'>
        <PhotoPicker
          variant='cover'
          photoUrl={cover?.url ?? null}
          placeholder={PLACEHOLDER}
          uploadLabel='Choose a photo'
          changeLabel='Choose another'
          note={
            cover?.host
              ? `From ${cover.host}. Pinch keeps its web address, not a copy, so it stops showing if that site takes it down.`
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

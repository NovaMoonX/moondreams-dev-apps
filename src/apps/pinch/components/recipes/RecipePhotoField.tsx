import FallbackImage from '@/components/FallbackImage';
import PhotoPicker from '@/components/forms/PhotoPicker';
import SummaryEditor from '@/components/SummaryEditor';

const PLACEHOLDER = '🍲';

interface RecipePhotoFieldProps {
  photoUrl: string | null;
  error: string | null;
  onSelect: (file: File | null) => void;
  onRemove: () => void;
}

function RecipePhotoField({
  photoUrl,
  error,
  onSelect,
  onRemove,
}: RecipePhotoFieldProps) {
  return (
    <SummaryEditor
      label='Photo'
      title='Photo'
      summary={photoUrl ? 'Photo added' : ''}
      placeholder='Add a photo'
      problem={error}
      shouldFocus={false}
      leading={
        <span className='bg-accent grid size-12 place-items-center overflow-hidden rounded-xl text-2xl'>
          {photoUrl ? (
            <FallbackImage
              src={photoUrl}
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
      <PhotoPicker
        variant='cover'
        photoUrl={photoUrl}
        placeholder={PLACEHOLDER}
        uploadLabel='Choose a photo'
        changeLabel='Choose another'
        note="A photo under 5 MB. It's shrunk to fit and saved with the recipe."
        error={error}
        onSelect={onSelect}
        onRemove={onRemove}
      />
    </SummaryEditor>
  );
}

export default RecipePhotoField;

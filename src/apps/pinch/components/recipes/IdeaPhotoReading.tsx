import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { getBlob, ref } from 'firebase/storage';

import FormSection from '@/components/FormSection';
import IntroCard from '@/components/IntroCard';
import MethodPicker from '@/components/MethodPicker';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAppSelector } from '@/store';
import { storage } from '@/lib/firebase/config';
import { getAiReadFailureMessage } from '@/lib/firebase/aiFailure';
import { SavedIdeaPhotoTile } from '@apps/pinch/components/ideas/IdeaPhotosField';
import { IDEA_KIND_EMOJIS, RECIPE_START_METHODS } from '@apps/pinch/constants';
import {
  extractRecipeFromFiles,
  type ExtractedRecipe,
} from '@apps/pinch/lib/extractRecipe';
import { selectPinchSettings } from '@apps/pinch/store/selectors';
import type { Idea } from '@apps/pinch/types';
import { getIdeaPhotoPaths } from '@apps/pinch/utils/ideas';

const MANUAL_METHOD = RECIPE_START_METHODS.find(
  (method) => method.id === 'manual',
);

const toFile = async (path: string, index: number) => {
  const blob = await getBlob(ref(storage, path));
  return new File([blob], `photo-${index + 1}.webp`, {
    type: blob.type || 'image/webp',
  });
};

interface IdeaPhotoReadingProps {
  idea: Idea;
  onRead: (recipe: ExtractedRecipe) => void;
  onBack: () => void;
  onManual: () => void;
}

/** The way a photo idea becomes a recipe: its stored pictures are fetched and read together once the person taps, and the form is filled for review. */
function IdeaPhotoReading({
  idea,
  onRead,
  onBack,
  onManual,
}: IdeaPhotoReadingProps) {
  const paths = getIdeaPhotoPaths(idea);
  const isFinishing = useAppSelector(selectPinchSettings).isFinishingRecipes;
  const isMountedRef = useRef(true);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const read = async () => {
    setIsReading(true);
    setError(null);
    try {
      const files = await Promise.all(paths.map(toFile));
      const recipe = await extractRecipeFromFiles(files, null, isFinishing);
      if (!isMountedRef.current) return;
      if (recipe.ingredients.length === 0) {
        setError(
          paths.length > 1
            ? "We couldn't find a recipe in those photos. Try clearer ones, or write it yourself."
            : "We couldn't find a recipe in that photo. Try a clearer one, or write it yourself.",
        );
        setIsReading(false);
        return;
      }
      onRead(recipe);
    } catch (readError) {
      console.error('Reading the idea photos failed', readError);
      if (!isMountedRef.current) return;
      setError(
        getAiReadFailureMessage(readError, {
          subject: 'photo',
          fallback: 'write the recipe yourself',
        }),
      );
      setIsReading(false);
    }
  };

  return (
    <div className='flex flex-1 flex-col gap-4 [@media(min-height:700px)]:gap-6'>
      <IntroCard
        icon={IDEA_KIND_EMOJIS.PHOTO}
        lead={`From your idea: ${idea.title}`}
      >
        {paths.length > 1
          ? `An AI reads its ${paths.length} photos together as one recipe and fills in the form. You look it over before anything is saved.`
          : 'An AI reads its photo and fills in the form. You look it over before anything is saved.'}
      </IntroCard>
      <FormSection title={paths.length > 1 ? 'Photos' : 'Photo'}>
        <ul className='grid grid-cols-3 gap-2 sm:grid-cols-6'>
          {paths.map((path) => (
            <li key={path}>
              <SavedIdeaPhotoTile
                path={path}
                version={idea.updatedAt}
                size='fill'
              />
            </li>
          ))}
        </ul>
        {isReading ? (
          <p className='text-muted-foreground text-sm' role='status'>
            Reading {paths.length > 1 ? 'the photos' : 'the photo'}…
          </p>
        ) : (
          error && (
            <p className='text-destructive text-sm break-words' role='alert'>
              {error}
            </p>
          )
        )}
      </FormSection>
      {MANUAL_METHOD && (
        <MethodPicker
          disabled={isReading}
          methods={[{ ...MANUAL_METHOD, isQuiet: true, onPick: onManual }]}
        />
      )}
      <ModalFooterActions
        cancelAction={
          <Button type='button' variant='secondary' onClick={onBack}>
            Back
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isReading}
            disabled={isReading}
            onClick={() => void read()}
          >
            Fill in the recipe
          </Button>
        }
      />
    </div>
  );
}

export default IdeaPhotoReading;

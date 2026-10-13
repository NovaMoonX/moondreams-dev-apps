import { useState } from 'react';

import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import RecipeForm, {
  type RecipeRead,
} from '@apps/pinch/components/recipes/RecipeForm';
import RecipeStart from '@apps/pinch/components/recipes/RecipeStart';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { selectRecipesById } from '@apps/pinch/store/selectors';

interface RecipeSubviewProps {
  uid: string;
  recipeId: string | null;
}

/** The recipe as a full-screen layer: a new one begins with how to start it, then the form, whose header carries the recipe's name. */
function RecipeSubview({ uid, recipeId }: RecipeSubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const existing =
    useAppSelector(selectRecipesById).get(recipeId ?? '') ?? null;
  const [stage, setStage] = useState<'start' | 'form'>(
    recipeId === null ? 'start' : 'form',
  );
  const [read, setRead] = useState<RecipeRead | null>(null);
  const [title, setTitle] = useState(existing?.title ?? '');

  return (
    <Subview
      overlay
      title={title.trim() || existing?.title || 'New recipe'}
      onClose={closeSubview}
    >
      {stage === 'start' ? (
        <RecipeStart
          onRead={(recipe, source, label) => {
            setRead({ recipe, source, label });
            setTitle(recipe.title ?? '');
            setStage('form');
          }}
          onManual={() => setStage('form')}
        />
      ) : (
        <RecipeForm
          key={recipeId ?? 'new'}
          uid={uid}
          recipeId={recipeId}
          initialRead={read}
          onTitleChange={setTitle}
        />
      )}
    </Subview>
  );
}

export default RecipeSubview;

import { useState } from 'react';

import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import RecipeForm, {
  type RecipeRead,
} from '@apps/pinch/components/recipes/RecipeForm';
import RecipeReader from '@apps/pinch/components/recipes/RecipeReader';
import RecipeStart from '@apps/pinch/components/recipes/RecipeStart';
import { RECIPE_START_METHODS } from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { selectRecipesById } from '@apps/pinch/store/selectors';
import type { RecipeStartMethod } from '@apps/pinch/types';

type Stage = 'start' | 'form' | Exclude<RecipeStartMethod, 'manual'>;

const getStage = (method: RecipeStartMethod | undefined): Stage => {
  if (method === undefined) return 'start';
  return method === 'manual' ? 'form' : method;
};

interface RecipeSubviewProps {
  uid: string;
  recipeId: string | null;
}

/** The recipe as a full-screen layer: a new one begins with how to start it, each way finishes on its own screen, then the form, whose header carries the recipe's name. */
function RecipeSubview({ uid, recipeId }: RecipeSubviewProps) {
  const { subview, closeSubview } = usePinchOverlay();
  const startMethod = subview?.kind === 'recipe' ? subview.method : undefined;
  const existing =
    useAppSelector(selectRecipesById).get(recipeId ?? '') ?? null;
  const [stage, setStage] = useState<Stage>(
    recipeId === null ? getStage(startMethod) : 'form',
  );
  const [read, setRead] = useState<RecipeRead | null>(null);
  const [title, setTitle] = useState(existing?.title ?? '');

  const isReaderStage = stage !== 'start' && stage !== 'form';

  const getTitle = () => {
    if (stage === 'start') return 'New recipe';
    if (stage === 'form')
      return title.trim() || existing?.title || 'New recipe';
    return (
      RECIPE_START_METHODS.find((method) => method.id === stage)?.title ??
      'New recipe'
    );
  };

  const getBody = () => {
    if (stage === 'start') {
      return <RecipeStart onPick={(method) => setStage(getStage(method))} />;
    }
    if (stage === 'form') {
      return (
        <RecipeForm
          key={recipeId ?? 'new'}
          uid={uid}
          recipeId={recipeId}
          initialRead={read}
          onTitleChange={setTitle}
        />
      );
    }
    return (
      <RecipeReader
        key={stage}
        method={stage}
        onRead={(recipe, source, label) => {
          setRead({ recipe, source, label });
          setTitle(recipe.title ?? '');
          setStage('form');
        }}
        onManual={() => setStage('form')}
      />
    );
  };

  return (
    <Subview
      overlay
      title={getTitle()}
      onClose={closeSubview}
      onBack={
        isReaderStage && startMethod === undefined
          ? () => setStage('start')
          : closeSubview
      }
    >
      {getBody()}
    </Subview>
  );
}

export default RecipeSubview;

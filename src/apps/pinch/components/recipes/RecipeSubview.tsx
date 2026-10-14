import { useRef, useState } from 'react';

import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import RecipeForm, {
  type RecipeRead,
} from '@apps/pinch/components/recipes/RecipeForm';
import RecipeReader from '@apps/pinch/components/recipes/RecipeReader';
import RecipeStart from '@apps/pinch/components/recipes/RecipeStart';
import { RECIPE_START_METHODS } from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectIdeasById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
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
  const { subview, closeSubview, setIsStartOpen } = usePinchOverlay();
  const { confirm } = useActionModal();
  const startMethod = subview?.kind === 'recipe' ? subview.method : undefined;
  const fromDrawer = subview?.kind === 'recipe' && subview.fromDrawer === true;
  const fromIdeaId =
    subview?.kind === 'recipe' ? (subview.fromIdeaId ?? null) : null;
  const isDirtyRef = useRef(false);
  const existing =
    useAppSelector(selectRecipesById).get(recipeId ?? '') ?? null;
  const ideasById = useAppSelector(selectIdeasById);
  const [fromIdea] = useState(() =>
    recipeId === null ? (ideasById.get(fromIdeaId ?? '') ?? null) : null,
  );
  const [stage, setStage] = useState<Stage>(
    recipeId === null ? getStage(startMethod) : 'form',
  );
  const [read, setRead] = useState<RecipeRead | null>(null);
  const [title, setTitle] = useState(existing?.title ?? fromIdea?.title ?? '');

  const isReaderStage = stage !== 'start' && stage !== 'form';

  const leave = async () => {
    if (isDirtyRef.current) {
      const confirmed = await confirm({
        title: 'Discard this recipe?',
        message:
          "It isn't saved yet. If you leave now, what you typed or read in is lost.",
        confirmText: 'Discard',
        cancelText: 'Keep editing',
        destructive: true,
      });
      if (!confirmed) return;
    }
    closeSubview();
  };

  const goBack = () => {
    if (isReaderStage && fromDrawer) {
      closeSubview();
      setIsStartOpen(true);
      return;
    }
    if (isReaderStage) {
      setStage('start');
      return;
    }
    void leave();
  };

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
          initialIdea={fromIdea}
          isDirtyRef={isDirtyRef}
          onLeave={() => void leave()}
          onTitleChange={setTitle}
        />
      );
    }
    return (
      <RecipeReader
        key={stage}
        method={stage}
        onRead={(recipe, source, label) => {
          isDirtyRef.current = true;
          setRead({ recipe, source, label });
          setTitle(recipe.title ?? '');
          setStage('form');
        }}
        onManual={() => setStage('form')}
      />
    );
  };

  return (
    <Subview overlay title={getTitle()} onClose={closeSubview} onBack={goBack}>
      {getBody()}
    </Subview>
  );
}

export default RecipeSubview;

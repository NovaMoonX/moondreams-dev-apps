import Subview from '@/components/Subview';
import RecipeForm from '@apps/pinch/components/recipes/RecipeForm';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';

interface RecipeSubviewProps {
  uid: string;
  recipeId: string | null;
}

/** The recipe form as a full-screen layer, so it can be as long as a recipe is and its footer stays pinned. */
function RecipeSubview({ uid, recipeId }: RecipeSubviewProps) {
  const { closeSubview } = usePinchOverlay();

  return (
    <Subview overlay title='Recipe' onClose={closeSubview}>
      <RecipeForm key={recipeId ?? 'new'} uid={uid} recipeId={recipeId} />
    </Subview>
  );
}

export default RecipeSubview;

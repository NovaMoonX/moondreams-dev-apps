import DetailSheet from '@/components/DetailSheet';
import MethodPicker from '@/components/MethodPicker';
import { RECIPE_START_METHODS } from '@apps/pinch/constants';
import type { RecipeStartMethod } from '@apps/pinch/types';

interface RecipeStartProps {
  onPick: (method: RecipeStartMethod) => void;
}

/** The ways a new recipe can begin, side by side. Each opens on its own screen, and nothing is saved until the person has looked over the form. */
function RecipeStart({ onPick }: RecipeStartProps) {
  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        Start from something you already have, or write it yourself. You’ll look
        it over before anything is saved.
      </p>
      <MethodPicker
        methods={RECIPE_START_METHODS.map((method) => ({
          ...method,
          isQuiet: method.id === 'manual',
          onPick: () => onPick(method.id),
        }))}
      />
    </div>
  );
}

interface RecipeStartDrawerProps extends RecipeStartProps {
  onClose: () => void;
}

/** The list of ways as a phone's drawer; picking one closes it before that way's screen opens. */
export function RecipeStartDrawer({ onPick, onClose }: RecipeStartDrawerProps) {
  return (
    <DetailSheet isOpen onClose={onClose} title='New recipe'>
      <RecipeStart onPick={onPick} />
    </DetailSheet>
  );
}

export default RecipeStart;

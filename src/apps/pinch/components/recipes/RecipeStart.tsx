import DetailSheet from '@/components/DetailSheet';
import MethodPicker from '@/components/MethodPicker';
import {
  KEEP_AS_IDEA_METHOD,
  RECIPE_START_METHODS,
} from '@apps/pinch/constants';
import type { RecipeStartMethod } from '@apps/pinch/types';

interface RecipeStartProps {
  onPick: (method: RecipeStartMethod) => void;
  /** Keeps a link, a photo or a few words for later instead of making the recipe now. */
  onKeepAsIdea: () => void;
}

/** The ways a new recipe can begin, side by side. Each opens on its own screen, and nothing is saved until the person has looked over the form. */
function RecipeStart({ onPick, onKeepAsIdea }: RecipeStartProps) {
  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        Start from something you already have, or write it yourself. You’ll look
        it over before anything is saved.
      </p>
      <MethodPicker
        methods={[
          ...RECIPE_START_METHODS.map((method) => ({
            ...method,
            isQuiet: method.id === 'manual',
            onPick: () => onPick(method.id),
          })),
          { ...KEEP_AS_IDEA_METHOD, isQuiet: true, onPick: onKeepAsIdea },
        ]}
      />
    </div>
  );
}

interface RecipeStartDrawerProps extends RecipeStartProps {
  onClose: () => void;
}

/** The list of ways as a phone's drawer; picking one closes it before that way's screen opens. */
export function RecipeStartDrawer({
  onPick,
  onKeepAsIdea,
  onClose,
}: RecipeStartDrawerProps) {
  return (
    <DetailSheet isOpen onClose={onClose} title='New recipe'>
      <RecipeStart onPick={onPick} onKeepAsIdea={onKeepAsIdea} />
    </DetailSheet>
  );
}

export default RecipeStart;

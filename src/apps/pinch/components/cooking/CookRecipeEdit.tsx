import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { useAppSelector } from '@/store';
import RecipeForm from '@apps/pinch/components/recipes/RecipeForm';
import { selectNotesById } from '@apps/pinch/store/selectors';

interface CookRecipeEditProps {
  uid: string;
  recipeId: string;
  /** The note being applied to the recipe, quoted at the top of the form. */
  noteId: string | null;
  isDirtyRef: RefObject<boolean>;
  backStepRef: RefObject<(() => boolean) | null>;
  onTitleChange: (title: string) => void;
  onLeave: () => void;
  onSaved: () => void;
}

/** The recipe form inside the cooking screen, in place of the step, so saving or leaving returns to cooking with the session as it was. */
function CookRecipeEdit({
  uid,
  recipeId,
  noteId,
  isDirtyRef,
  backStepRef,
  onTitleChange,
  onLeave,
  onSaved,
}: CookRecipeEditProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const notesById = useAppSelector(selectNotesById);
  const [note] = useState(() => {
    const found = notesById.get(noteId ?? '') ?? null;
    return found !== null && found.recipeId === recipeId ? found : null;
  });

  useLayoutEffect(() => {
    rootRef.current
      ?.closest<HTMLElement>('[data-subview-overlay]')
      ?.scrollTo({ top: 0 });
  }, []);

  return (
    <div
      ref={rootRef}
      className='flex flex-1 flex-col *:last:flex *:last:flex-1 *:last:flex-col'
    >
      <RecipeForm
        key={recipeId}
        uid={uid}
        recipeId={recipeId}
        initialRead={null}
        initialIdea={null}
        initialNote={note}
        isDirtyRef={isDirtyRef}
        backStepRef={backStepRef}
        onTitleChange={onTitleChange}
        onLeave={onLeave}
        onSaved={onSaved}
      />
    </div>
  );
}

export default CookRecipeEdit;

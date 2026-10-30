import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChefHat, ChevronRight, X } from 'lucide-react';

import { listFormDrafts } from '@/lib/app/formDrafts';
import { useAppSelector } from '@/store';
import { parseRecipeFormDraft } from '@apps/pinch/components/recipes/recipeFormModel';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { selectRecipesById } from '@apps/pinch/store/selectors';

const RECIPE_DRAFT_PREFIX = 'pinch:recipe:';

interface RecipeDraftRowProps {
  uid: string;
}

/** Offers back a recipe whose unsaved form the system closed, on the screen the person lands on. */
function RecipeDraftRow({ uid }: RecipeDraftRowProps) {
  const { openSubview } = usePinchOverlay();
  const recipesById = useAppSelector(selectRecipesById);
  const [drafts] = useState(() => listFormDrafts(uid, RECIPE_DRAFT_PREFIX));
  const [isHidden, setIsHidden] = useState(false);

  const kept = drafts.flatMap((stored) => {
    const parsed = parseRecipeFormDraft(stored.value);
    const id = stored.key.slice(RECIPE_DRAFT_PREFIX.length);
    const recipeId = id === 'new' ? null : id;
    const isRecipeHere = recipeId === null || recipesById.has(recipeId);
    return parsed !== null && isRecipeHere
      ? [{ recipeId, title: parsed.formData.title.trim() }]
      : [];
  })[0];

  if (isHidden || kept === undefined) return null;

  const name =
    kept.title ||
    (kept.recipeId === null
      ? 'New recipe'
      : recipesById.get(kept.recipeId)?.title) ||
    'Your recipe';
  const pickUp = () =>
    openSubview(
      kept.recipeId === null
        ? { kind: 'recipe', id: null, method: 'manual' }
        : { kind: 'recipe', id: kept.recipeId },
    );

  return (
    <section
      aria-label='Pick up your unsaved recipe'
      className='bg-accent/60 border-border flex min-h-12 items-stretch rounded-2xl border'
    >
      <Button
        type='button'
        variant='tertiary'
        className='hover:bg-accent h-auto min-h-0 min-w-0 flex-1 justify-start gap-3 rounded-2xl px-3! py-1! text-left max-[359px]:gap-2 max-[359px]:px-2!'
        onClick={pickUp}
      >
        <ChefHat className='h-5 w-5 shrink-0' aria-hidden='true' />
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block truncate text-sm leading-5 font-medium'>
            Pick up your unsaved recipe?
          </span>
          <span className='text-muted-foreground block truncate text-xs leading-4 font-normal'>
            {name}
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground h-5 w-5 shrink-0'
          aria-hidden='true'
        />
      </Button>
      <Button
        type='button'
        variant='tertiary'
        size='icon'
        aria-label='Not now'
        title='Not now'
        className='text-foreground! mr-1 size-10 min-w-10 shrink-0 self-center rounded-full p-0'
        onClick={() => setIsHidden(true)}
      >
        <X className='h-5 w-5' aria-hidden='true' />
      </Button>
    </section>
  );
}

export default RecipeDraftRow;

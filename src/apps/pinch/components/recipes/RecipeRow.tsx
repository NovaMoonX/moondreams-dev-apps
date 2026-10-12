import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import CoverImage from '@apps/pinch/components/shared/CoverImage';
import type { Recipe } from '@apps/pinch/types';
import {
  formatMinutes,
  formatServings,
  getTotalMinutes,
} from '@apps/pinch/utils/recipeFormat';

interface RecipeRowProps {
  recipe: Recipe;
  onOpen: (id: string) => void;
}

function RecipeRow({ recipe, onOpen }: RecipeRowProps) {
  const total = getTotalMinutes(recipe);
  const detail = [
    formatServings(recipe.servings),
    total === null ? null : formatMinutes(total),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Button
      type='button'
      variant='tertiary'
      onClick={() => onOpen(recipe.id)}
      className='h-auto min-h-16 w-full justify-start gap-3 px-0! py-2 text-left'
    >
      <CoverImage
        coverPath={recipe.coverPath ?? null}
        version={recipe.updatedAt}
        size={56}
      />
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block truncate font-medium'>
          {recipe.title}
        </span>
        <span className='text-muted-foreground block truncate text-xs font-normal'>
          {detail}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground h-5 w-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default RecipeRow;

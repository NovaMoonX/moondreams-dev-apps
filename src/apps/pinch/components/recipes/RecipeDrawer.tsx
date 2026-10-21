import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import { useAppSelector } from '@/store';
import CoverImage from '@apps/pinch/components/shared/CoverImage';
import { UNIT_LABELS } from '@apps/pinch/constants';
import {
  selectIngredientsById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import { formatMinutes, formatServings } from '@apps/pinch/utils/recipeFormat';

interface RecipeDrawerProps {
  recipeId: string;
  onClose: () => void;
  onModify: (id: string) => void;
}

function RecipeDrawer({ recipeId, onClose, onModify }: RecipeDrawerProps) {
  const recipe = useAppSelector(selectRecipesById).get(recipeId);
  const ingredientsById = useAppSelector(selectIngredientsById);

  if (!recipe) {
    return null;
  }

  const times = [
    recipe.prepMinutes != null && `Prep ${formatMinutes(recipe.prepMinutes)}`,
    recipe.cookMinutes != null && `Cook ${formatMinutes(recipe.cookMinutes)}`,
  ].filter(Boolean);

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={recipe.title}
      footer={
        <div className='px-4 pb-4'>
          <Button
            type='button'
            className='w-full'
            onClick={() => onModify(recipe.id)}
          >
            Modify
          </Button>
        </div>
      }
    >
      <div className='space-y-5'>
        {recipe.coverPath && (
          <CoverImage
            coverPath={recipe.coverPath}
            version={recipe.updatedAt}
            className='h-40 w-full'
          />
        )}
        <p className='text-muted-foreground text-sm'>
          {[formatServings(recipe.servings), ...times].join(' · ')}
        </p>
        {recipe.description && (
          <p className='text-sm whitespace-pre-wrap'>{recipe.description}</p>
        )}

        <section aria-label='Ingredients' className='space-y-2'>
          <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            Ingredients
          </h3>
          <ul className='divide-border divide-y'>
            {recipe.ingredients.map((line) => (
              <li
                key={line.id}
                className='flex items-baseline justify-between gap-3 py-2'
              >
                <span className='min-w-0'>
                  {ingredientsById.get(line.ingredientId)?.name ??
                    'Removed ingredient'}
                </span>
                <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
                  {Math.round(line.amount * 100) / 100} {UNIT_LABELS[line.unit]}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {recipe.steps.length > 0 && (
          <section aria-label='Steps' className='space-y-2'>
            <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
              Steps
            </h3>
            <ol className='space-y-3'>
              {recipe.steps.map((step, index) => (
                <li key={index} className='flex gap-3 text-sm'>
                  <span className='bg-secondary text-secondary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold'>
                    {index + 1}
                  </span>
                  <span className='min-w-0 whitespace-pre-wrap'>{step}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </DetailSheet>
  );
}

export default RecipeDrawer;

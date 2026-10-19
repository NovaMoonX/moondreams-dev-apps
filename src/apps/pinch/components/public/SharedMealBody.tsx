import ActionGroup from '@/components/ActionGroup';
import FormSection from '@/components/FormSection';
import GroupRow from '@/components/GroupRow';
import SharedCover from '@apps/pinch/components/public/SharedCover';
import type { SharedMeal } from '@apps/pinch/types';
import {
  formatMinutes,
  formatServings,
  getTotalMinutes,
} from '@apps/pinch/utils/recipeFormat';

interface SharedMealBodyProps {
  shareId: string;
  meal: SharedMeal;
  onOpenRecipe: (index: number) => void;
}

function SharedMealBody({ shareId, meal, onOpenRecipe }: SharedMealBodyProps) {
  return (
    <FormSection title='On the plate'>
      <ActionGroup>
        {meal.items.map((item, position) => {
          if (item.kind === 'INGREDIENT') {
            return (
              <div key={position} className='py-2.5 pr-11 pl-4 text-sm'>
                <span className='block text-base wrap-break-word'>
                  {item.name}
                </span>
                <span className='text-muted-foreground block text-xs'>
                  {formatServings(item.servings)}
                </span>
              </div>
            );
          }

          const recipe = meal.recipes[item.recipeIndex];
          const minutes = getTotalMinutes(recipe);
          return (
            <GroupRow
              key={position}
              ariaLabel={`Open ${recipe.title}`}
              onClick={() => onOpenRecipe(item.recipeIndex)}
            >
              <span className='flex items-start gap-3'>
                <SharedCover
                  shareId={shareId}
                  index={item.recipeIndex}
                  hasCover={recipe.hasCover}
                  emoji='🍲'
                  className='size-12 rounded-xl'
                  emojiClassName='text-2xl'
                />
                <span className='min-w-0 flex-1'>
                  <span className='block text-base wrap-break-word'>
                    {recipe.title}
                  </span>
                  <span className='text-muted-foreground block text-xs'>
                    {[
                      formatServings(item.servings),
                      minutes === null ? null : formatMinutes(minutes),
                    ]
                      .filter((part) => part !== null)
                      .join(' · ')}
                  </span>
                </span>
              </span>
            </GroupRow>
          );
        })}
      </ActionGroup>
    </FormSection>
  );
}

export default SharedMealBody;

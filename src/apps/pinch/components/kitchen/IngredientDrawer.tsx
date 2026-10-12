import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import { useAppSelector } from '@/store';
import IngredientIcon from '@apps/pinch/components/shared/IngredientIcon';
import { UNIT_LABELS } from '@apps/pinch/constants';
import {
  selectIngredientFamiliesById,
  selectIngredientsById,
} from '@apps/pinch/store/selectors';

interface IngredientDrawerProps {
  ingredientId: string;
  onClose: () => void;
  onModify: (id: string) => void;
}

const NUTRITION_CELLS = [
  { key: 'calories', label: 'Calories', unit: '' },
  { key: 'protein', label: 'Protein', unit: ' g' },
  { key: 'carbs', label: 'Carbs', unit: ' g' },
  { key: 'fat', label: 'Fat', unit: ' g' },
] as const;

function IngredientDrawer({
  ingredientId,
  onClose,
  onModify,
}: IngredientDrawerProps) {
  const ingredient = useAppSelector(selectIngredientsById).get(ingredientId);
  const family = useAppSelector(selectIngredientFamiliesById).get(
    ingredient?.familyId ?? '',
  );

  if (!ingredient) {
    return null;
  }

  const servingText = `${Math.round(ingredient.serving.amount * 100) / 100} ${UNIT_LABELS[ingredient.serving.unit]}`;

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={ingredient.name}
      footer={
        <div className='px-4 pb-4'>
          <Button
            type='button'
            className='w-full'
            onClick={() => onModify(ingredient.id)}
          >
            {ingredient.isCustom ? 'Modify' : 'Adjust nutrition or serving'}
          </Button>
        </div>
      }
    >
      <div className='space-y-5'>
        <div className='flex items-center gap-3'>
          <IngredientIcon iconKey={ingredient.iconKey} size={48} />
          <div className='min-w-0'>
            {family && (
              <p className='text-muted-foreground text-sm'>{family.name}</p>
            )}
            {ingredient.isCustom && (
              <p className='text-muted-foreground text-sm'>One you added</p>
            )}
            {ingredient.isAdjusted && (
              <p className='text-muted-foreground text-sm'>
                Built in, with your changes
              </p>
            )}
            {ingredient.aliases.length > 0 && (
              <p className='text-muted-foreground truncate text-sm'>
                Also called {ingredient.aliases.join(', ')}
              </p>
            )}
          </div>
        </div>

        <section aria-label='Nutrition per 100 g' className='space-y-2'>
          <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            Per 100 g
          </h3>
          <dl className='grid grid-cols-4 gap-2 text-center'>
            {NUTRITION_CELLS.map((cell) => {
              const value = ingredient.per100g[cell.key];
              return (
                <div key={cell.key} className='bg-muted rounded-xl px-1 py-2'>
                  <dd className='text-foreground text-base font-semibold whitespace-nowrap'>
                    {value === null
                      ? '—'
                      : `${Math.round(value * 10) / 10}${cell.unit}`}
                  </dd>
                  <dt className='text-muted-foreground text-xs'>
                    {cell.label}
                  </dt>
                </div>
              );
            })}
          </dl>
        </section>

        <p className='text-muted-foreground text-sm'>
          One serving is {servingText}.
        </p>
      </div>
    </DetailSheet>
  );
}

export default IngredientDrawer;

import DetailSheet from '@/components/DetailSheet';
import IngredientIcon from '@apps/pinch/components/shared/IngredientIcon';
import {
  CATALOG_FAMILIES_BY_ID,
  CATALOG_INGREDIENTS_BY_ID,
} from '@apps/pinch/catalog';
import { NUTRITION_CELLS, UNIT_LABELS } from '@apps/pinch/constants';

interface IngredientDrawerProps {
  ingredientId: string;
  onClose: () => void;
}

function IngredientDrawer({ ingredientId, onClose }: IngredientDrawerProps) {
  const ingredient = CATALOG_INGREDIENTS_BY_ID.get(ingredientId);

  if (!ingredient) {
    return null;
  }

  const family = ingredient.familyId
    ? CATALOG_FAMILIES_BY_ID.get(ingredient.familyId)
    : null;
  const servingText = `${ingredient.serving.amount} ${UNIT_LABELS[ingredient.serving.unit]}`;

  return (
    <DetailSheet isOpen onClose={onClose} title={ingredient.name}>
      <div className='space-y-5'>
        <div className='flex items-center gap-3'>
          <IngredientIcon iconKey={ingredient.iconKey} size={48} />
          <div className='min-w-0'>
            {family && (
              <p className='text-muted-foreground text-sm'>{family.name}</p>
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
            {NUTRITION_CELLS.map((cell) => (
              <div
                key={cell.key}
                className='bg-muted flex flex-col-reverse rounded-xl px-1 py-2'
              >
                <dt className='text-muted-foreground text-xs'>{cell.label}</dt>
                <dd className='text-foreground text-base font-semibold whitespace-nowrap'>
                  {Math.round(ingredient.per100g[cell.key] * 10) / 10}
                  {cell.unit}
                </dd>
              </div>
            ))}
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

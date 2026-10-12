import IngredientIcon from '@apps/pinch/components/shared/IngredientIcon';
import type { ItemKind } from '@apps/pinch/types';

interface ItemIconProps {
  kind: ItemKind;
  iconKey: string | null;
  size?: number;
}

/** The pot for a recipe, the ingredient's own icon for an ingredient, in one fixed-width column. */
function ItemIcon({ kind, iconKey, size = 28 }: ItemIconProps) {
  if (kind === 'RECIPE') {
    return (
      <span
        className='flex shrink-0 items-center justify-center'
        style={{ width: size, height: size, fontSize: size * 0.8 }}
        aria-hidden='true'
      >
        🍲
      </span>
    );
  }

  return <IngredientIcon iconKey={iconKey} size={size} />;
}

export default ItemIcon;

import { memo } from 'react';

import SectionDivider from '@/components/SectionDivider';
import LazyMount from '@/components/LazyMount';
import IngredientRow from '@apps/pinch/components/kitchen/IngredientRow';
import type { FamilyGroupData } from '@apps/pinch/utils/catalogSearch';
import type { NutritionBasis } from '@apps/pinch/utils/nutritionBasis';

const ROW_HEIGHT = 57;
const ROW_HEIGHT_WITH_NUTRITION_LINE = 73;
const DIVIDER_HEIGHT = 36;

interface FamilyGroupProps {
  group: FamilyGroupData;
  isEager: boolean;
  showPrices: boolean;
  showMacros: boolean;
  basis: NutritionBasis;
  onOpen: (id: string) => void;
}

function FamilyGroup({
  group,
  isEager,
  showPrices,
  showMacros,
  basis,
  onOpen,
}: FamilyGroupProps) {
  const rowHeight =
    showPrices && showMacros ? ROW_HEIGHT_WITH_NUTRITION_LINE : ROW_HEIGHT;
  const estimatedHeight = DIVIDER_HEIGHT + group.ingredients.length * rowHeight;

  return (
    <section
      aria-label={group.family.name}
      className='defer-offscreen lg:mb-4 lg:break-inside-avoid'
      style={{ '--defer-size': `${estimatedHeight}px` } as React.CSSProperties}
    >
      <LazyMount estimatedHeight={estimatedHeight} eager={isEager}>
        <SectionDivider
          label={group.family.name}
          trailing={
            <span className='text-muted-foreground text-xs'>
              {group.ingredients.length}
            </span>
          }
        />
        <ul className='divide-border divide-y'>
          {group.ingredients.map((ingredient) => (
            <li key={ingredient.id}>
              <IngredientRow
                ingredient={ingredient}
                showPrices={showPrices}
                showMacros={showMacros}
                basis={basis}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ul>
      </LazyMount>
    </section>
  );
}

export default memo(FamilyGroup);

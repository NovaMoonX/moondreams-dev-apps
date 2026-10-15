import { memo } from 'react';

import LazyMount from '@/components/LazyMount';
import SectionDivider from '@/components/SectionDivider';
import { useAppSelector } from '@/store';
import IngredientRow from '@apps/pinch/components/kitchen/IngredientRow';
import { SECTION_COUNT_THRESHOLD } from '@apps/pinch/constants';
import {
  selectDefaultProducts,
  selectShowNutrition,
  selectUsedIngredientIds,
} from '@apps/pinch/store/selectors';
import type { NutritionSwitches, ResolvedIngredient } from '@apps/pinch/types';
import { hasShownValue } from '@apps/pinch/utils/nutritionMath';
import type { FamilyGroupData } from '@apps/pinch/utils/catalogSearch';
import type { NutritionBasis } from '@apps/pinch/utils/nutritionBasis';

const DIVIDER_HEIGHT = 20;
const ROW_HEIGHT = 45;
const LINE_HEIGHT = 16;

interface RowHeightInputs {
  ingredient: ResolvedIngredient;
  showPrices: boolean;
  showMacros: boolean;
  defaultProducts: ReadonlyMap<string, unknown>;
  usedIds: ReadonlySet<string>;
  show: NutritionSwitches;
}

const estimateRowHeight = ({
  ingredient,
  showPrices,
  showMacros,
  defaultProducts,
  usedIds,
  show,
}: RowHeightInputs) => {
  const hasPriceLine =
    showPrices &&
    (defaultProducts.has(ingredient.id) || usedIds.has(ingredient.id));
  const hasNutritionLine =
    showMacros && hasShownValue(ingredient.per100g, show);
  return (
    ROW_HEIGHT + LINE_HEIGHT * (Number(hasPriceLine) + Number(hasNutritionLine))
  );
};

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
  const defaultProducts = useAppSelector(selectDefaultProducts);
  const usedIds = useAppSelector(selectUsedIngredientIds);
  const show = useAppSelector(selectShowNutrition);
  const estimatedHeight = group.ingredients.reduce(
    (sum, ingredient) =>
      sum +
      estimateRowHeight({
        ingredient,
        showPrices,
        showMacros,
        defaultProducts,
        usedIds,
        show,
      }),
    DIVIDER_HEIGHT,
  );

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
            group.ingredients.length > SECTION_COUNT_THRESHOLD && (
              <span className='text-muted-foreground text-xs'>
                {group.ingredients.length}
              </span>
            )
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

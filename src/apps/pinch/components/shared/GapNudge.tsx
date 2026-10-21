import { useState } from 'react';

import { Plus, X } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import { useAppSelector } from '@/store';
import {
  selectDismissedNudges,
  selectIngredientsById,
  selectPlannedMeals,
  selectRecipes,
  selectRecipesById,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import { NUTRITION_CELLS } from '@apps/pinch/constants';
import type { Gap } from '@apps/pinch/types';
import {
  countLeftOutIngredients,
  getGapKey,
  withoutDismissed,
} from '@apps/pinch/utils/gaps';
import { getIngredientUses, rankGaps } from '@apps/pinch/utils/gapOrder';

// "Not now" lasts until the page reloads and only for the same gaps, so a new gap still speaks.
const quietedNotes = new Set<string>();

const joinOr = (parts: string[]) =>
  parts.length < 2
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;

interface GapNudgeProps {
  uid: string;
  /** Every gap behind the number on screen; the ones the person closed are filtered out here. */
  gaps: Gap[];
  /** Words before the line, for a place where nothing is priced yet ("See what it costs:"). */
  lead?: string;
  onFillIn: (gaps: Gap[]) => void;
}

function GapNudge({ uid, gaps, lead, onFillIn }: GapNudgeProps) {
  const dismissed = useAppSelector(selectDismissedNudges);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const recipes = useAppSelector(selectRecipes);
  const recipesById = useAppSelector(selectRecipesById);
  const plannedMeals = useAppSelector(selectPlannedMeals);
  const show = useAppSelector(selectShowNutrition);
  const [, setQuietCount] = useState(0);
  const uses = getIngredientUses(
    recipes,
    plannedMeals,
    recipesById,
    ingredientsById,
  );
  const open = rankGaps(withoutDismissed(gaps, dismissed), uses);
  const quietKey = [uid, ...open.map(getGapKey).sort()].join('|');

  if (open.length === 0 || quietedNotes.has(quietKey)) {
    return null;
  }

  const others = countLeftOutIngredients(open) - 1;
  const isOne = others === 0;
  const needsPrice = open.some((gap) => gap.kind === 'NO_PRODUCT');
  const needsSize = open.some((gap) => gap.kind === 'NOT_COMPARABLE');
  const needsNutrition = open.some((gap) => gap.kind === 'NO_NUTRITION');
  const metricsOn = NUTRITION_CELLS.filter((cell) => show[cell.key]);
  const nutritionWhat =
    metricsOn.length === 1
      ? metricsOn[0].label.toLowerCase()
      : 'nutrition values';
  const name =
    ingredientsById.get(open[0].ingredientId)?.name ?? 'An ingredient';
  const subject = isOne ? name : `${name} and ${others} more`;
  const needs = isOne ? 'needs' : 'need';

  const getWording = () => {
    if (needsNutrition && (needsPrice || needsSize)) {
      const parts = [
        needsPrice && 'a price',
        needsSize && 'a size',
        metricsOn.length === 1 ? nutritionWhat : 'nutrition',
      ].filter((part) => part !== false);
      return {
        text: `${subject} ${needs} ${joinOr(parts)}`,
        action: 'Add details',
      };
    }
    if (needsNutrition) {
      return {
        text: `${subject} ${isOne ? 'has' : 'have'} no ${nutritionWhat}`,
        action: 'Add values',
      };
    }
    if (needsPrice && needsSize) {
      return {
        text: `${subject} ${needs} a price or a size`,
        action: 'Add details',
      };
    }
    if (needsSize) {
      return {
        text: `${subject} can't be compared with ${isOne ? 'its' : 'their'} package size`,
        action: isOne ? 'Add a size' : 'Add sizes',
      };
    }
    return {
      text: `${subject} ${needs} a price`,
      action: isOne ? 'Add a price' : 'Add prices',
    };
  };
  const { text, action } = getWording();

  const handleNotNow = () => {
    quietedNotes.add(quietKey);
    setQuietCount((count) => count + 1);
  };

  return (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-sm'>
        {lead ? `${lead} ` : null}
        {text}
      </p>
      <ActionChips
        actions={[
          {
            key: 'fill-in',
            icon: <Plus className='h-4 w-4' />,
            label: action,
            onClick: () => onFillIn(open),
          },
          {
            key: 'not-now',
            icon: <X className='h-4 w-4' />,
            label: 'Not now',
            onClick: handleNotNow,
            isQuiet: true,
          },
        ]}
      />
    </div>
  );
}

export default GapNudge;

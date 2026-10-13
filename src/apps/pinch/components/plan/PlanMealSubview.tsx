import MealBuilder from '@apps/pinch/components/plan/MealBuilder';
import type { MealType } from '@apps/pinch/types';

interface PlanMealSubviewProps {
  uid: string;
  dayKey: string;
  mealType: MealType | null;
  plannedMealId: string | null;
  fromMealId: string | null;
  fromRecipeId: string | null;
}

/** The meal builder as a full-screen layer over the calendar, so its footer stays pinned however long the plate gets. */
function PlanMealSubview({
  uid,
  dayKey,
  mealType,
  plannedMealId,
  fromMealId,
  fromRecipeId,
}: PlanMealSubviewProps) {
  return (
    <MealBuilder
      uid={uid}
      mode='plan'
      dayKey={dayKey}
      mealType={mealType}
      plannedMealId={plannedMealId}
      mealId={fromMealId}
      recipeId={fromRecipeId}
    />
  );
}

export default PlanMealSubview;

import Subview from '@/components/Subview';
import MealBuilder from '@apps/pinch/components/plan/MealBuilder';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import type { MealType } from '@apps/pinch/types';

interface PlanMealSubviewProps {
  uid: string;
  dayKey: string;
  mealType: MealType | null;
  plannedMealId: string | null;
}

/** The meal builder as a full-screen layer over the calendar, so its footer stays pinned however long the plate gets. */
function PlanMealSubview({
  uid,
  dayKey,
  mealType,
  plannedMealId,
}: PlanMealSubviewProps) {
  const { closeSubview } = usePinchOverlay();

  return (
    <Subview overlay title='Meal' onClose={closeSubview}>
      <MealBuilder
        uid={uid}
        dayKey={dayKey}
        mealType={mealType}
        plannedMealId={plannedMealId}
      />
    </Subview>
  );
}

export default PlanMealSubview;

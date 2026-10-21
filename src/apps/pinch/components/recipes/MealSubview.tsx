import Subview from '@/components/Subview';
import MealBuilder from '@apps/pinch/components/plan/MealBuilder';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { getLocalMonthKey } from '@apps/pinch/utils/dayKeys';

interface MealSubviewProps {
  uid: string;
  mealId: string | null;
}

/** A saved meal's own screen: the same builder with a name and no day. */
function MealSubview({ uid, mealId }: MealSubviewProps) {
  const { closeSubview } = usePinchOverlay();

  return (
    <Subview overlay title='Meal' onClose={closeSubview}>
      <MealBuilder
        key={mealId ?? 'new'}
        uid={uid}
        mode='meal'
        dayKey={`${getLocalMonthKey()}-01`}
        mealType={null}
        plannedMealId={null}
        mealId={mealId}
      />
    </Subview>
  );
}

export default MealSubview;

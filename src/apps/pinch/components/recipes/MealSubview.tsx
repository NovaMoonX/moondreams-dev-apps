import MealBuilder from '@apps/pinch/components/plan/MealBuilder';
import { getLocalMonthKey } from '@apps/pinch/utils/dayKeys';

interface MealSubviewProps {
  uid: string;
  mealId: string | null;
}

/** A saved meal's own screen: the same builder with a name and no day. */
function MealSubview({ uid, mealId }: MealSubviewProps) {
  return (
    <MealBuilder
      key={mealId ?? 'new'}
      uid={uid}
      mode='meal'
      dayKey={`${getLocalMonthKey()}-01`}
      mealType={null}
      plannedMealId={null}
      mealId={mealId}
    />
  );
}

export default MealSubview;

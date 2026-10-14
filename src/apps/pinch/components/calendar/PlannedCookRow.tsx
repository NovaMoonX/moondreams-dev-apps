import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChefHat } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { useCookActions } from '@apps/pinch/hooks/useCookActions';
import {
  selectCooksByRecipe,
  selectCooksById,
} from '@apps/pinch/store/selectors';
import type { MarkableRecipe } from '@apps/pinch/utils/cooks';
import {
  getCookId,
  getPlannedCookedAt,
  isCookHistoryFull,
} from '@apps/pinch/utils/cooks';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

interface PlannedCookRowProps {
  uid: string;
  plannedMealId: string;
  plannedDate: number;
  markable: MarkableRecipe;
}

/** One recipe of a planned meal: "Mark as cooked" until it has a cook, then "Cooked ✓" with an Undo that deletes that cook. */
function PlannedCookRow({
  uid,
  plannedMealId,
  plannedDate,
  markable: { recipe, servings },
}: PlannedCookRowProps) {
  const cookId = getCookId(plannedMealId, recipe.id);
  const cook = useAppSelector(selectCooksById).get(cookId);
  const isHistoryFull = useAppSelector((state) =>
    isCookHistoryFull(selectCooksByRecipe(state).get(recipe.id)?.length ?? 0),
  );
  const { isReady, markPlannedRecipeCooked, undoCook } = useCookActions(uid);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>, fallback: string) => {
    setError(null);
    setIsWorking(true);
    try {
      await action();
    } catch (actionError) {
      setError(getErrorMessage(actionError, fallback));
    } finally {
      setIsWorking(false);
    }
  };

  const handleMark = () =>
    run(async () => {
      const cookedAt = getPlannedCookedAt(plannedDate);
      if (cookedAt === null) return;
      await markPlannedRecipeCooked({
        plannedMealId,
        recipe,
        servings,
        cookedAt,
      });
    }, 'Unable to mark this as cooked.');

  const getSubtitle = () => {
    if (!isReady) return `${recipe.title} · Loading your history…`;
    if (isHistoryFull) {
      return `${recipe.title} · History is full. Delete an older cook first.`;
    }
    return `${recipe.title} · ${formatServings(servings)}`;
  };

  return (
    <div className='space-y-1.5'>
      {cook ? (
        <div className='bg-muted/50 border-border flex min-h-12 items-center gap-3 rounded-2xl border py-1 pr-2 pl-4'>
          <span className='w-5 shrink-0' aria-hidden='true'>
            <ChefHat className='h-4 w-4' />
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block'>Cooked ✓</span>
            <span className='text-muted-foreground block text-xs wrap-break-word'>
              {recipe.title} · {formatServings(cook.servings)}
            </span>
          </span>
          <Button
            type='button'
            variant='tertiary'
            className='h-10 shrink-0 px-3 underline'
            disabled={isWorking}
            onClick={() =>
              void run(() => undoCook(cookId), 'Unable to undo this.')
            }
          >
            Undo
          </Button>
        </div>
      ) : (
        <ActionRow
          icon={<ChefHat className='h-4 w-4' />}
          label='Mark as cooked'
          subtitle={getSubtitle()}
          isDisabled={!isReady || isWorking || isHistoryFull}
          onClick={() => void handleMark()}
        />
      )}
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
}

export default PlannedCookRow;

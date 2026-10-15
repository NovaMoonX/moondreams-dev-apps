import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { ChefHat } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateTime } from '@/utils/formatUtils';
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
  const { confirm } = useActionModal();
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

  const handleNotCooked = async (cookedAt: number) => {
    const isConfirmed = await confirm({
      title: 'Not cooked after all?',
      message: `The cook from ${formatDateTime(cookedAt)} comes off ${recipe.title}'s history. You can't undo this.`,
      confirmText: 'Remove the cook',
      destructive: true,
    });
    if (!isConfirmed) return;

    await run(() => undoCook(cookId), 'Unable to remove this cook.');
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

  return (
    <div className='mt-2 space-y-1.5'>
      {cook ? (
        <p className='flex flex-wrap items-center gap-x-3 text-sm'>
          <span>
            <span aria-hidden='true'>✅</span> Cooked
            {cook.servings !== servings &&
              ` · ${formatServings(cook.servings)}`}
          </span>
          <Button
            type='button'
            variant='tertiary'
            aria-label={`Mark ${recipe.title} as not cooked`}
            className="relative h-auto p-0 underline underline-offset-4 after:absolute after:-inset-x-2 after:-inset-y-2.5 after:content-['']"
            disabled={isWorking}
            onClick={() => void handleNotCooked(cook.cookedAt)}
          >
            Not cooked
          </Button>
        </p>
      ) : (
        <ActionChips
          actions={[
            {
              key: 'mark',
              icon: <ChefHat className='h-4 w-4' />,
              label: 'Mark as cooked',
              description: `Mark ${recipe.title} as cooked, ${formatServings(servings)}`,
              isDisabled: !isReady || isWorking || isHistoryFull,
              onClick: () => void handleMark(),
            },
          ]}
        />
      )}
      {!cook && isReady && isHistoryFull && (
        <p className='text-muted-foreground text-xs'>
          This recipe's history is full. Delete an older cook first.
        </p>
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

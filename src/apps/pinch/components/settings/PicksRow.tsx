import { X } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import SummaryEditor from '@/components/SummaryEditor';
import type { SummaryGroupPosition } from '@/components/summaryGroup';
import { useAppSelector } from '@/store';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';
import { selectIngredientsById } from '@apps/pinch/store/selectors';

interface PicksRowProps {
  uid: string;
  position: SummaryGroupPosition;
}

/** The ingredients the person picked for names a reading couldn't place, newest first, each with a way to forget it. Drawn only once one exists. */
function PicksRow({ uid, position }: PicksRowProps) {
  const { settings, save } = usePinchSettings(uid);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const picks = Object.entries(settings.ingredientPicks)
    .flatMap(([key, pick]) => {
      const ingredient = ingredientsById.get(pick.ingredientId);
      return ingredient && !ingredient.isArchived
        ? [{ key, pick, ingredientName: ingredient.name }]
        : [];
    })
    .sort((a, b) => b.pick.pickedAt - a.pick.pickedAt);
  const [first] = picks;
  if (!first) return null;

  return (
    <li className='-mx-3'>
      <SummaryEditor
        label='Your usual picks'
        title='Your usual picks'
        groupPosition={position}
        icon='📌'
        summary={`${first.pick.name} is ${first.ingredientName}${
          picks.length > 1 ? `, and ${picks.length - 1} more` : ''
        }`}
        lines={2}
        placeholder=''
        shouldFocus={false}
      >
        <p className='text-muted-foreground text-sm text-pretty'>
          When a recipe says one of these, we use your pick.
        </p>
        <ul className='space-y-1'>
          {picks.map(({ key, pick, ingredientName }) => (
            <li key={key} className='flex min-h-10 items-center gap-2'>
              <span className='min-w-0 flex-1 text-pretty'>
                {pick.name} → {ingredientName}
              </span>
              <Button
                type='button'
                variant='tertiary'
                size='icon'
                aria-label={`Forget ${pick.name}`}
                className="relative size-8 shrink-0 before:absolute before:-inset-1 before:content-['']"
                onClick={() => void save({ ingredientPicks: { [key]: null } })}
              >
                <X className='h-4 w-4' aria-hidden='true' />
              </Button>
            </li>
          ))}
        </ul>
      </SummaryEditor>
    </li>
  );
}

export default PicksRow;

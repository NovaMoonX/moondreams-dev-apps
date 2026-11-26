import { useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import SearchInput from '@/components/SearchInput';
import SummaryEditor from '@/components/SummaryEditor';
import UndoSnackbar from '@/components/UndoSnackbar';
import type { SummaryGroupPosition } from '@/components/summaryGroup';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { useAppSelector } from '@/store';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';
import { selectIngredientsById } from '@apps/pinch/store/selectors';

const SEARCH_FROM_PICKS = 8;

interface PicksRowProps {
  uid: string;
  position: SummaryGroupPosition;
}

/** The ingredients the person picked for names a reading couldn't place, newest first, each with a way to forget it. Drawn only once one exists. */
function PicksRow({ uid, position }: PicksRowProps) {
  const { settings, save } = usePinchSettings(uid);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [query, setQuery] = useState('');
  const { pending, showUndo, undo } = useUndoRemoval();
  const picks = Object.entries(settings.ingredientPicks)
    .map(([key, pick]) => {
      const ingredient = ingredientsById.get(pick.ingredientId);
      return {
        key,
        pick,
        target: ingredient?.name ?? null,
        unusedReason: !ingredient
          ? 'Not used: you removed that ingredient'
          : ingredient.isArchived
            ? `Not used while ${ingredient.name} is archived`
            : null,
      };
    })
    .sort(
      (a, b) =>
        Number(a.unusedReason !== null) - Number(b.unusedReason !== null) ||
        b.pick.pickedAt - a.pick.pickedAt,
    );
  const [first] = picks;
  if (!first) return null;
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? picks.filter(({ pick, target }) =>
        `${pick.name} ${target ?? ''}`.toLowerCase().includes(needle),
      )
    : picks;
  const forget = (key: string, pick: (typeof picks)[number]['pick']) => {
    void save({ ingredientPicks: { [key]: null } });
    showUndo(`Forgot ${pick.name}`, () => {
      void save({ ingredientPicks: { [key]: pick } });
    });
  };

  return (
    <li className='-mx-3'>
      <SummaryEditor
        label='Your usual picks'
        title='Your usual picks'
        groupPosition={position}
        icon='📌'
        summary={`${first.pick.name} → ${first.target ?? 'not used'}${
          picks.length > 1 ? `, and ${picks.length - 1} more` : ''
        }`}
        lines={2}
        placeholder=''
        shouldFocus={false}
      >
        <p className='text-muted-foreground text-sm text-pretty'>
          When a recipe says one of these, we use your pick.
        </p>
        {picks.length >= SEARCH_FROM_PICKS && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder='Search your picks'
          />
        )}
        {shown.length === 0 && (
          <p className='text-muted-foreground text-sm'>No picks match.</p>
        )}
        <ul className='space-y-1'>
          {shown.map(({ key, pick, target, unusedReason }) => (
            <li key={key} className='flex min-h-10 items-center gap-2'>
              <span className='min-w-0 flex-1 text-pretty'>
                {unusedReason === null ? (
                  `${pick.name} → ${target}`
                ) : (
                  <span className='text-muted-foreground'>
                    {pick.name}
                    <span className='block text-xs'>{unusedReason}</span>
                  </span>
                )}
              </span>
              <Button
                type='button'
                variant='tertiary'
                size='icon'
                aria-label={`Forget ${pick.name}`}
                className="relative size-8 shrink-0 before:absolute before:-inset-1 before:content-['']"
                onClick={() => forget(key, pick)}
              >
                <X className='h-4 w-4' aria-hidden='true' />
              </Button>
            </li>
          ))}
        </ul>
      </SummaryEditor>
      <UndoSnackbar pending={pending} onUndo={undo} isOverSheet />
    </li>
  );
}

export default PicksRow;

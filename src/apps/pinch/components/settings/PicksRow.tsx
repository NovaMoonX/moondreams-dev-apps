import { useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import SearchInput from '@/components/SearchInput';
import SummaryEditor from '@/components/SummaryEditor';
import type { SummaryGroupPosition } from '@/components/summaryGroup';
import { useAppSelector } from '@/store';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';
import { selectIngredientsById } from '@apps/pinch/store/selectors';
import type { IngredientPick } from '@apps/pinch/types';

const SEARCH_FROM_PICKS = 8;

interface PicksRowProps {
  uid: string;
  position: SummaryGroupPosition;
  /** Picks forgotten while Settings is open, kept by the screen so their Undo outlives the last pick. */
  forgotten: Record<string, IngredientPick>;
  onForgottenChange: (forgotten: Record<string, IngredientPick>) => void;
}

/** The ingredients the person picked for names a reading couldn't place, newest first, each with a way to forget it and take that back. */
function PicksRow({
  uid,
  position,
  forgotten,
  onForgottenChange,
}: PicksRowProps) {
  const { settings, save } = usePinchSettings(uid);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [query, setQuery] = useState('');
  const stored = settings.ingredientPicks;
  const picks = [
    ...Object.entries(stored).map(([key, pick]) => ({
      key,
      pick,
      isForgotten: false,
    })),
    ...Object.entries(forgotten)
      .filter(([key]) => !(key in stored))
      .map(([key, pick]) => ({ key, pick, isForgotten: true })),
  ]
    .map((entry) => {
      const ingredient = ingredientsById.get(entry.pick.ingredientId);
      return {
        ...entry,
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
  const inUse = picks.filter((entry) => !entry.isForgotten);
  if (picks.length === 0) return null;
  const isSearchShown = picks.length >= SEARCH_FROM_PICKS;
  const needle = isSearchShown ? query.trim().toLowerCase() : '';
  const shown = needle
    ? picks.filter(({ pick, target }) =>
        `${pick.name} ${target ?? ''}`.toLowerCase().includes(needle),
      )
    : picks;
  const [first] = inUse;

  const forget = (key: string, pick: IngredientPick) => {
    onForgottenChange({ ...forgotten, [key]: pick });
    void save({ ingredientPicks: { [key]: null } });
  };
  const restore = (key: string, pick: IngredientPick) => {
    onForgottenChange(
      Object.fromEntries(
        Object.entries(forgotten).filter(
          ([forgottenKey]) => forgottenKey !== key,
        ),
      ),
    );
    void save({ ingredientPicks: { [key]: pick } });
  };

  return (
    <li className='-mx-3'>
      <SummaryEditor
        label='Your usual picks'
        title='Your usual picks'
        groupPosition={position}
        icon='📌'
        summary={
          first
            ? `${first.pick.name} → ${first.target ?? 'not used'}${
                inUse.length > 1 ? `, and ${inUse.length - 1} more` : ''
              }`
            : 'None kept'
        }
        lines={2}
        placeholder=''
        shouldFocus={false}
      >
        <p className='text-muted-foreground text-sm text-pretty'>
          When a recipe says one of these, we use your pick.
        </p>
        {isSearchShown && (
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
          {shown.map(({ key, pick, target, unusedReason, isForgotten }) => (
            <li key={key} className='flex min-h-10 items-center gap-2'>
              <span className='min-w-0 flex-1 text-pretty'>
                {isForgotten ? (
                  <span className='text-muted-foreground'>
                    Forgot {pick.name}
                  </span>
                ) : unusedReason === null ? (
                  `${pick.name} → ${target}`
                ) : (
                  <span className='text-muted-foreground'>
                    {pick.name}
                    <span className='block text-xs'>{unusedReason}</span>
                  </span>
                )}
              </span>
              {isForgotten ? (
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  className="relative shrink-0 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
                  onClick={() => restore(key, pick)}
                >
                  Undo
                </Button>
              ) : (
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
              )}
            </li>
          ))}
        </ul>
      </SummaryEditor>
    </li>
  );
}

export default PicksRow;

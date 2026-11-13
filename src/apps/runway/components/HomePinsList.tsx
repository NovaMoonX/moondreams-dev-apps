import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, PinOff } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import ItemBadge from '@apps/runway/components/ItemBadge';
import { HOME_PIN_WORDS } from '@apps/runway/constants';
import { useHomePins } from '@apps/runway/hooks/useHomePins';
import {
  selectEnvelopes,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { DateOnly } from '@apps/runway/types';

interface HomePinsListProps {
  today: DateOnly;
}

/** The envelopes pinned to Home in their order, each with Move up, Move down and Unpin. */
function HomePinsList({ today }: HomePinsListProps) {
  const { pins, setPin, move } = useHomePins(today);
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const looks = useAppSelector(selectItemLooks);
  const byId = new Map(envelopes.map((entry) => [entry.item.id, entry]));
  const rows = pins.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });

  const control = (
    label: string,
    icon: ReactNode,
    onClick: (() => void) | null,
  ) => (
    <Button
      type='button'
      variant='tertiary'
      size='stripped'
      className="text-muted-foreground! relative grid size-8 shrink-0 place-items-center before:absolute before:-inset-1 before:content-['']"
      aria-label={label}
      disabled={onClick === null}
      onClick={onClick ?? undefined}
    >
      {icon}
    </Button>
  );

  return (
    <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
      {rows.map(({ item, version }, index) => {
        const { name } = version.payload;
        const emoji = looks.get(item.id)?.emoji ?? null;
        return (
          <li key={item.id} className='flex min-h-14 items-center gap-3 px-3'>
            <ItemBadge name={name} emoji={emoji} />
            <span className='line-clamp-2 min-w-0 flex-1 font-medium break-words'>
              {name}
            </span>
            <span className='flex shrink-0 items-center gap-0.5'>
              {control(
                HOME_PIN_WORDS.moveUp(name),
                <ArrowUp className='h-4 w-4' aria-hidden='true' />,
                index === 0 ? null : () => void move(item.id, -1),
              )}
              {control(
                HOME_PIN_WORDS.moveDown(name),
                <ArrowDown className='h-4 w-4' aria-hidden='true' />,
                index === rows.length - 1 ? null : () => void move(item.id, 1),
              )}
              {control(
                HOME_PIN_WORDS.unpinOne(name),
                <PinOff className='h-4 w-4' aria-hidden='true' />,
                () => void setPin(item.id, name, false),
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default HomePinsList;

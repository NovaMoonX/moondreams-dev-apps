import { Avatar } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { getInitials } from '@/utils/accountUtils';

import type { Cat } from '../types';

interface CatAvatarItemProps {
  cat: Cat;
  selected?: boolean;
  onClick?: (cat: Cat) => void;
}

function CatAvatarItem({ cat, selected = false, onClick }: CatAvatarItemProps) {
  return (
    <button
      type='button'
      onClick={() => onClick?.(cat)}
      className={join(
        'flex flex-col items-center gap-2 rounded-lg p-2 text-center transition hover:bg-muted/40',
        selected && 'bg-muted/60 ring-2 ring-primary',
      )}
    >
      <Avatar
        src={cat.photoURL ?? undefined}
        alt={cat.name}
        initials={cat.photoURL ? undefined : getInitials(cat.name)}
        size='2xl'
        shape='circle'
      />
      <div>
        <p className='font-medium leading-tight'>{cat.name}</p>
        <p className='text-sm text-muted-foreground leading-tight'>{cat.breed}</p>
      </div>
    </button>
  );
}

export default CatAvatarItem;

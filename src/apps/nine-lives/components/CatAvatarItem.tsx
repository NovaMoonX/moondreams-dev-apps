import { Avatar } from '@moondreamsdev/dreamer-ui/components';

import { getInitials } from '@/utils/accountUtils';

import type { Cat } from '../types';

interface CatAvatarItemProps {
  cat: Cat;
  onClick?: (cat: Cat) => void;
}

function CatAvatarItem({ cat, onClick }: CatAvatarItemProps) {
  return (
    <button
      type='button'
      onClick={() => onClick?.(cat)}
      className='flex flex-col items-center gap-2 rounded-lg p-2 text-center transition hover:bg-muted/40'
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

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
      className='flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition hover:bg-muted/40'
    >
      <Avatar
        src={cat.photoURL ?? undefined}
        alt={cat.name}
        initials={cat.photoURL ? undefined : getInitials(cat.name)}
        size='lg'
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

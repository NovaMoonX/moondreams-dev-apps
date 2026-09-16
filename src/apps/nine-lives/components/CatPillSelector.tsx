import { Avatar } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { getInitials } from '@/utils/accountUtils';

interface CatOption {
  label: string;
  value: string;
  photoURL?: string | null;
}

interface CatPillSelectorProps {
  catOptions: CatOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  disabled?: boolean;
}

/**
 * Replaces the long checkbox-list cat picker with a wrapping row of small
 * avatar + name pills that toggle selection on click.
 */
function CatPillSelector({ catOptions, value, onValueChange, disabled }: CatPillSelectorProps) {
  const toggleCat = (catId: string) => {
    onValueChange(
      value.includes(catId) ? value.filter((id) => id !== catId) : [...value, catId],
    );
  };

  return (
    <div role='group' aria-label='Cats' className='flex flex-wrap justify-center gap-2'>
      {catOptions.map((cat) => {
        const isSelected = value.includes(cat.value);

        return (
          <button
            key={cat.value}
            type='button'
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => toggleCat(cat.value)}
            className={join(
              'flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors',
              isSelected
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-muted/40',
            )}
          >
            <Avatar src={cat.photoURL ?? undefined} initials={getInitials(cat.label)} size='sm' />
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}

export default CatPillSelector;

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
  /** When true, selecting a pill replaces the selection instead of toggling it in/out (for "view by one cat" filters). */
  singleSelect?: boolean;
  /** Smaller pills/avatars, for compact inline filters (e.g. under a stat card). */
  size?: 'md' | 'sm';
}

/**
 * Replaces the long checkbox-list cat picker with a wrapping row of small
 * avatar + name pills that toggle selection on click.
 */
function CatPillSelector({ catOptions, value, onValueChange, disabled, singleSelect, size = 'md' }: CatPillSelectorProps) {
  const isCompact = size === 'sm';

  const toggleCat = (catId: string) => {
    if (singleSelect) {
      onValueChange(value.includes(catId) ? [] : [catId]);
      return;
    }

    onValueChange(
      value.includes(catId) ? value.filter((id) => id !== catId) : [...value, catId],
    );
  };

  const pillClassName = (isSelected: boolean) =>
    join(
      'flex items-center rounded-full border transition-colors',
      isCompact ? 'gap-1 py-0.5 pr-2 pl-0.5 text-xs' : 'gap-1.5 py-1 pr-3 pl-1 text-sm',
      isSelected ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40',
    );

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
            className={pillClassName(isSelected)}
          >
            <Avatar src={cat.photoURL ?? undefined} initials={getInitials(cat.label)} size={isCompact ? 'xs' : 'sm'} />
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}

export default CatPillSelector;

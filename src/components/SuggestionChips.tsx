import { Button } from '@moondreamsdev/dreamer-ui/components';
import { X } from 'lucide-react';

interface SuggestionChipsProps {
  label: string;
  suggestions: readonly string[];
  onPick: (suggestion: string) => void;
  /** Once one is picked it is the only one shown, with a way to take it back. */
  picked?: string | null;
  onClear?: () => void;
}

/** Starting points for a field beneath it: dashed, hug their text and wrap, so they never read as answers. */
function SuggestionChips({ label, suggestions, onPick, picked = null, onClear }: SuggestionChipsProps) {
  return (
    <div role='group' aria-label={label} className='space-y-1.5'>
      <p className='text-muted-foreground text-xs font-medium'>{label}</p>
      <div className='flex flex-wrap gap-2'>
        {(picked ? [picked] : suggestions).map((suggestion) => (
          <Button
            key={suggestion}
            type='button'
            variant='tertiary'
            size='sm'
            className="border-border text-foreground! relative h-auto w-auto max-w-full rounded-full border border-dashed px-3 py-1 text-xs font-medium whitespace-normal after:absolute after:-inset-y-2 after:inset-x-0 after:content-['']"
            onClick={() => (picked ? onClear?.() : onPick(suggestion))}
            aria-label={picked ? `${suggestion}, tap to clear` : undefined}
          >
            {suggestion}
            {picked && <X className='h-3 w-3' aria-hidden='true' />}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default SuggestionChips;

import { Button } from '@moondreamsdev/dreamer-ui/components';

interface SuggestionChipsProps {
  label: string;
  suggestions: readonly string[];
  onPick: (suggestion: string) => void;
}

/** Starting points for a field beneath it: dashed, hug their text and wrap, so they never read as answers. */
function SuggestionChips({ label, suggestions, onPick }: SuggestionChipsProps) {
  return (
    <div role='group' aria-label={label} className='space-y-1.5'>
      <p className='text-muted-foreground text-xs font-medium'>{label}</p>
      <div className='flex flex-wrap gap-2'>
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion}
            type='button'
            variant='tertiary'
            size='sm'
            className="border-border text-foreground! relative h-auto w-auto max-w-full rounded-full border border-dashed px-3 py-1 text-xs font-medium whitespace-normal after:absolute after:-inset-y-2 after:inset-x-0 after:content-['']"
            onClick={() => onPick(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default SuggestionChips;

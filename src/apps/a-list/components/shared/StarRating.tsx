import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Star } from 'lucide-react';

const STARS = [1, 2, 3, 4, 5];

interface StarRatingProps {
  value: number | null;
  /** Omit for a read-only display. Tapping the current rating clears it. */
  onChange?: (value: number | null) => void;
  size?: 'sm' | 'lg';
}

function StarRating({ value, onChange, size = 'sm' }: StarRatingProps) {
  const iconClassName = size === 'lg' ? 'h-7 w-7' : 'h-3.5 w-3.5';

  if (!onChange) {
    return (
      <span
        className='inline-flex items-center gap-0.5'
        aria-label={`${value ?? 0} of 5 stars`}
        role='img'
      >
        {STARS.map((star) => (
          <Star
            key={star}
            className={join(
              iconClassName,
              star <= (value ?? 0)
                ? 'fill-current text-amber-500'
                : 'text-muted-foreground/40',
            )}
          />
        ))}
      </span>
    );
  }

  return (
    <div
      className='flex items-center gap-1'
      role='group'
      aria-label='Your rating'
    >
      {STARS.map((star) => (
        <Button
          key={star}
          type='button'
          variant='tertiary'
          size='icon'
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          aria-pressed={value === star}
          onClick={() => onChange(value === star ? null : star)}
        >
          <Star
            className={join(
              iconClassName,
              star <= (value ?? 0)
                ? 'fill-current text-amber-500'
                : 'text-muted-foreground',
            )}
          />
        </Button>
      ))}
    </div>
  );
}

export default StarRating;

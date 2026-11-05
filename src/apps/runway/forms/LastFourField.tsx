import { Input } from '@moondreamsdev/dreamer-ui/components';

import RevealChip from '@/components/RevealChip';

interface LastFourFieldProps {
  label: string;
  hint: string;
  skipLabel: string;
  value: string;
  onChange: (value: string) => void;
  onSkip: () => void;
}

/** Four digits on a numeric keyboard, or a Skip chip when the person would rather not say. */
function LastFourField({
  label,
  hint,
  skipLabel,
  value,
  onChange,
  onSkip,
}: LastFourFieldProps) {
  return (
    <div className='space-y-3'>
      <Input
        variant='outline'
        inputMode='numeric'
        autoComplete='off'
        aria-label={label}
        placeholder='1234'
        maxLength={4}
        value={value}
        onChange={(event) =>
          onChange(event.target.value.replace(/\D/g, '').slice(0, 4))
        }
      />
      <p className='text-muted-foreground text-xs'>{hint}</p>
      <div>
        <RevealChip onClick={onSkip}>{skipLabel}</RevealChip>
      </div>
    </div>
  );
}

export default LastFourField;

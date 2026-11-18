import { Input } from '@moondreamsdev/dreamer-ui/components';

interface EmojiFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** The accessible name, since the field draws no label. */
  ariaLabel: string;
  placeholder?: string;
  maxLength?: number;
}

/** A single emoji box, square and exactly as tall as a text field beside it, with the glyph centred, so a flag or a joined family emoji fits as well as a plain one. */
function EmojiField({
  value,
  onChange,
  ariaLabel,
  placeholder = '🙂',
  maxLength,
}: EmojiFieldProps) {
  return (
    <div className='flex-none'>
      {/* The library joins classes without merging, so its own w-full would win without the ! */}
      <Input
        variant='outline'
        aria-label={ariaLabel}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete='off'
        value={value}
        className='h-(--emoji-field-size)! w-(--emoji-field-size)! min-w-0 overflow-hidden px-0! py-0! text-center text-xl leading-none placeholder:opacity-40'
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export default EmojiField;

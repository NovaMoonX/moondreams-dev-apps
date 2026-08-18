import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';

interface ItemFormProps {
  disabled?: boolean;
  placeholder?: string;
  onSubmit?: (content: string) => void | Promise<void>;
}

function ItemForm({
  disabled = false,
  placeholder = 'Write a note...',
  onSubmit,
}: ItemFormProps) {
  const [value, setValue] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!onSubmit) {
      return;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue || disabled) {
      return;
    }

    await onSubmit(trimmedValue);
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className='space-y-3'>
      <label className='block'>
        <span className='sr-only'>Write a note</span>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          rows={4}
          maxLength={500}
          className='border-border bg-background text-foreground placeholder:text-muted-foreground w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none ring-0 transition focus:border-ring'
        />
      </label>

      <div className='flex items-center justify-between gap-3'>
        <span className='text-muted-foreground text-xs'>
          {value.trim().length}/500
        </span>
        <Button
          type='submit'
          size='sm'
          disabled={disabled || value.trim().length === 0}
        >
          Add note
        </Button>
      </div>
    </form>
  );
}

export default ItemForm;

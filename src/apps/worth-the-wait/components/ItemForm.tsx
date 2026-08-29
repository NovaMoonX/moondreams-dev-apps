import { Button, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';

interface ItemFormProps {
  disabled?: boolean;
  placeholder?: string;
  onSubmit?: (content: string) => Promise<void>;
}

function ItemForm({
  disabled = false,
  placeholder = 'Write an item...',
  onSubmit,
}: ItemFormProps) {
  const [value, setValue] = useState('');
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (
    event:
      | React.SyntheticEvent<HTMLFormElement>
      | React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    event.preventDefault();

    if (!onSubmit) {
      return;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue || disabled) {
      return;
    }

    setIsSubmitting(true);
    onSubmit(trimmedValue)
      .then(() => {
        setSubmissionError(null);
        setValue('');
      })
      .catch((error) => {
        setSubmissionError(
          error instanceof Error ? error.message : 'Failed to submit item.',
        );
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  return (
    <form onSubmit={handleSubmit} className='space-y-3'>
      <div>
        <label className='block'>
          <span className='sr-only'>Write an item</span>
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={disabled || isSubmitting}
            placeholder={placeholder}
            rows={4}
            maxLength={500}
            className='border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-ring w-full resize-none rounded-xl border px-3 py-2 text-sm ring-0 transition outline-none'
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSubmit(event);
              }
            }}
          />
        </label>
        <div className='flex items-center justify-between gap-3 px-1'>
          <span className='text-muted-foreground text-xs'>
            {value.trim().length}/500
          </span>
          {submissionError && (
            <span className='text-destructive text-xs'>{submissionError}</span>
          )}
        </div>
      </div>

      <div className='flex items-center justify-end'>
        <Button
          loading={isSubmitting}
          type='submit'
          size='sm'
          disabled={disabled || value.trim().length === 0}
        >
          Add item
        </Button>
      </div>
    </form>
  );
}

export default ItemForm;

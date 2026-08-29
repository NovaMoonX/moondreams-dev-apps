import { Button, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';
import { getBoxItemCardElementId } from '../utils/itemHelpers';

interface ItemFormProps {
  textareaRef: React.Ref<HTMLTextAreaElement>;
  disabled?: boolean;
  placeholder?: string;
  value?: string;
  editingItemId?: string | null;
  onChange?: (value: string) => void;
  onSubmit?: (content: string) => Promise<void>;
  onCancelEdit?: () => void;
}

function ItemForm({
  textareaRef,
  disabled = false,
  placeholder = 'Write an item...',
  value,
  editingItemId,
  onChange,
  onSubmit,
  onCancelEdit,
}: ItemFormProps) {
  const [internalValue, setInternalValue] = useState(value ?? '');
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = Boolean(editingItemId);

  if (value !== undefined && value !== internalValue) {
    setInternalValue(value);
  }

  const currentValue = value ?? internalValue;

  const handleFocusEditingItem = () => {
    if (!editingItemId) {
      return;
    }

    const editingItemCardId = getBoxItemCardElementId(editingItemId);
    const editingItemCard = document.getElementById(editingItemCardId);
    if (editingItemCard) {
      editingItemCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleChange = (nextValue: string) => {
    if (value === undefined) {
      setInternalValue(nextValue);
    }

    onChange?.(nextValue);
  };

  const handleSubmit = async (
    event:
      | React.SyntheticEvent<HTMLFormElement>
      | React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    event.preventDefault();

    if (!onSubmit) {
      return;
    }

    const trimmedValue = currentValue.trim();
    if (!trimmedValue || disabled) {
      return;
    }

    setIsSubmitting(true);
    onSubmit(trimmedValue)
      .then(() => {
        setSubmissionError(null);
        if (value === undefined) {
          setInternalValue('');
        }
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
        {isEditing && (
          <Button
            variant='link'
            className='text-sm mb-4 opacity-70'
            onClick={handleFocusEditingItem}
          >
            Editing "{placeholder.slice(0, 28)}..."
          </Button>
        )}
        <label className='block'>
          <span className='sr-only'>Write an item</span>
          <Textarea
            ref={textareaRef}
            value={currentValue}
            onChange={(event) => handleChange(event.target.value)}
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
            {currentValue.trim().length}/500
          </span>
          {submissionError && (
            <span className='text-destructive text-xs'>{submissionError}</span>
          )}
        </div>
      </div>

      <div className='flex items-center justify-end gap-2'>
        {onCancelEdit && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={onCancelEdit}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
        <Button
          loading={isSubmitting}
          type='submit'
          size='sm'
          disabled={disabled || currentValue.trim().length === 0}
        >
          {isEditing ? 'Update item' : 'Add item'}
        </Button>
      </div>
    </form>
  );
}

export default ItemForm;

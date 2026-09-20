import { useState } from 'react';

import { Badge, Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface TagPickerFieldProps {
  value: string[];
  onValueChange: (value: string[]) => void;
  presetOptions: readonly string[];
  ariaLabel: string;
  addLabel?: string;
  disabled?: boolean;
}

function TagPickerField({
  value,
  onValueChange,
  presetOptions,
  ariaLabel,
  addLabel = 'Add a custom tag',
  disabled,
}: TagPickerFieldProps) {
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const options = [...presetOptions, ...value.filter((tag) => !presetOptions.includes(tag))];

  const toggleTag = (tag: string) => {
    onValueChange(value.includes(tag) ? value.filter((v) => v !== tag) : [...value, tag]);
  };

  const handleAddCustom = () => {
    const trimmed = customInput.trim();

    if (!trimmed) {
      return;
    }

    if (!value.some((tag) => tag.toLowerCase() === trimmed.toLowerCase())) {
      onValueChange([...value, trimmed]);
    }

    setCustomInput('');
    setIsAddingCustom(false);
  };

  return (
    <div className='space-y-2'>
      <div role='group' aria-label={ariaLabel} className='flex flex-wrap gap-2'>
        {options.map((option) => {
          const isSelected = value.includes(option);

          return (
            <button key={option} type='button' aria-pressed={isSelected} disabled={disabled} onClick={() => toggleTag(option)}>
              <Badge variant={isSelected ? 'primary' : 'muted'} outline={!isSelected}>
                {option}
              </Badge>
            </button>
          );
        })}
      </div>
      {isAddingCustom ? (
        <div className='flex items-center gap-2'>
          <Input
            value={customInput}
            onChange={(event) => setCustomInput(event.target.value)}
            placeholder='Custom value'
            variant='outline'
            disabled={disabled}
            autoFocus
          />
          <Button type='button' size='sm' onClick={handleAddCustom} disabled={disabled}>
            Add
          </Button>
        </div>
      ) : (
        <Button
          type='button'
          variant='link'
          size='sm'
          className={join('text-muted-foreground hover:text-foreground px-0 text-xs')}
          onClick={() => setIsAddingCustom(true)}
          disabled={disabled}
        >
          + {addLabel}
        </Button>
      )}
    </div>
  );
}

export default TagPickerField;

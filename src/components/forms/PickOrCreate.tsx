import { useState } from 'react';

import { Input } from '@moondreamsdev/dreamer-ui/components';
import { Plus } from 'lucide-react';

import Pill from '@/components/Pill';
import { PillOptions, type PillOption } from '@/components/PillGroup';

/** The `choice` a `PickOrCreate` reports while the person is typing a new name. */
export const NEW_CHOICE = '__add_new__';

interface PickOrCreateProps {
  label: string;
  options: readonly PillOption<string>[];
  /** An existing option's value, `NEW_CHOICE` while typing a new one, or `''` before anything is chosen. */
  choice: string;
  newText: string;
  onChange: (choice: string, newText: string) => void;
  /** The first pill, like "New group". */
  newPillLabel: string;
  newPlaceholder: string;
}

/**
 * Pick one of the existing names or make a new one. Nothing starts selected, so the person has to
 * act, and the dashed "New" pill comes first so it is obvious a new name is allowed. With no existing
 * names it is just the text field.
 */
function PickOrCreate({ label, options, choice, newText, onChange, newPillLabel, newPlaceholder }: PickOrCreateProps) {
  const [isCreating, setIsCreating] = useState(choice === NEW_CHOICE || newText !== '');
  const showCreate = isCreating || options.length === 0;

  const newInput = (
    <Input
      value={newText}
      autoFocus={options.length > 0}
      aria-label={newPlaceholder}
      placeholder={newPlaceholder}
      variant='outline'
      onChange={(event) => onChange(NEW_CHOICE, event.target.value)}
    />
  );

  if (options.length === 0) {
    return newInput;
  }

  return (
    <div className='space-y-2'>
      <PillOptions
        label={label}
        options={options}
        selectedCount={choice === '' && !isCreating ? 0 : 1}
        leading={
          <Pill
            isSelected={showCreate}
            className='border-primary/60 border border-dashed'
            onClick={() => {
              setIsCreating(true);
              onChange(NEW_CHOICE, newText);
            }}
          >
            <Plus className='h-3.5 w-3.5' aria-hidden='true' />
            {newPillLabel}
          </Pill>
        }
        isSelected={(value) => !isCreating && choice === value}
        onToggle={(value) => {
          setIsCreating(false);
          onChange(value, '');
        }}
      />
      {showCreate && newInput}
    </div>
  );
}

export default PickOrCreate;

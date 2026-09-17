import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import CatPillSelector from './CatPillSelector';

interface CatOption {
  label: string;
  value: string;
  photoURL?: string | null;
}

interface ExpenseCatFilterByPetProps {
  catOptions: CatOption[];
  catId: string | null;
  onCatIdChange: (catId: string | null) => void;
}

const linkClassName = 'text-muted-foreground hover:text-foreground';

/**
 * The "View by pet" interaction shared by the expense counter cards: a link that reveals a
 * single-select pill row, plus a "See for all pets" link that resets the filter and collapses
 * back to the initial link state.
 */
function ExpenseCatFilterByPet({ catOptions, catId, onCatIdChange }: ExpenseCatFilterByPetProps) {
  const [isViewingByPet, setIsViewingByPet] = useState(false);

  if (catOptions.length === 0) {
    return null;
  }

  if (!isViewingByPet) {
    return (
      <Button type='button' variant='link' size='sm' className={linkClassName} onClick={() => setIsViewingByPet(true)}>
        View by pet
      </Button>
    );
  }

  return (
    <div className='space-y-1'>
      <CatPillSelector
        catOptions={catOptions}
        value={catId ? [catId] : []}
        onValueChange={(value) => onCatIdChange(value[0] ?? null)}
        singleSelect
        size='sm'
      />
      <div className='flex justify-center'>
        <Button
          type='button'
          variant='link'
          size='sm'
          className={linkClassName}
          onClick={() => {
            onCatIdChange(null);
            setIsViewingByPet(false);
          }}
        >
          See for all pets
        </Button>
      </div>
    </div>
  );
}

export default ExpenseCatFilterByPet;

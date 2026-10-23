import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import { PillGroup } from '@/components/PillGroup';
import { EXPECTED_KIND_LABELS, EXPECTED_KINDS } from '@apps/runway/constants';
import BillForm from '@apps/runway/forms/BillForm';
import IncomeForm from '@apps/runway/forms/IncomeForm';

type ExpectedKind = (typeof EXPECTED_KINDS)[number];

interface ExpectedScreenProps {
  onClose: () => void;
}

const kindOptions = EXPECTED_KINDS.map((value) => ({
  value,
  label: EXPECTED_KIND_LABELS[value],
}));

/** Reached from "+ Expected" on Days: money coming in or a bill coming due, asked first because it decides the form. */
function ExpectedScreen({ onClose }: ExpectedScreenProps) {
  const [kind, setKind] = useState<ExpectedKind | null>(null);

  if (kind === 'income') {
    return (
      <IncomeForm
        isOpen
        title='Expected'
        defaultFrequency='once'
        onClose={onClose}
      />
    );
  }
  if (kind === 'expense') {
    return <BillForm isOpen title='Expected' onClose={onClose} />;
  }

  return (
    <FormSheet isOpen onClose={onClose} title='Expected'>
      <div className='space-y-4 pb-2'>
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs'>What is coming</p>
          <PillGroup
            label='What is coming'
            options={kindOptions}
            value={kind}
            onChange={setKind}
          />
        </div>
        <Button type='button' variant='secondary' onClick={onClose}>
          Cancel
        </Button>
      </div>
    </FormSheet>
  );
}

export default ExpectedScreen;

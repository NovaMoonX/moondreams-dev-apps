import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, CalendarClock } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import {
  EXPECTED_KINDS,
  FORM_FLOW_WORDS,
  HORIZON_WORDS,
} from '@apps/runway/constants';
import BillForm from '@apps/runway/forms/BillForm';
import HorizonForm from '@apps/runway/forms/HorizonForm';
import IncomeForm from '@apps/runway/forms/IncomeForm';

type ExpectedKind = (typeof EXPECTED_KINDS)[number];

interface ExpectedScreenProps {
  initialKind?: ExpectedKind | null;
  onClose: () => void;
}

/** Reached from "Add expected" on Days: money coming in, a bill or one-time cost, or something with several costs, asked first as large choices because it decides the questions after it. */
function ExpectedScreen({ initialKind = null, onClose }: ExpectedScreenProps) {
  const [kind, setKind] = useState<ExpectedKind | null>(initialKind);

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
    return (
      <BillForm isOpen title='Expected' noun='expense' onClose={onClose} />
    );
  }

  if (kind === 'horizon') {
    return (
      <HorizonForm isOpen title={HORIZON_WORDS.formTitle} onClose={onClose} />
    );
  }

  return (
    <FormSheet isOpen onClose={onClose} title='Expected'>
      <div className='space-y-5'>
        <h3 className='text-2xl leading-tight font-semibold'>
          {FORM_FLOW_WORDS.expectedTitle}
        </h3>
        <ActionGroup isRoomy>
          <ActionRow
            isGrouped
            isRoomy
            hasChevron
            icon={<ArrowDownToLine className='h-5 w-5' />}
            label={FORM_FLOW_WORDS.expectedIncome}
            subtitle={FORM_FLOW_WORDS.expectedIncomeSub}
            onClick={() => setKind('income')}
          />
          <ActionRow
            isGrouped
            isRoomy
            hasChevron
            icon={<ArrowUpFromLine className='h-5 w-5' />}
            label={FORM_FLOW_WORDS.expectedExpense}
            subtitle={FORM_FLOW_WORDS.expectedExpenseSub}
            onClick={() => setKind('expense')}
          />
          <ActionRow
            isGrouped
            isRoomy
            hasChevron
            icon={<CalendarClock className='h-5 w-5' />}
            label={FORM_FLOW_WORDS.expectedHorizon}
            subtitle={FORM_FLOW_WORDS.expectedHorizonSub}
            onClick={() => setKind('horizon')}
          />
        </ActionGroup>
        <ModalFooterActions
          cancelAction={
            <Button type='button' variant='secondary' onClick={onClose}>
              Cancel
            </Button>
          }
          rightActions={null}
        />
      </div>
    </FormSheet>
  );
}

export default ExpectedScreen;

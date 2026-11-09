import { useState } from 'react';

import { CalendarClock } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import ComingChangesList from '@apps/runway/components/ComingChangesList';
import ItemRow from '@apps/runway/components/ItemRow';
import { COMING_WORDS } from '@apps/runway/constants';
import type { PlanChange } from '@apps/runway/engine/planChanges';
import { describePlanChangeGoes } from '@apps/runway/utils/planChangeText';

interface PlanChangesDoorProps {
  changes: readonly PlanChange[];
  /** The day's title, named in the list's own. */
  day: string;
  today: number;
}

/** A day with more changes than its agenda lists one by one: a single "5 things change" row that opens them all, each opening its own sheet. */
function PlanChangesDoor({ changes, day, today }: PlanChangesDoorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const title = COMING_WORDS.thingsChange(changes.length);

  return (
    <>
      <ItemRow
        name={title}
        leading={
          <span className='bg-accent text-accent-foreground grid size-9 place-items-center rounded-full'>
            <CalendarClock className='size-4' aria-hidden='true' />
          </span>
        }
        ariaLabel={`${title}. Open`}
        onOpen={() => setIsOpen(true)}
      />
      {isOpen && (
        <FormSheet
          isOpen
          isDrawerWhenShort
          onClose={() => setIsOpen(false)}
          title={COMING_WORDS.dayListTitle(day)}
          actions={<ValuesEyeButton />}
        >
          <ComingChangesList
            changes={changes}
            today={today}
            textOf={describePlanChangeGoes}
          />
        </FormSheet>
      )}
    </>
  );
}

export default PlanChangesDoor;

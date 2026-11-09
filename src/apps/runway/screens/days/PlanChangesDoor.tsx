import { useState } from 'react';

import { CalendarClock } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import ComingChangesList from '@apps/runway/components/ComingChangesList';
import ItemRow from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import { COMING_WORDS, PLAN_CHANGE_WORDS } from '@apps/runway/constants';
import type { PlanChange } from '@apps/runway/engine/planChanges';
import { getChangeRef } from '@apps/runway/utils/comingChangeText';
import { describePlanChangeGoes } from '@apps/runway/utils/planChangeText';

interface PlanChangesDoorProps {
  changes: readonly PlanChange[];
  /** The day's title, named in the list's own. */
  day: string;
  today: number;
}

/** A day with more changes than its agenda lists one by one: a single "5 things change" row that opens them all; a change opens its item's sheet in place of the list, and closing it returns to the list. */
function PlanChangesDoor({ changes, day, today }: PlanChangesDoorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [chosen, setChosen] = useState<PlanChange | null>(null);
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
            onOpen={(change) => {
              setIsOpen(false);
              setChosen(change);
            }}
          />
        </FormSheet>
      )}
      {chosen && (
        <ItemSheet
          itemId={chosen.itemId}
          kind={chosen.kind}
          today={today}
          figureLabel={PLAN_CHANGE_WORDS.sheetLabel}
          presetChange={getChangeRef(chosen)}
          onClose={() => {
            setChosen(null);
            setIsOpen(true);
          }}
        />
      )}
    </>
  );
}

export default PlanChangesDoor;

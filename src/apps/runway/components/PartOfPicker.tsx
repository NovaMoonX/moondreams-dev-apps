import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import SummaryRow from '@/components/SummaryRow';
import { useAppSelector } from '@/store';
import { PART_OF_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { selectOpenHorizonItems } from '@apps/runway/store/selectors/runwaySelectors';

const NONE = 'none';

interface PartOfPickerProps {
  /** The picked event's id; null for none. */
  value: string | null;
  onChange: (eventId: string | null) => void;
}

/** Which open event a planned change belongs to: one summary row whose choices open in their own sheet, "Not part of an event" first. It only groups the change for viewing and never moves its date. */
function PartOfPicker({ value, onChange }: PartOfPickerProps) {
  const today = todayAsUtcDate();
  const events = useAppSelector((state) =>
    selectOpenHorizonItems(state, today),
  );
  const [isOpen, setIsOpen] = useState(false);
  const picked = events.find(({ item }) => item.id === value);
  const chosen = picked?.version.payload.name ?? PART_OF_WORDS.none;
  if (events.length === 0 && value === null) return null;

  return (
    <>
      <SummaryRow
        label={PART_OF_WORDS.label}
        ariaLabel={`${PART_OF_WORDS.label}: ${chosen}. Change`}
        onClick={() => setIsOpen(true)}
      >
        {chosen}
      </SummaryRow>
      {isOpen && (
        <FormSheet
          isOpen
          onClose={() => setIsOpen(false)}
          title={PART_OF_WORDS.label}
        >
          <div className='pb-4'>
            <PillGroup
              label={PART_OF_WORDS.label}
              options={[
                { value: NONE, label: PART_OF_WORDS.none },
                ...events.map(({ item, version }) => ({
                  value: item.id,
                  label: version.payload.name,
                  emoji: version.payload.emoji ?? undefined,
                })),
              ]}
              value={picked ? picked.item.id : NONE}
              onChange={(next) => {
                onChange(next === NONE ? null : next);
                setIsOpen(false);
              }}
            />
          </div>
          <ModalFooterActions
            rightActions={
              <Button type='button' onClick={() => setIsOpen(false)}>
                Done
              </Button>
            }
          />
        </FormSheet>
      )}
    </>
  );
}

export default PartOfPicker;

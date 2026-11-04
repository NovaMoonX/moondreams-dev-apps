import ChoiceCards from '@apps/runway/components/ChoiceCards';
import { HELD_WORDS } from '@apps/runway/constants';
import type { HeldChoice } from '@apps/runway/engine/endings';

interface HeldChoiceListProps {
  value: HeldChoice | null;
  onChange: (choice: HeldChoice) => void;
  freeBody: string;
  keepBody: string;
}

/** The two answers for the money a stopping item holds, side by side, nothing chosen until the person taps one. */
function HeldChoiceList({
  value,
  onChange,
  freeBody,
  keepBody,
}: HeldChoiceListProps) {
  return (
    <ChoiceCards
      options={[
        { value: 'free', title: HELD_WORDS.freeTitle, body: freeBody },
        { value: 'keep', title: HELD_WORDS.keepTitle, body: keepBody },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

export default HeldChoiceList;

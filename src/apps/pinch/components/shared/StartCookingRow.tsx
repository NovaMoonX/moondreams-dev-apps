import { CookingPot } from 'lucide-react';

import ActionRow from '@/components/ActionRow';

interface StartCookingRowProps {
  onClick: () => void;
}

function StartCookingRow({ onClick }: StartCookingRowProps) {
  return (
    <ActionRow
      icon={<CookingPot className='h-4 w-4' />}
      label='Start cooking'
      subtitle='Steps one at a time, with a timer'
      onClick={onClick}
    />
  );
}

export default StartCookingRow;

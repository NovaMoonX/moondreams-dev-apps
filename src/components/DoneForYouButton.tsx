import { History } from 'lucide-react';

import HeaderIconButton from '@/components/HeaderIconButton';

interface DoneForYouButtonProps {
  /** Something in the list the person has not looked at yet. */
  hasUnseen: boolean;
  onClick: () => void;
  /** The list's name, as the accessible name and the hover title. */
  label: string;
}

/** The header's quiet clock that opens what an app did on its own, with a small dot while something there is unseen. */
function DoneForYouButton({
  hasUnseen,
  onClick,
  label,
}: DoneForYouButtonProps) {
  return (
    <HeaderIconButton
      label={hasUnseen ? `${label}, new items` : label}
      onClick={onClick}
      icon={
        <span className='relative inline-flex'>
          <History className='size-4' aria-hidden='true' />
          {hasUnseen && (
            <span
              className='bg-primary absolute -top-1 -right-1 size-1.5 rounded-full'
              aria-hidden='true'
            />
          )}
        </span>
      }
    />
  );
}

export default DoneForYouButton;

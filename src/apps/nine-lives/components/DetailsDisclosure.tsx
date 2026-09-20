import { Disclosure } from '@moondreamsdev/dreamer-ui/components';
import { useState, type ReactNode } from 'react';

interface DetailsDisclosureProps {
  label: ReactNode;
  children: ReactNode;
  /** Bumping this forces the disclosure open (e.g. to reveal content someone deep-linked to); the user can still collapse it afterward. */
  forceOpenAt?: number;
}

function DetailsDisclosure({ label, children, forceOpenAt }: DetailsDisclosureProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [handledForceOpenAt, setHandledForceOpenAt] = useState(forceOpenAt);

  if (forceOpenAt !== undefined && forceOpenAt !== handledForceOpenAt) {
    setHandledForceOpenAt(forceOpenAt);
    setIsOpen(true);
  }

  return (
    <div className='rounded-lg border-2 border-border'>
      <Disclosure
        label={<span className='font-medium'>{label}</span>}
        isOpen={isOpen}
        onToggle={setIsOpen}
        buttonClassName='px-3 py-2.5 hover:bg-muted/40'
        className='overflow-visible'
      >
        <div className='border-t-2 border-border bg-muted/20 p-3'>{children}</div>
      </Disclosure>
    </div>
  );
}

export default DetailsDisclosure;

import { Disclosure } from '@moondreamsdev/dreamer-ui/components';
import type { ReactNode } from 'react';

interface DetailsDisclosureProps {
  label: ReactNode;
  children: ReactNode;
}

function DetailsDisclosure({ label, children }: DetailsDisclosureProps) {
  return (
    <div className='rounded-lg border-2 border-border'>
      <Disclosure
        label={<span className='font-medium'>{label}</span>}
        buttonClassName='px-3 py-2.5 hover:bg-muted/40'
        className='overflow-visible'
      >
        <div className='border-t-2 border-border bg-muted/20 p-3'>{children}</div>
      </Disclosure>
    </div>
  );
}

export default DetailsDisclosure;

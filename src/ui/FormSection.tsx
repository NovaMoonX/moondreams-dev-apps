import { useState, type ReactNode } from 'react';

import { Disclosure } from '@moondreamsdev/dreamer-ui/components';

interface FormSectionProps {
  label: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

export default function FormSection({
  label,
  children,
  defaultOpen = false,
}: FormSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className='border-border overflow-hidden rounded-lg border'>
      <Disclosure
        label={<span className='font-medium'>{label}</span>}
        isOpen={isOpen}
        onToggle={setIsOpen}
        buttonClassName='px-3 py-2.5 hover:bg-muted/40'
      >
        <div className='border-border border-t p-3'>{children}</div>
      </Disclosure>
    </div>
  );
}

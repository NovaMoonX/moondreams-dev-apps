import { useId, type ReactNode } from 'react';

import { Label } from '@moondreamsdev/dreamer-ui/components';

interface FieldProps {
  label: ReactNode;
  children: (id: string) => ReactNode;
}

/** A visible caption above one control, tied to it by id so a screen reader and a tap on the caption both reach the input. */
function Field({ label, children }: FieldProps) {
  const id = useId();

  return (
    <div className='space-y-1.5'>
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
}

export default Field;

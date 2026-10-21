import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

interface FormSectionProps {
  title: string;
  /** A count or a short status beside the title ("8", "Edited"). */
  detail?: ReactNode;
  action?: ReactNode;
  /** The heading stays for screen readers but is not drawn, where a short screen needs the room. */
  isTitleHidden?: boolean;
  /** On a phone the section takes the height its screen has left, for a single child that grows into it (a drop zone). */
  isFilling?: boolean;
  children: ReactNode;
}

/** A titled part of a long form: a small uppercase heading, then its fields. Keeps a recipe's ingredients, steps and nutrition readable as three things, not one wall of inputs. */
function FormSection({
  title,
  detail,
  action,
  isTitleHidden = false,
  isFilling = false,
  children,
}: FormSectionProps) {
  const heading = (
    <h3
      className={join(
        'text-muted-foreground flex items-baseline gap-2 text-xs font-semibold tracking-wide uppercase',
        isTitleHidden && 'sr-only',
      )}
    >
      {title}
      {detail !== undefined && (
        <span className='font-normal tabular-nums'>{detail}</span>
      )}
    </h3>
  );

  return (
    <section
      aria-label={title}
      className={
        isFilling
          ? 'space-y-2 max-sm:flex max-sm:flex-1 max-sm:flex-col max-sm:gap-2 max-sm:space-y-0'
          : 'space-y-2'
      }
    >
      {action ? (
        <div className='flex min-h-10 items-center justify-between gap-3'>
          {heading}
          {action}
        </div>
      ) : (
        heading
      )}
      {children}
    </section>
  );
}

export default FormSection;

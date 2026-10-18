import type { ReactNode } from 'react';

interface FormSectionProps {
  title: string;
  /** A count or a short status beside the title ("8", "Edited"). */
  detail?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

/** A titled part of a long form: a small uppercase heading, then its fields. Keeps a recipe's ingredients, steps and nutrition readable as three things, not one wall of inputs. */
function FormSection({ title, detail, action, children }: FormSectionProps) {
  const heading = (
    <h3 className='text-muted-foreground flex items-baseline gap-2 text-xs font-semibold tracking-wide uppercase'>
      {title}
      {detail !== undefined && (
        <span className='font-normal tabular-nums'>{detail}</span>
      )}
    </h3>
  );

  return (
    <section aria-label={title} className='space-y-2'>
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

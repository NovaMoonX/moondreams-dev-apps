import type { ReactNode } from 'react';

import BackLink from '@/components/BackLink';

interface BackHeadingProps {
  onBack: () => void;
  /** The view's name ("History", "Purchases"), a step below the sheet's own title. */
  title: ReactNode;
  /** Where Back goes; "Back" when the sheet's title already names it. */
  backLabel?: string;
}

/** The top of a titled view swapped into a sheet: the soft Back chip on its own line, then the view's name as a subheading, so neither competes with the sheet's title. */
function BackHeading({ onBack, title, backLabel }: BackHeadingProps) {
  return (
    <div className='space-y-2'>
      <BackLink onBack={onBack} label={backLabel} />
      <h3 className='min-w-0 text-lg font-semibold wrap-break-word'>{title}</h3>
    </div>
  );
}

export default BackHeading;

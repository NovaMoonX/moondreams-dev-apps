import type { ReactNode } from 'react';

import HelpTip from '@/components/HelpTip';
import SensitiveValue from '@/components/SensitiveValue';
import { GROUP_WORDS, PRIORITY_DIAL_WORDS } from '@apps/runway/constants';
import type { Priority } from '@apps/runway/types';
import type { describePlanTotal } from '@apps/runway/utils/billText';

interface PlanTotalProps {
  figure: NonNullable<ReturnType<typeof describePlanTotal>>;
  /** What the total counts and leaves out, behind an info icon. */
  help?: ReactNode;
  /** The info icon's title when it is not about how a month is worked out. */
  helpTitle?: string;
  dial?: Priority;
}

/** The one total on a Plan view's header line, right-aligned and masked until amounts are shown. */
function PlanTotal({ figure, help, helpTitle, dial = 'want' }: PlanTotalProps) {
  const shownHelp =
    dial === 'want' ? (
      help
    ) : (
      <div className='space-y-2'>
        <p>
          {PRIORITY_DIAL_WORDS.trimmedNote(PRIORITY_DIAL_WORDS.counted[dial])}
        </p>
        {help}
      </div>
    );
  return (
    <div className='text-muted-foreground flex max-w-[min(15rem,calc(100vw-10rem))] items-center gap-1 text-sm leading-5'>
      <span className='text-right text-balance'>
        <SensitiveValue className='text-foreground font-medium whitespace-nowrap'>
          {figure.amount}
        </SensitiveValue>{' '}
        {figure.rest}
        {figure.whole !== null && (
          <>
            {' '}
            <SensitiveValue className='whitespace-nowrap'>
              {figure.whole}
            </SensitiveValue>
          </>
        )}
      </span>
      {shownHelp && (
        <HelpTip title={helpTitle ?? GROUP_WORDS.basisTitle}>
          {shownHelp}
        </HelpTip>
      )}
    </div>
  );
}

export default PlanTotal;

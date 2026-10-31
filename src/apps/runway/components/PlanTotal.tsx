import type { ReactNode } from 'react';

import HelpTip from '@/components/HelpTip';
import SensitiveValue from '@/components/SensitiveValue';
import { GROUP_WORDS } from '@apps/runway/constants';
import type { describePlanTotal } from '@apps/runway/utils/billText';

interface PlanTotalProps {
  figure: NonNullable<ReturnType<typeof describePlanTotal>>;
  /** What the total counts and leaves out, behind an info icon. */
  help?: ReactNode;
  /** The info icon's title when it is not about how a month is worked out. */
  helpTitle?: string;
}

/** The one total on a Plan view's header line, right-aligned and masked until amounts are shown. */
function PlanTotal({ figure, help, helpTitle }: PlanTotalProps) {
  return (
    <div className='text-muted-foreground flex items-center gap-1 text-sm'>
      <span className='text-right'>
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
      {help && (
        <HelpTip title={helpTitle ?? GROUP_WORDS.basisTitle}>{help}</HelpTip>
      )}
    </div>
  );
}

export default PlanTotal;

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Repeat } from 'lucide-react';

import { RULE_WORDS } from '@apps/runway/constants';
import type { OpenRule } from '@apps/runway/types';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

interface RulesNeedHomeRowProps {
  rules: readonly OpenRule[];
}

/** A quiet row on Home when shop rules lost their envelope; it opens Rules, where they get a new one. It draws no amount. */
function RulesNeedHomeRow({ rules }: RulesNeedHomeRowProps) {
  const { openView } = useRunwayUrlState();
  const title = RULE_WORDS.homeRowTitle(rules.length);

  return (
    <section
      aria-label={title}
      className='bg-card border-border flex min-h-12 items-stretch rounded-2xl border'
    >
      <Button
        type='button'
        variant='tertiary'
        className='hover:bg-muted/60 h-auto min-h-0 min-w-0 flex-1 justify-start gap-3 rounded-2xl px-3! py-2! text-left max-[359px]:gap-2 max-[359px]:px-2!'
        onClick={() => openView('rules')}
      >
        <Repeat
          className='text-muted-foreground h-5 w-5 shrink-0'
          aria-hidden='true'
        />
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block text-sm leading-5 font-medium'>
            {title}
          </span>
          <span className='text-muted-foreground mt-0.5 block text-xs leading-4'>
            {RULE_WORDS.homeRowSub}
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground h-5 w-5 shrink-0'
          aria-hidden='true'
        />
      </Button>
    </section>
  );
}

export default RulesNeedHomeRow;

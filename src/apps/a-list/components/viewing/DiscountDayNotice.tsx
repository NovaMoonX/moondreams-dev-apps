import HelpTip from '@/components/HelpTip';

interface DiscountDayNoticeProps {
  /** What the member does with the price on this screen, said last in the explanation. */
  step: 'pick' | 'enter' | 'change';
}

const STEP_LINES: Record<DiscountDayNoticeProps['step'], string> = {
  pick: 'The prices here are the listed ones. After you buy, enter what your checkout charged.',
  enter:
    'Enter the price and tax from your checkout so your totals match what you paid.',
  change:
    'Tap Change to enter the price and tax from your checkout so your totals match what you paid.',
};

/** AMC marks the showing as a discount day: its listed price is the regular one, and checkout may charge less. */
function DiscountDayNotice({ step }: DiscountDayNoticeProps) {
  return (
    <div>
      <HelpTip
        badgeLabel='Discount day: you may pay less'
        title='You may pay less at checkout'
      >
        AMC marks this as a discount day, so AMC Stubs members usually pay less
        than the listed price, and other deals can lower it too.{' '}
        {STEP_LINES[step]}
      </HelpTip>
    </div>
  );
}

export default DiscountDayNotice;

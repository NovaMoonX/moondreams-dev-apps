import HelpTip from '@/components/HelpTip';

interface DiscountDayNoticeProps {
  /** What the member does with the price on this screen, said last in the explanation. */
  step: 'pick' | 'enter' | 'change';
  /** Only some of the listed showings are on a discount day, so the chip doesn't speak for all of them. */
  isSomeShowings?: boolean;
}

const STEP_LINES: Record<DiscountDayNoticeProps['step'], string> = {
  pick: 'The prices here are the listed ones. After you buy, enter what your checkout charged.',
  enter:
    'Enter the price and tax from your checkout so your totals match what you paid.',
  change:
    'Tap Change to enter the price and tax from your checkout so your totals match what you paid.',
};

/** AMC marks the showing as a discount day: its listed price is the regular one, and checkout may charge less. */
function DiscountDayNotice({
  step,
  isSomeShowings = false,
}: DiscountDayNoticeProps) {
  return (
    <div className={step === 'pick' ? 'pb-1' : undefined}>
      <HelpTip
        infoLabel={
          isSomeShowings
            ? 'Some showings may cost less'
            : 'Discount day: you may pay less'
        }
        title='You may pay less at checkout'
      >
        {isSomeShowings ? 'AMC marks some of these showings' : 'AMC marks this'}{' '}
        as a discount day, so checkout may come to less than the listed price
        (often for AMC Stubs members), and other deals can lower it too.{' '}
        {STEP_LINES[step]}
      </HelpTip>
    </div>
  );
}

export default DiscountDayNotice;

import InlineNotice from '@/components/InlineNotice';

interface DiscountDayNoticeProps {
  /** The price sits behind a Change button, so the notice points to it. */
  isPriceFolded: boolean;
}

/** A Discount Tuesday showing: AMC's listed price and tax are the regular ones, and checkout charges less. */
function DiscountDayNotice({ isPriceFolded }: DiscountDayNoticeProps) {
  return (
    <InlineNotice tone='warning' title='Discount Tuesday showing'>
      AMC lists the regular price, but Stubs members pay less at checkout.{' '}
      {isPriceFolded
        ? 'Tap Change to enter the price and tax from your checkout.'
        : 'Enter the price and tax from your checkout.'}
    </InlineNotice>
  );
}

export default DiscountDayNotice;

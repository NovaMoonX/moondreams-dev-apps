import HelpTip from '@/components/HelpTip';

interface PremiumSavingsHelpProps {
  /** Shows this text as a link that opens the explanation, instead of the help icon. */
  linkLabel?: string;
}

function PremiumSavingsHelp({ linkLabel }: PremiumSavingsHelpProps) {
  return (
    <HelpTip title='Premium format savings' linkLabel={linkLabel}>
      <p>
        A-List covers IMAX, Dolby Cinema, PRIME and the other premium formats at
        no extra charge. Premium savings is the upcharge you skipped.
      </p>
      <p>
        For each premium ticket, we take its price and subtract what a standard
        ticket for the same showing would have cost, then add those up.
      </p>
      <dl className='space-y-1 rounded-2xl border border-current/20 px-3 py-2'>
        <div className='flex justify-between gap-3'>
          <dt>📽️ IMAX ticket</dt>
          <dd className='tabular-nums'>$22.00</dd>
        </div>
        <div className='flex justify-between gap-3'>
          <dt>− Standard ticket</dt>
          <dd className='tabular-nums'>$16.00</dd>
        </div>
        <div className='flex justify-between gap-3 border-t border-current/20 pt-1 font-semibold'>
          <dt>= Premium savings</dt>
          <dd className='tabular-nums'>$6.00</dd>
        </div>
      </dl>
      <p className='opacity-80'>
        Tax and fees aren't part of it, and a premium ticket without a standard
        price adds nothing yet.
      </p>
    </HelpTip>
  );
}

export default PremiumSavingsHelp;

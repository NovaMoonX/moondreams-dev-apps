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
      <p className='bg-secondary/60 rounded-2xl px-3 py-2'>
        📽️ IMAX at $22.00 − Standard at $16.00 = <strong>$6.00 saved</strong>
      </p>
      <p className='text-muted-foreground'>
        Tax and fees aren't part of it, and a premium ticket without a standard
        price adds nothing yet.
      </p>
    </HelpTip>
  );
}

export default PremiumSavingsHelp;

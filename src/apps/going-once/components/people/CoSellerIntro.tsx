import { Button } from '@moondreamsdev/dreamer-ui/components';

import IntroCard from '@/components/IntroCard';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import { useUserInfo } from '@/hooks/useUserInfo';
import type { Sale } from '@apps/going-once/types';
import { toFirstName } from '@apps/going-once/utils/personName';
import { isSaleSeller } from '@apps/going-once/utils/roles';

const NOT_SEEN = false;
const parseSeen = (stored: unknown) => (stored === true ? true : null);

interface CoSellerIntroProps {
  sale: Sale;
  uid: string;
}

/** Greets a co-seller the first time they open a sale they were added to; each person sees it once per sale. */
function CoSellerIntro({ sale, uid }: CoSellerIntroProps) {
  const seller = useUserInfo(sale.ownerUid);
  const [isSeen, setIsSeen] = useLocalStorageState(
    `going-once-intro-${uid}-${sale.id}`,
    NOT_SEEN,
    parseSeen,
  );

  if (isSaleSeller(sale, uid) || isSeen) return null;

  return (
    <div className='space-y-2'>
      <IntroCard
        icon='👋'
        lead={`${toFirstName(seller?.displayName)} added you to ${sale.name}.`}
      >
        You see everything, floor prices and notes included, and can do all of
        it but delete things, manage co-sellers or change the sale&apos;s
        details.
      </IntroCard>
      <div className='flex justify-end'>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          onClick={() => setIsSeen(true)}
        >
          Got it
        </Button>
      </div>
    </div>
  );
}

export default CoSellerIntro;

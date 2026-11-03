import { Button } from '@moondreamsdev/dreamer-ui/components';

import IntroCard from '@/components/IntroCard';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import { useUserInfo } from '@/hooks/useUserInfo';
import PushCapsule from '@apps/going-once/components/inbox/PushCapsule';
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
        action={
          <Button
            type='button'
            variant='secondary'
            size='sm'
            rounded='full'
            className="relative h-7 px-3 text-xs after:absolute after:-inset-x-2 after:-inset-y-1.5 after:content-['']"
            onClick={() => setIsSeen(true)}
          >
            Got it
          </Button>
        }
      >
        You see everything, floor prices and notes included, and can do all but
        delete other people&apos;s things, manage co-sellers or change the
        sale&apos;s details; you can leave from People.
      </IntroCard>
      <PushCapsule saleId={sale.id} uid={uid} />
    </div>
  );
}

export default CoSellerIntro;

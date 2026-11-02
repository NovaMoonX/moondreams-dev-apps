import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import { useUserInfo } from '@/hooks/useUserInfo';
import { toFirstName } from '@apps/going-once/utils/personName';

interface RemovedFromSaleProps {
  /** Null when the sale was never read (an old link). */
  saleName: string | null;
  sellerUid: string | null;
  onBack: () => void;
}

/** What a co-seller sees when the sale they had open, or a link to one, is no longer theirs: they were removed, or the seller deleted it. */
function RemovedFromSale({
  saleName,
  sellerUid,
  onBack,
}: RemovedFromSaleProps) {
  const seller = useUserInfo(sellerUid);
  const firstName = toFirstName(seller?.displayName);
  const sellerName = firstName === 'Someone' ? null : firstName;

  return (
    <div className='page'>
      <div className='mx-auto flex min-h-[calc(100svh-8rem)] max-w-md items-center'>
        <div className='w-full'>
          <EmptyCard
            icon='👋'
            action={
              <Button type='button' onClick={onBack}>
                Back to Your sales
              </Button>
            }
          >
            <span className='block font-semibold break-words'>
              You&apos;re no longer on {saleName ?? 'this sale'}
            </span>
            <span className='text-muted-foreground mt-1 block'>
              {sellerName ?? 'The seller'} removed you, or the sale was deleted.
              Ask {sellerName ?? 'them'} to add you again.
            </span>
          </EmptyCard>
        </div>
      </div>
    </div>
  );
}

export default RemovedFromSale;

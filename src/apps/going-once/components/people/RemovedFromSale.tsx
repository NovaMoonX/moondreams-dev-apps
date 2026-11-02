import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';

interface RemovedFromSaleProps {
  saleName: string;
  onBack: () => void;
}

/** What a co-seller sees when the sale they had open is no longer theirs: they were removed, or the seller deleted it. */
function RemovedFromSale({ saleName, onBack }: RemovedFromSaleProps) {
  return (
    <div className='page'>
      <div className='mx-auto max-w-2xl'>
        <EmptyCard
          icon='👋'
          action={
            <Button type='button' onClick={onBack}>
              Back to Your sales
            </Button>
          }
        >
          You&apos;re no longer on {saleName}
        </EmptyCard>
      </div>
    </div>
  );
}

export default RemovedFromSale;

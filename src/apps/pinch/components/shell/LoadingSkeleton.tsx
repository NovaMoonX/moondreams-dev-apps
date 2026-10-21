import { Skeleton } from '@moondreamsdev/dreamer-ui/components';

function LoadingSkeleton() {
  return (
    <div className='page' aria-busy='true' aria-label='Loading your kitchen'>
      <div className='mx-auto max-w-4xl space-y-4 py-8'>
        <Skeleton className='h-10 w-40' />
        <Skeleton className='h-12' />
        <Skeleton className='h-80' />
      </div>
    </div>
  );
}

export default LoadingSkeleton;

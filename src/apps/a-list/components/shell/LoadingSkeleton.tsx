import { Skeleton } from '@moondreamsdev/dreamer-ui/components';

function LoadingSkeleton() {
  return (
    <div className='page' aria-busy='true' aria-label='Loading your A-List'>
      <div className='mx-auto max-w-4xl space-y-4 py-8'>
        <Skeleton className='h-10 w-40' />
        <div className='grid grid-cols-2 gap-3'>
          <Skeleton className='h-16' />
          <Skeleton className='h-16' />
        </div>
        <Skeleton className='h-80' />
      </div>
    </div>
  );
}

export default LoadingSkeleton;

import { Button } from '@moondreamsdev/dreamer-ui/components';

function WorthTheWait() {
  return (
    <div className='page flex items-center justify-center px-4 py-12'>
      <div className='w-full max-w-xl'>
        <div className='mb-6'>
          <Button href='/'>Back</Button>
        </div>

        <main className='space-y-5'>
          <p className='text-xs font-medium uppercase tracking-[0.24em] text-foreground/60'>Mini app</p>
          <h1 className='text-4xl font-semibold tracking-tight text-foreground md:text-5xl'>
            Worth the Wait
          </h1>
          <p className='max-w-lg text-base leading-7 text-foreground/70 md:text-lg'>
            A quiet place to hold what is on your mind and in your heart until the right moment to
            share it arrives.
          </p>
        </main>
      </div>
    </div>
  );
}

export default WorthTheWait;

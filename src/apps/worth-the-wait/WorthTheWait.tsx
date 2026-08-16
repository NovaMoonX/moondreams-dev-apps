import NavButton from '@/ui/NavButton';

function WorthTheWait() {
  return (
    <div className='page flex items-center justify-center px-4 py-12'>
      <div className='w-full max-w-xl'>
        <div className='mb-6'>
          <NavButton href='/'>Back</NavButton>
        </div>

        <main className='space-y-5'>
          <p className='text-foreground/60 text-xs font-medium tracking-[0.24em] uppercase'>
            Mini app
          </p>
          <h1 className='text-foreground text-4xl font-semibold tracking-tight md:text-5xl'>
            Worth the Wait
          </h1>
          <p className='text-foreground/70 max-w-lg text-base leading-7 md:text-lg'>
            A quiet place to hold what is on your mind and in your heart until
            the right moment to share it arrives.
          </p>
        </main>
      </div>
    </div>
  );
}

export default WorthTheWait;

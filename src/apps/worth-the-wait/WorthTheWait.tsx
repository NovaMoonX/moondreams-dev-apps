import { Button } from '@moondreamsdev/dreamer-ui/components';

function WorthTheWait() {
  return (
    <div className='page flex flex-col items-center justify-center'>
      <div className='max-w-2xl space-y-6 px-4 text-center'>
        <h1 className='text-5xl font-bold md:text-6xl'>Worth the Wait</h1>
        <p className='text-foreground/80 text-lg md:text-xl'>
          A space for myself and another to drop what's on our minds and in our hearts until it's time to share
        </p>
        <div className='pt-4'>
          <Button href='/'>← Back to Home</Button>
        </div>
      </div>
    </div>
  );
}

export default WorthTheWait;

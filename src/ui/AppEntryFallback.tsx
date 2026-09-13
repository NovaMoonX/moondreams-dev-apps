import { Button } from '@moondreamsdev/dreamer-ui/components';

interface AppEntryFallbackProps {
  appName: string;
  onEnterApp: () => void;
  onBackHome: () => void;
}

function AppEntryFallback({ appName, onEnterApp, onBackHome }: AppEntryFallbackProps) {
  return (
    <div className='page relative flex min-h-[60vh] items-center justify-center pb-0!'>
      <div className='flex flex-col items-center gap-6 text-center'>
        <h1 className='text-foreground text-4xl font-semibold tracking-tight md:text-5xl'>
          {appName}
        </h1>
        <div className='flex flex-col items-center gap-3'>
          <Button onClick={onEnterApp}>Enter app</Button>
          <Button variant='link' onClick={onBackHome}>
            Back home
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AppEntryFallback;

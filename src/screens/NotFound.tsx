import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Link } from 'react-router-dom';

function NotFound() {
  return (
    <div className='page flex items-center justify-center px-4 py-12'>
      <div className='w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm'>
        <p className='text-foreground/60 text-xs font-medium tracking-[0.24em] uppercase'>404</p>
        <h1 className='text-foreground mt-4 text-3xl font-semibold tracking-tight'>Page not found</h1>
        <p className='text-foreground/70 mt-3 text-base'>The page you were looking for does not exist.</p>

        <div className='mt-6 flex justify-center'>
          <Link to='/'>
            <Button>Back home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default NotFound;

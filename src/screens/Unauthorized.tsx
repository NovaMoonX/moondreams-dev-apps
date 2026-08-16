import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Link } from 'react-router-dom';

function Unauthorized() {
  return (
    <div className='page flex items-center justify-center px-4 py-12'>
      <div className='w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm'>
        <p className='text-foreground/60 text-xs font-medium tracking-[0.24em] uppercase'>Access denied</p>
        <h1 className='text-foreground mt-4 text-3xl font-semibold tracking-tight'>You do not have access to this area.</h1>
        <p className='text-foreground/70 mt-3 text-base'>This app or dashboard is restricted to authorized users only.</p>

        <div className='mt-6 flex justify-center'>
          <Link to='/'>
            <Button>Return home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Unauthorized;

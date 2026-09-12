import { join } from '@moondreamsdev/dreamer-ui/utils';

interface AuthRequiredStateProps {
  title?: string;
  message?: string;
  className?: string;
}

function AuthRequiredState({
  title = 'Authentication required',
  message = 'Please sign in to continue.',
  className,
}: AuthRequiredStateProps) {
  return (
    <div className={join('page', 'pt-20', className)}>
      <div className='mx-auto max-w-xl rounded-lg border border-border bg-card p-6'>
        <p className='text-muted-foreground text-sm uppercase tracking-[0.2em]'>
          {title}
        </p>
        <h1 className='mt-3 text-2xl font-semibold'>Sign in required</h1>
        <p className='mt-3 text-muted-foreground text-sm'>{message}</p>
      </div>
    </div>
  );
}

export default AuthRequiredState;

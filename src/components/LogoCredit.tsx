import { join } from '@moondreamsdev/dreamer-ui/utils';

interface LogoCreditProps {
  /** What the logos are of ("Store logos", "Bank logos"). */
  subject: string;
  className?: string;
}

/** The credit the logo service asks for wherever its logos are shown: a visible link back, and that the marks stay their owners'. */
function LogoCredit({ subject, className }: LogoCreditProps) {
  return (
    <p className={join('text-muted-foreground text-xs text-pretty', className)}>
      {subject} by{' '}
      <a
        href='https://logo.dev'
        target='_blank'
        rel='noreferrer'
        className='underline underline-offset-2'
      >
        Logo.dev
      </a>
      . They remain their owners' trademarks.
    </p>
  );
}

export default LogoCredit;

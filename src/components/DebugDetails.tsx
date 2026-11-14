import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import CopyTextButton from '@components/CopyTextButton';
import { SITE_VERSION } from '@lib/app';
import { useCanSeeDebugDetails } from '@lib/debugProfiles/useCanSeeDebugDetails';

interface DebugDetailsProps {
  /** The one line that says what failed, in the browser's own words. */
  message: string;
  /** Short facts read beside the failure (a permission, a device), one per line. */
  facts?: string[];
  /** A long trace, folded behind its own toggle. */
  trace?: { label: string; text: string } | null;
  title?: string;
  /** Starts unfolded, where the failure is the whole screen (a crash). */
  isOpen?: boolean;
  className?: string;
}

/** What went wrong, with Copy error. Debug viewers only: local builds, the admin and listed debug emails. */
function DebugDetails({
  message,
  facts = [],
  trace = null,
  title = 'Error details',
  isOpen = false,
  className,
}: DebugDetailsProps) {
  const canSee = useCanSeeDebugDetails();
  const { pathname } = useLocation();
  if (!canSee) return null;

  const copyText = [
    message,
    facts.join('\n'),
    trace?.text,
    `Page: ${pathname}`,
    `Version: ${SITE_VERSION}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return (
    <section
      className={join('bg-foreground/5 relative rounded-xl text-left', className)}
    >
      <details className='group/debug' open={isOpen}>
        <summary className='text-muted-foreground flex min-h-10 cursor-pointer list-none items-center gap-1 py-1.5 pr-12 pl-3 text-xs font-medium [&::-webkit-details-marker]:hidden'>
          <ChevronRight
            className='size-3.5 transition-transform group-open/debug:rotate-90'
            aria-hidden='true'
          />
          {title}
        </summary>
        <div className='space-y-2 px-3 pb-3'>
          <p className='text-foreground font-mono text-xs leading-relaxed wrap-break-word'>
            {message}
          </p>
          {facts.length > 0 && (
            <ul className='text-muted-foreground space-y-0.5 font-mono text-xs leading-relaxed wrap-break-word'>
              {facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          )}
          {trace && (
            <details className='group/trace'>
              <summary className='text-muted-foreground flex cursor-pointer list-none items-center gap-1 text-xs [&::-webkit-details-marker]:hidden'>
                <ChevronRight
                  className='size-3.5 transition-transform group-open/trace:rotate-90'
                  aria-hidden='true'
                />
                {trace.label}
              </summary>
              <pre className='text-muted-foreground mt-2 max-h-48 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap'>
                {trace.text}
              </pre>
            </details>
          )}
        </div>
      </details>
      <div className='absolute top-0.5 right-1'>
        <CopyTextButton
          isIconOnly
          variant='tertiary'
          label='Copy error'
          text={copyText}
        />
      </div>
    </section>
  );
}

export default DebugDetails;

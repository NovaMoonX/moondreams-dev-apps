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
  className?: string;
}

/** What went wrong, for the people who can see it (local builds, the admin and listed debug emails), with Copy so it can be passed on from a phone with no console. Draws nothing for anyone else. */
function DebugDetails({
  message,
  facts = [],
  trace = null,
  title = 'Error details',
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
      className={join(
        'border-border bg-muted/50 rounded-xl border text-left',
        className,
      )}
    >
      <div className='border-border flex items-center justify-between gap-2 border-b py-1.5 pr-1.5 pl-3'>
        <h2 className='text-muted-foreground text-xs font-medium'>{title}</h2>
        <CopyTextButton
          isIconOnly
          variant='tertiary'
          label='Copy error'
          text={copyText}
        />
      </div>
      <div className='space-y-2 p-3'>
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
          <details className='group'>
            <summary className='text-muted-foreground flex cursor-pointer list-none items-center gap-1 text-xs [&::-webkit-details-marker]:hidden'>
              <ChevronRight
                className='size-3.5 transition-transform group-open:rotate-90'
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
    </section>
  );
}

export default DebugDetails;

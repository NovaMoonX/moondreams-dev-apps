import { useEffect, useRef } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Trash2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import CopyTextButton from '@components/CopyTextButton';
import { useTurnLog } from '@hooks/useTurnLog';
import { SITE_VERSION } from '@lib/app';
import { useCanSeeDebugDetails } from '@lib/debugProfiles/useCanSeeDebugDetails';
import {
  clearTurnLog,
  describeRunning,
  formatTurnLog,
  type TurnLogRunning,
} from '@lib/speech/turnLog';

interface TurnLogViewProps {
  /** What the screen knows that the events don't say, one per line ("Sage: on"), shown under Running. */
  facts?: string[];
  /** What is expected to run, for before the events have said what did. */
  expected: TurnLogRunning;
  className?: string;
}

/** The conversation log as the text that Copy puts on the clipboard, newest last, with Clear. Debug viewers only. */
function TurnLogView({ facts = [], expected, className }: TurnLogViewProps) {
  const canSee = useCanSeeDebugDetails();
  const { pathname } = useLocation();
  const entries = useTurnLog();
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [entries.length]);
  if (!canSee) return null;

  const running = [...describeRunning(entries, expected), ...facts];
  const copyText = formatTurnLog(entries, [
    `Version: ${SITE_VERSION}`,
    `Page: ${pathname}`,
    `Browser: ${navigator.userAgent}`,
    'Running:',
    ...running.map((line) => `  ${line}`),
    '',
  ]);

  return (
    <section className={className}>
      <div className='mb-2 flex items-center justify-between gap-2'>
        <CopyTextButton
          isCompact
          variant='secondary'
          label='Copy log'
          text={copyText}
        />
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          rounded='full'
          className="text-muted-foreground! relative h-8 gap-1 px-3! text-[13px] after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']"
          disabled={entries.length === 0}
          onClick={clearTurnLog}
        >
          <Trash2 className='h-3.5 w-3.5' aria-hidden='true' />
          Clear
        </Button>
      </div>
      <p className='text-muted-foreground mb-1 text-xs font-medium'>Running</p>
      <ul className='bg-foreground/5 mb-2 space-y-0.5 rounded-xl p-3 text-xs'>
        {running.map((line) => (
          <li key={line} className='text-foreground wrap-break-word'>
            {line}
          </li>
        ))}
      </ul>
      <div
        ref={scroller}
        className='bg-foreground/5 max-h-[50vh] overflow-auto rounded-xl p-3'
      >
        <pre className='text-foreground font-mono text-[11px] leading-relaxed wrap-break-word whitespace-pre-wrap'>
          {formatTurnLog(entries)}
        </pre>
      </div>
    </section>
  );
}

export default TurnLogView;

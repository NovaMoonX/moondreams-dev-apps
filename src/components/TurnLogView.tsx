import { useEffect, useRef } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
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
  /** What the screen knows that the events don't say, one per line ("Pepper: on"), shown under Running. */
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
          className='h-8 px-3 text-[13px]'
          disabled={entries.length === 0}
          onClick={clearTurnLog}
        >
          Clear
        </Button>
      </div>
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

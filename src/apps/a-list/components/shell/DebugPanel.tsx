// TEMPORARY: on-screen diagnostics for one account. Remove with aListDebug.ts.
import { useEffect, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { db } from '@/lib/firebase/config';
import { useAppSelector } from '@/store';
import { resetFirestoreCache, runServerCheck, useAListDebugEntries } from '@apps/a-list/debug/aListDebug';

interface DebugPanelProps {
  uid: string;
  email: string | null;
}

function DebugPanel({ uid, email }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const entries = useAListDebugEntries();

  useEffect(() => {
    runServerCheck(uid);
  }, [uid]);

  const flags = useAppSelector((state) =>
    [
      `membership loaded=${state.aList.membership.isLoaded} has=${state.aList.membership.membership !== null} err=${state.aList.membership.loadError}`,
      `watchlist loaded=${state.aList.watchlist.isLoaded} err=${state.aList.watchlist.loadError}`,
      `viewings n=${state.aList.viewings.items.length} loaded=${state.aList.viewings.isLoaded} err=${state.aList.viewings.loadError}`,
      `theatres loaded=${state.aList.theatres.isLoaded} err=${state.aList.theatres.loadError}`,
    ].join('\n'),
  );

  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  const info = [
    `uid=${uid}`,
    `email=${email}`,
    `project=${db.app.options.projectId}`,
    `origin=${window.location.origin}`,
    `online=${navigator.onLine} standalone=${standalone}`,
  ].join('\n');

  return (
    <div className='fixed inset-x-0 bottom-0 z-[9999] p-2'>
      <Button
        type='button'
        size='sm'
        variant='secondary'
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? 'Hide debug' : 'Show debug'}
      </Button>
      <Button
        type='button'
        size='sm'
        variant='secondary'
        className='ml-2'
        onClick={() => runServerCheck(uid)}
      >
        Re-check server
      </Button>
      <Button
        type='button'
        size='sm'
        variant='secondary'
        className='ml-2'
        onClick={() => resetFirestoreCache()}
      >
        Reset cache
      </Button>
      {isOpen && (
        <div className='bg-background text-foreground border-border mt-1 max-h-[45vh] overflow-y-auto rounded-lg border p-2 font-mono text-[10px] leading-tight break-all whitespace-pre-wrap'>
          {info}
          {'\n---\n'}
          {flags}
          {'\n---\n'}
          {entries.join('\n')}
        </div>
      )}
    </div>
  );
}

export default DebugPanel;

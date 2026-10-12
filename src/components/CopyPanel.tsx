import { useState } from 'react';

import { Button, CopyButton } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft } from 'lucide-react';

import { copyToClipboard } from '@/utils/clipboardUtils';

interface CopyPanelProps {
  text: string;
  /** One sentence on what the copy carries and leaves out. */
  note: string;
  onBack?: () => void;
}

/** A read-only preview of text bound for the clipboard, with what it includes and one Copy button. */
function CopyPanel({ text, note, onBack }: CopyPanelProps) {
  const [result, setResult] = useState<'copied' | 'failed' | null>(null);

  const handleCopy = async () => {
    const copied = await copyToClipboard(text);
    setResult(copied ? 'copied' : 'failed');
  };

  return (
    <div className='space-y-4'>
      {onBack && (
        <Button
          type='button'
          variant='tertiary'
          className='h-10 gap-1 px-0!'
          onClick={onBack}
        >
          <ChevronLeft className='h-4 w-4' aria-hidden='true' />
          Back
        </Button>
      )}
      <pre
        role='region'
        tabIndex={0}
        aria-label='Text that will be copied'
        className='bg-muted/50 border-border max-h-[max(10rem,calc(92dvh-30rem))] overflow-y-auto rounded-2xl border p-3 text-sm break-words whitespace-pre-wrap'
      >
        {text}
      </pre>
      <p className='text-muted-foreground text-sm'>{note}</p>
      {result === 'failed' && (
        <p role='alert' className='text-destructive text-sm'>
          Your browser wouldn't let us copy. Select the text above and copy it
          by hand.
        </p>
      )}
      {result === 'copied' && (
        <p role='status' className='text-muted-foreground text-sm'>
          Copied. Paste it into your chat.
        </p>
      )}
      <CopyButton
        textToCopy={text}
        variant='primary'
        size='lg'
        className='h-11 w-full'
        onClick={() => void handleCopy()}
      >
        Copy
      </CopyButton>
    </div>
  );
}

export default CopyPanel;

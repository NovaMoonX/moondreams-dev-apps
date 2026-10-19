import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, Copy } from 'lucide-react';

import { copyToClipboard } from '@/utils/clipboardUtils';

const COPIED_MS = 2000;

interface CopyTextButtonProps {
  text: string;
  label: string;
  copiedLabel?: string;
  variant?: 'primary' | 'secondary';
  className?: string;
  /** Runs when the browser refuses the copy, so the caller can say how to copy it by hand. */
  onFailed?: () => void;
}

/** Copies text, with the clipboard fallback for plain-HTTP pages, and says "Copied" on the button itself for two seconds. */
function CopyTextButton({
  text,
  label,
  copiedLabel = 'Copied',
  variant = 'primary',
  className,
  onFailed,
}: CopyTextButtonProps) {
  const [isCopied, setIsCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const handleClick = async () => {
    const didCopy = await copyToClipboard(text);
    if (!didCopy) {
      onFailed?.();
      return;
    }
    setIsCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setIsCopied(false), COPIED_MS);
  };

  return (
    <Button
      type='button'
      variant={variant}
      className={join('gap-1.5', className)}
      onClick={() => void handleClick()}
    >
      {isCopied ? (
        <Check className='h-4 w-4' aria-hidden='true' />
      ) : (
        <Copy className='h-4 w-4' aria-hidden='true' />
      )}
      <span aria-live='polite'>{isCopied ? copiedLabel : label}</span>
    </Button>
  );
}

export default CopyTextButton;

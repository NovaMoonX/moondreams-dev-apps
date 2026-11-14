import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, Copy } from 'lucide-react';

import { copyToClipboard } from '@/utils/clipboardUtils';

const COPIED_MS = 2000;

/** A button whose words match the 13px text it acts on. */
export const COMPACT_BUTTON_CLASS =
  "relative h-8 gap-1 px-3 text-[13px] after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']";

interface CopyTextButtonProps {
  text: string;
  label: string;
  copiedLabel?: string;
  variant?: 'primary' | 'secondary' | 'tertiary';
  /** Shows only the icon (the check once copied); `label` stays as its accessible name. */
  isIconOnly?: boolean;
  /** Sized to sit under 13px text, with a 40px hit area kept by a pseudo-element. */
  isCompact?: boolean;
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
  isIconOnly = false,
  isCompact = false,
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
      className={join(
        'gap-1.5',
        isIconOnly &&
          "relative h-7 w-7 shrink-0 p-0! after:absolute after:-inset-1.5 after:content-['']",
        isCompact && !isIconOnly && COMPACT_BUTTON_CLASS,
        className,
      )}
      title={isIconOnly ? label : undefined}
      onClick={(event) => {
        event.stopPropagation();
        void handleClick();
      }}
    >
      {isCopied ? (
        <Check
          className={join(
            'h-4 w-4',
            (isIconOnly || isCompact) && 'h-3.5 w-3.5',
          )}
          aria-hidden='true'
        />
      ) : (
        <Copy
          className={join(
            'h-4 w-4',
            (isIconOnly || isCompact) && 'h-3.5 w-3.5',
          )}
          aria-hidden='true'
        />
      )}
      <span aria-live='polite' className={isIconOnly ? 'sr-only' : undefined}>
        {isCopied ? copiedLabel : label}
      </span>
    </Button>
  );
}

export default CopyTextButton;

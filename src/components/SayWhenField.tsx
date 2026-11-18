import { useEffect, useId, useRef, useState } from 'react';

import { Input } from '@moondreamsdev/dreamer-ui/components';

interface SayWhenFieldProps {
  label: string;
  placeholder: string;
  /** Said once the text can't be read. */
  unreadLine: string;
  /** Fills the form from the words and returns the plain-words read-back with `key`, a signature of the fields it filled as they now stand; null when it read nothing (and then changes nothing). */
  onRead: (text: string) => { words: string; key: string } | null;
  /** The same signature of the filled fields as they stand now: the read-back hides once it differs. */
  currentKey: string;
  className?: string;
  autoFocus?: boolean;
}

const PAUSE_MS = 500;

/** A typed line that fills a form's date and repeat fields after a short pause and reads back what it understood; the fields stay editable. */
function SayWhenField({
  label,
  placeholder,
  unreadLine,
  onRead,
  currentKey,
  className,
  autoFocus,
}: SayWhenFieldProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [line, setLine] = useState<{
    words: string;
    isRead: boolean;
    key: string | null;
  } | null>(null);
  const timer = useRef<number | null>(null);
  const read = useRef(onRead);

  useEffect(() => {
    read.current = onRead;
  });

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const change = (next: string) => {
    setText(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (next.trim() === '') {
      setLine(null);
      return;
    }
    timer.current = window.setTimeout(() => {
      const result = read.current(next.trim());
      setLine(
        result === null
          ? { words: unreadLine, isRead: false, key: null }
          : { ...result, isRead: true },
      );
    }, PAUSE_MS);
  };

  const shown =
    line && (line.key === null || line.key === currentKey) ? line : null;

  return (
    <div className='space-y-1.5'>
      <label htmlFor={id} className='text-sm font-medium'>
        {label}
      </label>
      <Input
        id={id}
        variant='outline'
        className={className}
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => change(event.target.value)}
      />
      <p
        aria-live='polite'
        className={
          shown?.isRead
            ? 'min-h-5 text-[13px] text-pretty'
            : 'text-muted-foreground min-h-5 text-[13px] text-pretty'
        }
      >
        {shown?.words}
      </p>
    </div>
  );
}

export default SayWhenField;

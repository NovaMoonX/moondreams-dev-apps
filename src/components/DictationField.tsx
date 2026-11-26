import {
  useEffect,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import { Button, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ArrowUp, LoaderCircle, Mic, Square } from 'lucide-react';

import VoiceWave from '@/components/VoiceWave';
import type { Dictation } from '@/hooks/useDictation';

const ROUND_BUTTON =
  "relative size-9 shrink-0 before:absolute before:-inset-0.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

interface DictationFieldProps {
  dictation: Dictation;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** The box's Enter key (a computer's), which the caller decides how to treat. */
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  ariaLabel: string;
  maxLength: number;
  /** Something is happening with what was sent; the box and mic are held and Send shows it. */
  isBusy: boolean;
  /** Drawn at the start of the row while the person talks or the words are being written, such as the assistant's face. */
  leading?: ReactNode;
  copy: {
    micLabel: string;
    stopLabel: string;
    sendLabel: string;
    listening: string;
    formatting: string;
    nothingHeard: string;
    listenFailed: string;
    didNotFit: string;
  };
}

/** A chat-style box that can be spoken into: while the person talks the row is a live wave and Stop (no words), a brief spinner follows while the words are formatted, then they land in the box after what is typed, to read, fix and send; the mic shows whenever the box is idle. The placeholder shows whenever the box is empty and idle. */
function DictationField({
  dictation,
  value,
  onChange,
  onSend,
  onKeyDown,
  fieldRef,
  placeholder,
  ariaLabel,
  maxLength,
  isBusy,
  leading,
  copy,
}: DictationFieldProps) {
  const { phase, landed } = dictation;
  const isIdle = phase === 'idle';

  useEffect(() => {
    if (landed === 0) return;
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [landed, fieldRef]);

  const notes = {
    nothing: copy.nothingHeard,
    failed: copy.listenFailed,
    cut: copy.didNotFit,
  };
  const note = dictation.note === null ? null : notes[dictation.note];

  return (
    <>
      <div
        className={join(
          'border-border bg-background focus-within:border-foreground/60 focus-within:ring-primary/25 relative flex gap-1.5 rounded-3xl border p-1.5 pl-3 focus-within:ring-2',
          isIdle ? 'items-end' : 'items-center',
        )}
      >
        {!isIdle && leading}
        {phase === 'listening' && (
          <>
            <VoiceWave
              getLevel={dictation.getLevel}
              className='flex-1 justify-center'
            />
            <span role='status' className='sr-only absolute'>
              {copy.listening}
            </span>
            <Button
              type='button'
              variant='secondary'
              size='icon'
              rounded='full'
              className={ROUND_BUTTON}
              aria-label={copy.stopLabel}
              onClick={dictation.stop}
            >
              <Square className='h-3.5 w-3.5 fill-current' aria-hidden='true' />
            </Button>
          </>
        )}
        {phase === 'formatting' && (
          <p
            role='status'
            className='text-muted-foreground flex min-h-9 flex-1 items-center gap-2 text-sm'
          >
            <LoaderCircle
              className='size-4 shrink-0 motion-safe:animate-spin'
              aria-hidden='true'
            />
            {copy.formatting}
          </p>
        )}
        <Textarea
          ref={fieldRef}
          rows={1}
          variant='base'
          aria-label={ariaLabel}
          placeholder={placeholder}
          maxLength={maxLength}
          value={value}
          disabled={isBusy}
          className={join(
            'placeholder:text-muted-foreground! min-h-9 flex-1 resize-none bg-transparent px-0! py-2 text-sm placeholder:truncate focus:outline-none',
            !isIdle && 'hidden',
          )}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {isIdle && dictation.canListen && (
          <Button
            type='button'
            variant='tertiary'
            size='icon'
            rounded='full'
            className={ROUND_BUTTON}
            aria-label={copy.micLabel}
            disabled={isBusy}
            onClick={dictation.start}
          >
            <Mic className='h-4 w-4' aria-hidden='true' />
          </Button>
        )}
        {isIdle && (
          <Button
            type='button'
            size='icon'
            rounded='full'
            className={ROUND_BUTTON}
            aria-label={copy.sendLabel}
            loading={isBusy}
            disabled={isBusy || value.trim() === ''}
            onClick={onSend}
          >
            <ArrowUp className='h-4 w-4' aria-hidden='true' />
          </Button>
        )}
      </div>
      {note !== null && isIdle && (
        <p className='text-muted-foreground px-3 text-xs' role='status'>
          {note}
        </p>
      )}
    </>
  );
}

export default DictationField;

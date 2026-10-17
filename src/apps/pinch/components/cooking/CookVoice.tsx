import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown, Mic } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';

import ModalFooterActions from '@/components/ModalFooterActions';
import { ViewOptionSwitch } from '@/components/ViewOptions';
import { useSheetHistory } from '@/hooks/useBackHistory';
import type { SpeechCommandsError } from '@/hooks/useSpeechCommands';
import type { CookVoice } from '@apps/pinch/hooks/useCookVoice';

/** Why voice control stopped by itself: one line for the footer, and the whole cause with what to do for the explainer that a tap on the mic opens (none for a pause, which a tap simply ends). */
const STOP_TEXT: Record<
  SpeechCommandsError,
  { line: string; detail: string | null }
> = {
  denied: {
    line: 'The microphone is blocked.',
    detail:
      'Your browser blocked the microphone. Allow it in the browser’s settings for this site, then tap Turn on.',
  },
  service: {
    line: 'Your browser’s speech service is off.',
    detail:
      'Your browser’s speech service is off. In Safari, turn on Siri or Dictation in the device’s settings.',
  },
  'no-microphone': {
    line: 'No microphone found.',
    detail: 'No microphone was found. Connect one, then tap Turn on.',
  },
  unavailable: {
    line: 'Voice control stopped: no answer.',
    detail:
      'Your browser’s speech service stopped answering. Some browsers have none; others need a connection.',
  },
  language: {
    line: 'Voice control can’t listen in English here.',
    detail: 'Your browser can’t listen in English here.',
  },
  idle: {
    line: 'Voice paused. Tap the mic to start it again.',
    detail: null,
  },
};

interface CookVoiceButtonProps {
  voice: CookVoice;
}

/** The microphone at the end of the cooking screen's title row: one tap turns voice control on or off. */
export function CookVoiceButton({ voice }: CookVoiceButtonProps) {
  const isListening = voice.status === 'listening';

  return (
    <Button
      type='button'
      variant='secondary'
      size='icon'
      rounded='full'
      aria-label='Voice control'
      aria-pressed={voice.isOn}
      className={join(
        "relative size-8 shrink-0 after:absolute after:-inset-1 after:content-['']",
        voice.isOn &&
          'border border-[var(--pinch-drizzle)]! bg-[var(--pinch-drizzle-soft)]! text-[var(--pinch-drizzle)]!',
      )}
      onClick={voice.toggle}
    >
      {isListening && (
        <span
          aria-hidden='true'
          className='pointer-events-none absolute -inset-1 animate-pulse rounded-full border-2 border-[var(--pinch-drizzle)] motion-reduce:animate-none'
        />
      )}
      <Mic
        className={join('h-4 w-4', voice.isOn && 'fill-current')}
        aria-hidden='true'
      />
    </Button>
  );
}

interface DisclosureLineProps {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
}

/** A quiet line that opens more in place, under what matters first. */
function DisclosureLine({ label, isOpen, onToggle }: DisclosureLineProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='text-muted-foreground! h-10 w-full justify-between gap-2 px-0! text-left text-sm font-normal'
      aria-expanded={isOpen}
      onClick={onToggle}
    >
      <span className='min-w-0 flex-1 truncate'>{label}</span>
      <ChevronDown
        className={join(
          'h-4 w-4 shrink-0 transition-transform',
          isOpen && 'rotate-180',
        )}
        aria-hidden='true'
      />
    </Button>
  );
}

/** Puts focus on `target` once a modal has opened, after the modal's own focus lands on its first control (the disclosure line, which isn't the place to start). */
const useFocusOnOpen = (
  isOpen: boolean,
  target: RefObject<HTMLButtonElement | null>,
) =>
  useEffect(() => {
    if (!isOpen) return;
    const timeoutId = window.setTimeout(() => target.current?.focus(), 80);
    return () => window.clearTimeout(timeoutId);
  }, [isOpen, target]);

/** The first commands as rows, what to say then what it does; two to a row on a phone held sideways, so they fit without scrolling. */
function CommandRows({ rows }: { rows: [string, string][] }) {
  return (
    <div className='grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5 [@media(max-height:500px)]:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]'>
      {rows.map(([phrase, result]) => (
        <div key={phrase} className='contents'>
          <span className='font-medium whitespace-nowrap'>“{phrase}”</span>
          <span className='text-muted-foreground'>{result}</span>
        </div>
      ))}
    </div>
  );
}

const PINNED_FOOTER =
  'bg-popover sticky bottom-0 -mx-6 -mb-6 rounded-b-lg px-6 pt-2 pb-4';

interface CookVoiceHelpProps {
  voice: CookVoice;
  /** An ingredient this step uses, for the "how much" example. */
  ingredientExample: string;
  /** Another dish on the plate, for the "switch to" example; null for one recipe. */
  dishExample: string | null;
}

/** "What to say": the commands that matter in the middle of a step, the rest one tap away, and the Read steps aloud setting. */
function CookVoiceHelp({
  voice,
  ingredientExample,
  dishExample,
}: CookVoiceHelpProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMoreShown, setIsMoreShown] = useState(false);
  const doneRef = useRef<HTMLButtonElement>(null);
  const { dialogId, onDialogClose } = useSheetHistory(isOpen, () =>
    setIsOpen(false),
  );
  useFocusOnOpen(isOpen, doneRef);
  const firstRows: [string, string][] = [
    ['next', 'Next step'],
    ['back', 'Step before'],
    ['repeat', 'Reads it aloud'],
    ['start the timer', 'Starts its timer'],
    [`how much ${ingredientExample}`, 'Says the amount'],
  ];
  const moreGroups: { label: string; rows: [string, string][] }[] = [
    {
      label: 'Views',
      rows: [
        ['ingredients', 'Shows the ingredient list'],
        ['steps', 'Back to the steps'],
      ],
    },
    {
      label: 'Timers',
      rows: [
        ['start the ten minute timer', 'Starts the timer of that length'],
        ['pause', 'Pauses the timer'],
        ['resume', 'Starts it again'],
        ['dismiss', 'Silences a timer that rang'],
        ['stop the timer', 'Pauses it, then resets it'],
        ['how much time is left', 'Says the time left'],
      ],
    },
    ...(dishExample === null
      ? []
      : [
          {
            label: 'Dishes',
            rows: [
              [`switch to ${dishExample}`, 'Shows that dish'],
              ['next recipe', 'Shows the next dish'],
            ] as [string, string][],
          },
        ]),
    { label: 'Voice control', rows: [['stop listening', 'Turns it off']] },
  ];

  return (
    <>
      <Button
        type='button'
        variant='link'
        size='sm'
        className="relative inline! h-auto! min-h-0! shrink-0 p-0! align-baseline text-xs whitespace-nowrap underline after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']"
        onClick={() => {
          setIsMoreShown(false);
          setIsOpen(true);
        }}
      >
        What to say
      </Button>
      <Modal
        id={dialogId}
        isOpen={isOpen}
        onClose={onDialogClose}
        title='Voice control'
        className='border-border border'
      >
        <div className='space-y-3 text-left text-sm'>
          <CommandRows rows={firstRows} />
          <DisclosureLine
            label='More commands'
            isOpen={isMoreShown}
            onToggle={() => setIsMoreShown((current) => !current)}
          />
          {isMoreShown && (
            <div className='space-y-3'>
              {moreGroups.map((group) => (
                <section key={group.label} className='space-y-1'>
                  <h3 className='text-muted-foreground text-xs'>
                    {group.label}
                  </h3>
                  <ul className='space-y-1'>
                    {group.rows.map(([phrase, result]) => (
                      <li key={phrase}>
                        <span className='font-medium'>“{phrase}”</span>{' '}
                        <span className='text-muted-foreground'>
                          · {result}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          <div className='border-border border-t'>
            <ViewOptionSwitch
              label='Read steps aloud'
              description='Reads each step aloud as it appears.'
              checked={voice.isReadingAloud}
              onCheckedChange={voice.setIsReadingAloud}
            />
          </div>
          <div
            className={join(
              PINNED_FOOTER,
              'flex justify-end',
              isMoreShown && 'border-border border-t',
            )}
          >
            <Button
              ref={doneRef}
              type='button'
              rounded='full'
              onClick={() => setIsOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

interface CookVoiceLineProps extends CookVoiceHelpProps {
  className?: string;
}

/** One line over the cooking footer's buttons: while voice control is on, what to say (or what it last heard or answered) with the door to the full list; after it stops by itself, why, for a few seconds. */
export function CookVoiceLine({ className, ...props }: CookVoiceLineProps) {
  const { voice, ingredientExample } = props;

  if (!voice.isOn) {
    return voice.shownError === null ? null : (
      <div
        className={join(
          'flex min-h-6 items-center [@media(max-height:500px)]:self-center',
          className,
        )}
      >
        <p
          role='status'
          className='text-muted-foreground min-w-0 flex-1 truncate text-sm [@media(max-height:500px)]:line-clamp-2 [@media(max-height:500px)]:whitespace-normal'
        >
          {STOP_TEXT[voice.shownError].line}
        </p>
      </div>
    );
  }

  const { message, status } = voice;
  const isHint = message === null && status === 'listening';
  const getText = () => {
    if (message !== null) return message.text;
    if (status === 'starting') return 'Starting voice control…';
    if (status === 'speaking') return 'Reading aloud… tap Next to skip';
    return (
      <>
        <span className='text-xs sm:hidden'>
          Say “next” or “how much {ingredientExample}”
        </span>
        <span className='max-sm:hidden'>
          Say “next”, “repeat” or “how much {ingredientExample}”
        </span>
      </>
    );
  };

  return (
    <div
      className={join(
        'flex min-h-6 items-center gap-3 [@media(max-height:500px)]:self-center',
        className,
      )}
    >
      <p
        role='status'
        className={join(
          'min-w-0 flex-1 truncate text-sm [@media(max-height:500px)]:line-clamp-2 [@media(max-height:500px)]:whitespace-normal',
          isHint && '[@media(max-height:500px)]:sr-only',
          message === null || message.tone === 'HEARD'
            ? 'text-muted-foreground'
            : 'text-foreground font-medium',
        )}
      >
        {getText()}
      </p>
      <CookVoiceHelp {...props} />
    </div>
  );
}

interface CookVoiceExplainerProps {
  voice: CookVoice;
  ingredientExample: string;
}

/** What voice control does and who hears it, before the browser asks for the microphone the first time, and again (with what went wrong) after it stopped by itself: the two things that matter first, the rest under How it works. */
export function CookVoiceExplainer({
  voice,
  ingredientExample,
}: CookVoiceExplainerProps) {
  const [isDetailShown, setIsDetailShown] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useFocusOnOpen(voice.isExplainerOpen, cancelRef);
  const { dialogId, onDialogClose } = useSheetHistory(
    voice.isExplainerOpen,
    () => {
      setIsDetailShown(false);
      voice.closeExplainer();
    },
  );
  const lastStop = voice.error === null ? null : STOP_TEXT[voice.error].detail;

  return (
    <Modal
      id={dialogId}
      isOpen={voice.isExplainerOpen}
      onClose={onDialogClose}
      title='Voice control'
      className='border-border border'
    >
      <div
        className={join(
          '[&_.form-footer]:bg-popover space-y-3 text-sm [&_.form-footer]:sticky [&_.form-footer]:bottom-0 [&_.form-footer]:-mx-6 [&_.form-footer]:-mb-6 [&_.form-footer]:rounded-b-lg [&_.form-footer]:px-6 [&_.form-footer]:pt-2 [&_.form-footer]:pb-4',
          isDetailShown &&
            '[&_.form-footer]:border-border [&_.form-footer]:border-t',
        )}
      >
        {lastStop === null ? (
          <p>
            Say “next”, “back” or “how much {ingredientExample}” instead of
            tapping.
          </p>
        ) : (
          <p className='bg-muted/50 border-border rounded-xl border px-3 py-2'>
            Last time: {lastStop}
          </p>
        )}
        <p>
          Your browser will ask to use the microphone, and its speech service
          hears what you say. Pinch keeps nothing.
        </p>
        <DisclosureLine
          label='How it works'
          isOpen={isDetailShown}
          onToggle={() => setIsDetailShown((current) => !current)}
        />
        {isDetailShown && (
          <ul className='marker:text-muted-foreground list-disc space-y-1.5 pl-4'>
            <li>
              Chrome sends the audio to Google, Safari to Apple, Edge to
              Microsoft.
            </li>
            <li>It hears everyone nearby, not only you.</li>
            <li>Answers are read aloud.</li>
            <li>Read steps aloud, in What to say, reads each step too.</li>
            <li>
              Some browser voices work online, so what they read is sent too.
            </li>
            <li>
              It turns off when you leave this screen, or after 15 minutes
              without a command.
            </li>
            <li>It never finishes the cook: you tap Finish.</li>
            <li>Commands are in English for now.</li>
          </ul>
        )}
        <ModalFooterActions
          cancelAction={
            <Button
              ref={cancelRef}
              type='button'
              variant='secondary'
              onClick={() => {
                setIsDetailShown(false);
                voice.closeExplainer();
              }}
            >
              Not now
            </Button>
          }
          rightActions={
            <Button
              type='button'
              onClick={() => {
                setIsDetailShown(false);
                voice.turnOn();
              }}
            >
              Turn on
            </Button>
          }
        />
      </div>
    </Modal>
  );
}

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, ChevronDown, Ear, Hand, Lock, Mic } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';

import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { ViewOptionSwitch } from '@/components/ViewOptions';
import { useSheetHistory } from '@/hooks/useBackHistory';
import { useNow } from '@/hooks/useNow';
import { formatClock } from '@/utils/durationUtils';
import {
  COOK_LOCK_MS,
  COOK_WAKE_IDLE_MS,
  COOK_WAKE_PHRASE,
  COOK_WINDOW_MS,
} from '@apps/pinch/constants';
import type { CookVoice } from '@apps/pinch/hooks/useCookVoice';
import type { VoiceMode, VoiceStop } from '@apps/pinch/utils/cookVoiceMode';

const WINDOW_SECONDS = COOK_WINDOW_MS / 1000;
const WAIT_MINUTES = COOK_WAKE_IDLE_MS / 60_000;
const LOCK_MINUTES = COOK_LOCK_MS / 60_000;

/** Why voice control stopped by itself: one line for the footer, and the whole cause with what to do for the explainer that a tap on the mic opens (none where a tap simply starts it again). */
const STOP_TEXT: Record<VoiceStop, { line: string; detail: string | null }> = {
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
  'wake-idle': {
    line: `Mic turned off after ${WAIT_MINUTES} quiet minutes.`,
    detail: null,
  },
  'lock-ended': {
    line: `Mic turned off after ${LOCK_MINUTES} minutes.`,
    detail: null,
  },
};

type ListenChoice = VoiceMode | 'LOCK';

interface ListenRow {
  choice: ListenChoice;
  icon: ReactNode;
  title: string;
  hint: string;
}

const LISTEN_ROWS: ListenRow[] = [
  {
    choice: 'TAP',
    icon: <Hand aria-hidden='true' />,
    title: 'Tap to talk',
    hint: 'Tap the mic, then speak.',
  },
  {
    choice: 'WAKE',
    icon: <Ear aria-hidden='true' />,
    title: `Say “${COOK_WAKE_PHRASE}”`,
    hint: 'The mic stays on, waiting.',
  },
  {
    choice: 'LOCK',
    icon: <Lock aria-hidden='true' />,
    title: `Keep listening ${LOCK_MINUTES} min`,
    hint: 'No phrase. The mic stays on.',
  },
];

/** What a way of listening means for the mic, in one sentence under the choice: the two that keep it open say who hears the room. */
const LISTEN_NOTES: Record<ListenChoice, string> = {
  TAP: `It closes by itself after ${WINDOW_SECONDS} quiet seconds.`,
  WAKE: `While it waits, the mic is on and your browser’s speech service hears the room. It turns off after ${WAIT_MINUTES} quiet minutes.`,
  LOCK: `The mic is on and your browser’s speech service hears the room until the ${LOCK_MINUTES} minutes are up.`,
};

const LISTEN_PILLS: { value: VoiceMode; label: string }[] = [
  { value: 'TAP', label: 'Tap to talk' },
  { value: 'WAKE', label: `Say “${COOK_WAKE_PHRASE}”` },
];

/** The time left on the lock, counting down on its own so only this text redraws each second. */
function LockCountdown({ endsAt }: { endsAt: number }) {
  const now = useNow(1000);
  return (
    <span aria-hidden='true' className='tabular-nums'>
      {formatClock(endsAt - now)}
    </span>
  );
}

/** A ring round the mic that empties over the lock's fifteen minutes, drawn by CSS from the time that has already passed. */
function LockRing({ endsAt }: { endsAt: number }) {
  const [elapsedMs] = useState(() => COOK_LOCK_MS - (endsAt - Date.now()));
  const style = {
    animationDuration: `${COOK_LOCK_MS}ms`,
    animationDelay: `${-elapsedMs}ms`,
  } satisfies CSSProperties;

  return (
    <svg
      aria-hidden='true'
      viewBox='0 0 40 40'
      className='pointer-events-none absolute -inset-1 size-10 -rotate-90'
    >
      <circle
        cx='20'
        cy='20'
        r='18'
        pathLength='100'
        fill='none'
        strokeWidth='2.5'
        strokeLinecap='round'
        className='pinch-voice-ring stroke-[var(--pinch-drizzle)]'
        style={style}
      />
    </svg>
  );
}

interface CookVoiceButtonProps {
  voice: CookVoice;
}

/** The microphone at the end of the cooking screen's title row: one tap opens a command window, or ends whatever is open (a window, the wait for "Hey Pinch", the fifteen minutes). */
export function CookVoiceButton({ voice }: CookVoiceButtonProps) {
  const { phase } = voice;
  const isWaiting = phase === 'WAITING';
  const isHearing = voice.status === 'listening' && phase === 'WINDOW';

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
      {isHearing && (
        <span
          aria-hidden='true'
          className='pointer-events-none absolute -inset-1 animate-pulse rounded-full border-2 border-[var(--pinch-drizzle)] motion-reduce:animate-none'
        />
      )}
      {phase === 'LOCKED' && voice.lockEndsAt !== null && (
        <LockRing key={voice.lockEndsAt} endsAt={voice.lockEndsAt} />
      )}
      {isWaiting && (
        <span
          aria-hidden='true'
          className='ring-background pointer-events-none absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-[var(--pinch-drizzle)] ring-2'
        />
      )}
      <Mic
        className={join(
          'h-4 w-4',
          phase !== 'OFF' && !isWaiting && 'fill-current',
        )}
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

interface ListenRowsProps {
  voice: CookVoice;
  onChoose: (choice: ListenChoice) => void;
  selected: ListenChoice;
}

/** The three ways the mic can listen, as rows with one chosen: a tap on a row changes it at once. On the narrowest phones the icon chip goes, so a row keeps one line for its title and one for its hint; held sideways the rows sit three across. */
function ListenRows({ voice, onChoose, selected }: ListenRowsProps) {
  return (
    <div
      role='group'
      aria-label='How it listens'
      className='grid gap-2 [@media(max-height:500px)]:grid-cols-3'
    >
      {LISTEN_ROWS.map((row) => {
        const isSelected = selected === row.choice;
        const hint =
          row.choice === 'LOCK' && isSelected && voice.lockEndsAt !== null ? (
            <>
              <LockCountdown endsAt={voice.lockEndsAt} /> left
            </>
          ) : (
            row.hint
          );
        return (
          <Button
            key={row.choice}
            type='button'
            variant='tertiary'
            size='stripped'
            rounded='lg'
            aria-pressed={isSelected}
            className={join(
              'text-foreground! min-h-14 w-full justify-start gap-3 border px-3 py-2 text-left font-normal whitespace-normal',
              isSelected
                ? 'border-[var(--pinch-drizzle)]! bg-[var(--pinch-drizzle-soft)]!'
                : 'border-border hover:bg-muted',
            )}
            onClick={() => onChoose(row.choice)}
          >
            <span
              aria-hidden='true'
              className='bg-accent text-accent-foreground grid size-8 shrink-0 place-items-center rounded-full max-[360px]:hidden [&_svg]:size-4'
            >
              {row.icon}
            </span>
            <span className='min-w-0 flex-1'>
              <span className='block text-sm font-medium'>{row.title}</span>
              <span className='text-muted-foreground block text-xs'>
                {hint}
              </span>
            </span>
            <span
              aria-hidden='true'
              className={join(
                'grid size-5 shrink-0 place-items-center rounded-full border',
                isSelected
                  ? 'border-transparent bg-[var(--pinch-drizzle-fill)] text-[var(--pinch-drizzle-fill-foreground)]'
                  : 'border-muted-foreground/60',
              )}
            >
              {isSelected && <Check className='size-3' />}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

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

interface CookVoiceSheetProps {
  voice: CookVoice;
  /** An ingredient this step uses, for the "how much" example. */
  ingredientExample: string;
  /** Another dish on the plate, for the "switch to" example; null for one recipe. */
  dishExample: string | null;
}

/** The sheet the status chip opens: how the mic listens (tap to talk, wait for "Hey Pinch", or stay open for fifteen minutes) with Read steps aloud, and what to say folded under them. */
function CookVoiceSheet({
  voice,
  ingredientExample,
  dishExample,
}: CookVoiceSheetProps) {
  const [isSayShown, setIsSayShown] = useState(false);
  const [isMoreShown, setIsMoreShown] = useState(false);
  const doneRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setIsSayShown(false);
    setIsMoreShown(false);
    voice.closeSheet();
  };
  const { dialogId, onDialogClose } = useSheetHistory(voice.isSheetOpen, close);
  useFocusOnOpen(voice.isSheetOpen, doneRef);
  const lastStop = voice.error === null ? null : STOP_TEXT[voice.error].detail;
  const selected: ListenChoice = voice.phase === 'LOCKED' ? 'LOCK' : voice.mode;
  const wakeRows: [string, string][] =
    voice.mode === 'WAKE'
      ? [[COOK_WAKE_PHRASE.toLowerCase(), 'Then say a command']]
      : [];
  const firstRows: [string, string][] = [
    ...wakeRows,
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
    <Modal
      id={dialogId}
      isOpen={voice.isSheetOpen}
      onClose={onDialogClose}
      title='Voice control'
      className='border-border border'
    >
      <div className='space-y-3 text-left text-sm'>
        {lastStop !== null && (
          <p className='bg-muted/50 border-border rounded-xl border px-3 py-2'>
            Last time: {lastStop}
          </p>
        )}
        <ListenRows voice={voice} selected={selected} onChoose={voice.choose} />
        <p className='text-muted-foreground text-xs'>
          {LISTEN_NOTES[selected]}
        </p>
        <div className='border-border grid border-t [@media(max-height:500px)]:grid-cols-2 [@media(max-height:500px)]:gap-x-6'>
          <ViewOptionSwitch
            label='Read steps aloud'
            description='Reads each step as it appears, while the mic is on.'
            checked={voice.isReadingAloud}
            onCheckedChange={voice.setIsReadingAloud}
          />
          <DisclosureLine
            label='What to say'
            isOpen={isSayShown}
            onToggle={() => {
              setIsSayShown((current) => !current);
              setIsMoreShown(false);
            }}
          />
        </div>
        {isSayShown && (
          <>
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
          </>
        )}
        <div
          className={join(
            PINNED_FOOTER,
            'flex justify-end',
            isSayShown && 'border-border border-t',
          )}
        >
          <Button ref={doneRef} type='button' rounded='full' onClick={close}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const getChipLabel = (voice: CookVoice): ReactNode => {
  if (voice.status === 'starting') return 'Starting…';
  if (voice.status === 'speaking') return 'Reading';
  if (voice.phase === 'WAITING') {
    return (
      <>
        Waiting<span className='sr-only'> for “{COOK_WAKE_PHRASE}”</span>
      </>
    );
  }
  if (voice.phase === 'LOCKED' && voice.lockEndsAt !== null) {
    return (
      <>
        <LockCountdown endsAt={voice.lockEndsAt} />
        <span className='sr-only'>Kept open</span>
      </>
    );
  }
  return 'Listening';
};

/** The state the mic is in, as a chip that opens the voice sheet: a steady dot while it waits for the phrase, a pulsing one with a bar that empties while a command window is open, a lock and the time left while it is kept open. */
function StatusChip({ voice }: { voice: CookVoice }) {
  const { phase } = voice;
  const isWindowRunning = phase === 'WINDOW' && voice.status === 'listening';
  const isReady = voice.status === 'listening' || voice.status === 'speaking';
  const barStyle = {
    '--pinch-window-ms': `${COOK_WINDOW_MS}ms`,
  } as CSSProperties;

  return (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      rounded='full'
      className={join(
        "text-foreground! relative h-6! min-h-0! shrink-0 gap-1.5 px-2.5 py-0! text-xs font-normal after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']",
        isReady && phase !== 'WAITING'
          ? 'border border-[var(--pinch-drizzle)]! bg-[var(--pinch-drizzle-soft)]!'
          : 'border-border border',
      )}
      onClick={voice.openSheet}
    >
      {isWindowRunning && (
        <span
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 overflow-hidden rounded-full'
        >
          <span
            key={voice.windowKey}
            className='pinch-voice-bar absolute inset-0 bg-[var(--pinch-drizzle)]/20'
            style={barStyle}
          />
        </span>
      )}
      <span className='relative flex items-center gap-1.5'>
        {phase === 'LOCKED' ? (
          <Lock className='h-3 w-3' aria-hidden='true' />
        ) : (
          <span
            aria-hidden='true'
            className={join(
              'size-1.5 shrink-0 rounded-full bg-[var(--pinch-drizzle)]',
              isWindowRunning && 'animate-pulse motion-reduce:animate-none',
              !isReady && 'opacity-40',
            )}
          />
        )}
        {getChipLabel(voice)}
        <span className='sr-only'>, voice options</span>
        <ChevronDown
          className='text-muted-foreground h-3 w-3 max-[340px]:hidden'
          aria-hidden='true'
        />
      </span>
    </Button>
  );
}

interface CookVoiceLineProps extends CookVoiceSheetProps {
  className?: string;
}

/** One line over the cooking footer's buttons: while the mic is on, its state as a chip (which opens the voice sheet) and what to say, or what it last heard or answered; after it stops by itself, why, for a few seconds. */
export function CookVoiceLine({ className, ...props }: CookVoiceLineProps) {
  const { voice, ingredientExample } = props;
  const sheet = <CookVoiceSheet {...props} />;

  if (!voice.isOn) {
    return (
      <>
        {voice.shownError !== null && (
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
        )}
        {sheet}
      </>
    );
  }

  const { message, status } = voice;
  const isHint = message === null && status === 'listening';
  const getText = () => {
    if (message !== null) return message.text;
    if (status === 'starting') return 'Allow the microphone if asked.';
    if (status === 'speaking') return 'Reading aloud… tap Next to skip';
    if (voice.phase === 'WAITING') {
      return (
        <>
          <span className='sm:hidden'>Say “{COOK_WAKE_PHRASE}”</span>
          <span className='max-sm:hidden'>
            Say “{COOK_WAKE_PHRASE}”, then “next” or “how much{' '}
            {ingredientExample}”
          </span>
        </>
      );
    }
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
    <>
      <div
        role='status'
        className={join(
          'flex min-h-6 items-center gap-2 [@media(max-height:500px)]:self-center',
          className,
        )}
      >
        <StatusChip voice={voice} />
        <p
          className={join(
            'min-w-0 flex-1 truncate text-sm [@media(max-height:500px)]:line-clamp-2 [@media(max-height:500px)]:whitespace-normal',
            isHint && '[@media(max-height:500px)]:sr-only',
            message === null ||
              message.tone === 'HEARD' ||
              message.tone === 'MISSED'
              ? 'text-muted-foreground'
              : 'text-foreground font-medium',
          )}
        >
          {getText()}
        </p>
      </div>
      {sheet}
    </>
  );
}

interface CookVoiceExplainerProps {
  voice: CookVoice;
  ingredientExample: string;
}

/** What voice control does and who hears it, before the browser asks for the microphone the first time, and again (with what went wrong) after it stopped by itself: the two things that matter first, how it listens, and the rest under How it works. */
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
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs'>How should it listen?</p>
          <PillGroup
            label='How should it listen?'
            options={LISTEN_PILLS}
            value={voice.mode}
            onChange={voice.chooseMode}
          />
          <p className='text-muted-foreground text-xs'>
            {LISTEN_NOTES[voice.mode]}
          </p>
        </div>
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
            <li>
              “{COOK_WAKE_PHRASE}” keeps the mic on while it waits, so the
              speech service hears the room until you turn it off. Pinch acts
              only after the phrase, and the mic turns off after {WAIT_MINUTES}{' '}
              quiet minutes.
            </li>
            <li>
              Once it is on, the chip above the buttons can keep it listening
              for {LOCK_MINUTES} minutes.
            </li>
            <li>Answers are read aloud.</li>
            <li>
              Read steps aloud, in that chip’s sheet, reads each step while the
              mic is on.
            </li>
            <li>
              Some browser voices work online, so what they read is sent too.
            </li>
            <li>It turns off when you leave this screen.</li>
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

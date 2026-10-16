import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Mic } from 'lucide-react';

import HelpTip from '@/components/HelpTip';
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
      'Your browser blocked the microphone. Allow it for this site in your browser’s settings, then tap Turn on.',
  },
  service: {
    line: 'Your browser’s speech service is off.',
    detail:
      'Your browser’s speech service is turned off, so voice control can’t listen. In Safari it needs Siri or Dictation, which you turn on in the device’s settings.',
  },
  'no-microphone': {
    line: 'No microphone found.',
    detail:
      'Your browser didn’t find a microphone. Connect one, then tap Turn on.',
  },
  unavailable: {
    line: 'Voice control stopped: no answer.',
    detail:
      'Your browser’s speech service stopped answering, so voice control turned off. Some browsers have no speech service; in others it needs a connection.',
  },
  language: {
    line: 'Voice control can’t listen in English here.',
    detail:
      'Your browser can’t listen in English here, so voice control stays off.',
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

interface CookVoiceHelpProps {
  voice: CookVoice;
  /** An ingredient this step uses, for the "how much" example. */
  ingredientExample: string;
  /** Another dish on the plate, for the "switch to" example; null for one recipe. */
  dishExample: string | null;
}

function CookVoiceHelp({
  voice,
  ingredientExample,
  dishExample,
}: CookVoiceHelpProps) {
  const groups = [
    { label: 'Steps', phrases: ['next', 'back', 'repeat'] },
    { label: 'Views', phrases: ['ingredients', 'steps'] },
    {
      label: 'Timers',
      phrases: [
        'start the timer',
        'start the ten minute timer',
        'pause',
        'resume',
        'dismiss',
        'stop the timer',
        'how much time is left',
      ],
    },
    { label: 'Amounts', phrases: [`how much ${ingredientExample}`] },
    ...(dishExample === null
      ? []
      : [
          {
            label: 'Dishes',
            phrases: [`switch to ${dishExample}`, 'next recipe'],
          },
        ]),
    { label: 'Voice', phrases: ['stop listening'] },
  ];

  return (
    <HelpTip
      title='Voice control'
      linkLabel='What to say'
      dismissLabel='Done'
      className="relative shrink-0 whitespace-nowrap after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']"
    >
      <ul className='space-y-1 text-sm [@media(max-height:500px)]:grid [@media(max-height:500px)]:grid-cols-2 [@media(max-height:500px)]:space-y-0 [@media(max-height:500px)]:gap-x-6 [@media(max-height:500px)]:gap-y-1'>
        {groups.map((group) => (
          <li
            key={group.label}
            className={join(
              'flex gap-3',
              group.label === 'Timers' &&
                '[@media(max-height:500px)]:col-span-2',
            )}
          >
            <span className='text-muted-foreground w-14 shrink-0 pt-0.5 text-xs'>
              {group.label}
            </span>
            <span className='min-w-0'>
              {group.phrases.map((phrase, at) => (
                <span key={phrase}>
                  <span className='whitespace-nowrap'>“{phrase}”</span>
                  {at < group.phrases.length - 1 && ', '}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className='border-border border-t'>
        <ViewOptionSwitch
          label='Read steps aloud'
          description='Answers are read aloud either way.'
          checked={voice.isReadingAloud}
          onCheckedChange={voice.setIsReadingAloud}
        />
      </div>
    </HelpTip>
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

/** What voice control does and who hears it, before the browser asks for the microphone the first time, and again (with what went wrong) after it stopped by itself. */
export function CookVoiceExplainer({
  voice,
  ingredientExample,
}: CookVoiceExplainerProps) {
  const { dialogId, onDialogClose } = useSheetHistory(
    voice.isExplainerOpen,
    voice.closeExplainer,
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
      <div className='space-y-3 text-sm'>
        {lastStop === null ? (
          <p>
            Say “next”, “back”, “repeat”, “start the timer” or “how much{' '}
            {ingredientExample}” instead of tapping. Answers are read aloud;
            Read steps aloud, in What to say, reads each step too.
          </p>
        ) : (
          <p className='bg-muted/50 border-border rounded-xl border px-3 py-2'>
            <strong>Last time:</strong> {lastStop}
          </p>
        )}
        <p>
          <strong>Your browser will ask to use the microphone.</strong> Its
          speech service turns all it hears into text, people nearby too: Google
          in Chrome, Apple in Safari, Microsoft in Edge. A voice reading aloud
          may send its text too. Pinch keeps nothing.
        </p>
        <p className='text-muted-foreground'>
          Off when you leave or after 10 minutes without a command. English only
          for now.
        </p>
        <ModalFooterActions
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={voice.closeExplainer}
            >
              Not now
            </Button>
          }
          rightActions={
            <Button type='button' onClick={voice.turnOn}>
              Turn on
            </Button>
          }
        />
      </div>
    </Modal>
  );
}

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Mic } from 'lucide-react';

import HelpTip from '@/components/HelpTip';
import ModalFooterActions from '@/components/ModalFooterActions';
import { ViewOptionSwitch } from '@/components/ViewOptions';
import { useSheetHistory } from '@/hooks/useBackHistory';
import type { SpeechCommandsError } from '@/hooks/useSpeechCommands';
import type { CookVoice } from '@apps/pinch/hooks/useCookVoice';

const ERROR_TEXT: Record<SpeechCommandsError, string> = {
  denied:
    "Pinch can't use the microphone. Allow the microphone for this site in your browser settings, then tap the mic again.",
  'no-microphone':
    "Your browser didn't find a microphone. Connect one, then tap the mic again.",
  unavailable:
    "Voice stopped: your browser's speech service isn't answering. Check your connection and tap the mic to try again.",
  language: "Your browser can't listen in English here, so voice is off.",
};

interface CookVoiceButtonProps {
  voice: CookVoice;
}

/** The microphone at the end of the cooking screen's title row: one tap turns voice on or off. */
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
      <Mic className='h-4 w-4' aria-hidden='true' />
    </Button>
  );
}

interface CookVoiceHelpProps {
  voice: CookVoice;
  /** An ingredient this recipe uses, for the "how much" example. */
  ingredientExample: string;
  /** Another dish on the plate, for the "switch to" example; null for one recipe. */
  dishExample: string | null;
}

function CookVoiceHelp({
  voice,
  ingredientExample,
  dishExample,
  isHidden,
}: CookVoiceHelpProps & { isHidden: boolean }) {
  const groups = [
    { label: 'Steps', phrases: ['next', 'back', 'repeat'] },
    { label: 'Views', phrases: ['ingredients', 'steps'] },
    {
      label: 'Timers',
      phrases: [
        'start the timer',
        'pause',
        'resume',
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
      title='What you can say'
      linkLabel='What to say'
      dismissLabel='Done'
      className={join(
        "relative shrink-0 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']",
        isHidden && 'hidden!',
      )}
    >
      <ul className='space-y-1.5'>
        {groups.map((group) => (
          <li key={group.label} className='flex gap-3'>
            <span className='text-muted-foreground w-16 shrink-0 pt-px text-xs'>
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
      <p className='text-muted-foreground text-xs'>
        English commands for now. On the last step, tap Finish yourself.
      </p>
      <div className='border-border border-t'>
        <ViewOptionSwitch
          label='Read steps aloud'
          description='While voice is on, each step is read out as it appears.'
          checked={voice.isReadingAloud}
          onCheckedChange={voice.setIsReadingAloud}
        />
      </div>
    </HelpTip>
  );
}

const getStatusText = (status: CookVoice['status']) => {
  if (status === 'starting') return 'Starting the mic…';
  if (status === 'speaking') return 'Reading aloud…';
  return 'Listening';
};

interface CookVoiceLineProps extends CookVoiceHelpProps {
  className?: string;
}

/** One line over the cooking footer's buttons while voice is on: what it is doing, what it last heard or answered, and what you can say. Also says once why voice stopped by itself. */
export function CookVoiceLine({ className, ...props }: CookVoiceLineProps) {
  const { voice } = props;
  const message = voice.isOn ? voice.message : null;

  if (!voice.isOn) {
    return voice.error === null ? null : (
      <p
        role='status'
        className={join('text-muted-foreground self-center text-xs', className)}
      >
        {ERROR_TEXT[voice.error]}
      </p>
    );
  }

  return (
    <div
      className={join('flex min-h-6 items-center gap-3 self-center', className)}
    >
      <p
        role='status'
        className={join(
          'min-w-0 flex-1 truncate text-sm [@media(max-height:500px)]:line-clamp-2 [@media(max-height:500px)]:whitespace-normal',
          message === null || message.tone === 'HEARD'
            ? 'text-muted-foreground'
            : 'text-foreground font-medium',
        )}
      >
        {message?.text ?? getStatusText(voice.status)}
      </p>
      <CookVoiceHelp {...props} isHidden={message !== null} />
    </div>
  );
}

interface CookVoiceExplainerProps {
  voice: CookVoice;
  ingredientExample: string;
}

/** What voice control does and who hears it, before the browser asks for the microphone the first time. */
export function CookVoiceExplainer({
  voice,
  ingredientExample,
}: CookVoiceExplainerProps) {
  const { dialogId, onDialogClose } = useSheetHistory(
    voice.isExplainerOpen,
    voice.closeExplainer,
  );

  return (
    <Modal
      id={dialogId}
      isOpen={voice.isExplainerOpen}
      onClose={onDialogClose}
      title='Voice control'
      className='border-border border'
    >
      <div className='space-y-3 text-sm'>
        <p>
          With the mic on, you can say “next”, “back”, “repeat”, “start the
          timer” or “how much {ingredientExample}” instead of tapping.
        </p>
        <p>
          <strong>Your browser will ask to use the microphone.</strong> While
          the mic is on, your browser’s speech service turns what you say into
          text: Chrome sends the audio to Google for this, Safari to Apple.
          Pinch keeps nothing.
        </p>
        <p className='text-muted-foreground'>
          Keep this screen open and on; voice stops when you leave it. English
          commands for now.
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

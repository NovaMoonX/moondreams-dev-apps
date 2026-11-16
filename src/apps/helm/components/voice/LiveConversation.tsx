import { type KeyboardEvent, useEffect, useLayoutEffect, useRef } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Mic, MicOff, X } from 'lucide-react';

import WorkingRing from '@/components/WorkingRing';
import { useFollowScroll } from '@/hooks/useFollowScroll';
import { splitIntoParagraphs } from '@/utils/proseUtils';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import MuteControl from '@apps/helm/components/voice/MuteControl';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';

const ROUND =
  "relative size-16 min-w-16 rounded-full! p-0 before:absolute before:-inset-1 before:content-['']";

const HEARD_MAX_PX = 30;
const HEARD_MIN_PX = 19;

const fitHeard = (box: HTMLElement, line: HTMLElement) => {
  const style = getComputedStyle(box);
  const room =
    box.clientHeight -
    parseFloat(style.paddingTop) -
    parseFloat(style.paddingBottom);
  const current = parseFloat(line.style.fontSize) || HEARD_MAX_PX;
  const sizes = Array.from(
    { length: current - HEARD_MIN_PX + 1 },
    (_, index) => current - index,
  );
  const fits =
    sizes.find((size) => {
      line.style.fontSize = `${size}px`;
      return line.offsetHeight <= room;
    }) ?? HEARD_MIN_PX;
  line.style.fontSize = `${fits}px`;
};

const toStatus = (
  state: string,
  isMicMuted: boolean,
  isWaiting: boolean,
): string => {
  if (isMicMuted) return HELM_COPY.liveMicMuted;
  if (isWaiting) return HELM_COPY.talkGettingReady;
  if (state === 'speaking') return HELM_COPY.liveSpeaking;
  if (state === 'thinking') return HELM_COPY.liveThinking;
  return HELM_COPY.liveListening;
};

const keepTabInside = (event: KeyboardEvent<HTMLDivElement>) => {
  const stops = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('button, [href]'),
  );
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return;
  const isLeaving = event.shiftKey
    ? document.activeElement === first ||
      document.activeElement === event.currentTarget
    : document.activeElement === last;
  if (!isLeaving) return;
  event.preventDefault();
  (event.shiftKey ? last : first).focus();
};

function LiveConversation() {
  const voice = useHelmVoiceContext();
  const name = useAssistantName();
  const dialog = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const personBlock = useRef<HTMLDivElement>(null);
  const helmBlock = useRef<HTMLDivElement>(null);
  const isHearing = voice.state === 'listening' && voice.heard !== '';
  const personLine = isHearing ? voice.heard : voice.liveSaid;
  const helmLine =
    isHearing || voice.state === 'thinking' ? '' : voice.lastLine;
  const isThinking = voice.state === 'thinking';
  const isDeviceVoice =
    voice.state === 'speaking' && voice.speakingVoice === 'device';
  const isWaiting =
    !voice.isLiveMuted && (voice.isStarting || voice.isPreparing);
  const isOpening = personLine === '' && helmLine === '' && !isThinking;
  const glow = voice.isLiveMuted
    ? 'muted'
    : isWaiting
      ? 'waiting'
      : voice.state === 'idle'
        ? 'listening'
        : voice.state;
  const wordCount = voice.heard.split(/\s+/).filter(Boolean).length;

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const line = personBlock.current;
    if (line && isHearing) fitHeard(box, line);
    else if (line) line.style.fontSize = '';
    box.scrollTop = box.scrollHeight;
  }, [personLine, isHearing, isThinking]);

  useEffect(() => {
    const box = scroller.current;
    const reply = helmBlock.current;
    if (!box || !reply) return;
    box.scrollTop =
      reply.offsetTop - parseFloat(getComputedStyle(box).paddingTop);
  }, [helmLine]);

  useFollowScroll({
    scrollerRef: scroller,
    targetRef: helmBlock,
    progress: voice.lineProgress,
    restartKey: helmLine,
  });

  return (
    <div
      ref={dialog}
      role='dialog'
      aria-modal='true'
      aria-label={HELM_COPY.liveLabel(name)}
      tabIndex={-1}
      className='helm-live-screen bg-background fixed inset-0 flex flex-col overflow-hidden outline-none'
      onKeyDown={(event) => {
        if (event.key === 'Escape') voice.endLive();
        if (event.key === 'Tab') keepTabInside(event);
      }}
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        data-glow={glow}
      >
        <span className='helm-live-halo' />
        <span className='helm-live-glow' />
        {isHearing && <span key={wordCount} className='helm-live-ripple' />}
      </div>
      <div className='relative mx-auto flex min-h-[calc(max(3rem,env(safe-area-inset-top))+2.25rem)] w-full max-w-xl shrink-0 items-center justify-between gap-3 px-6 pt-[max(3rem,env(safe-area-inset-top))]'>
        <div className='min-w-0 flex-1'>
          <p
            aria-live='polite'
            className='text-foreground/80 text-[15px] font-medium'
          >
            {isOpening || isThinking
              ? ''
              : toStatus(voice.state, voice.isLiveMuted, isWaiting)}
          </p>
          <p className='text-foreground/75 min-h-4 min-w-0 truncate text-xs'>
            {isDeviceVoice && !isOpening ? HELM_COPY.voiceUsingDevice : ''}
          </p>
        </div>
        <MuteControl shows='whileSpeaking' />
        <MuteControl shows='whileMuted' />
      </div>
      {/* A centred column that can overflow centres an inner block with my-auto, so a long line starts at the top and every word stays reachable. */}
      <div
        ref={scroller}
        className='helm-live-scroll relative mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col overflow-y-auto px-6 py-5'
      >
        {isOpening ? (
          <div className='my-auto flex flex-col items-center gap-5 pb-10 text-center'>
            <WorkingRing isWorking={isWaiting} className='text-primary'>
              <AssistantMark name={name} isHero />
            </WorkingRing>
            <p className='text-foreground/90 text-[22px] leading-snug font-medium text-pretty'>
              {voice.isLiveMuted
                ? HELM_COPY.liveMicMuted
                : isWaiting
                  ? HELM_COPY.talkGettingReady
                  : HELM_COPY.liveReady(name)}
            </p>
          </div>
        ) : (
          <div className='my-auto flex flex-col gap-5'>
            {personLine !== '' && (
              <div
                ref={personBlock}
                className={join(
                  'space-y-3 leading-snug font-medium text-pretty',
                  isHearing ? 'text-[30px]' : 'text-muted-foreground text-xl',
                )}
              >
                {splitIntoParagraphs(personLine).map((part, index) => (
                  <p key={index}>{part}</p>
                ))}
              </div>
            )}
            {isThinking && (
              <div role='status' className='flex items-center gap-3'>
                <WorkingRing isWorking className='text-primary'>
                  <AssistantMark name={name} isLarge />
                </WorkingRing>
                <span className='text-foreground/80 text-[17px]'>
                  {HELM_COPY.liveThinking}
                </span>
              </div>
            )}
            {helmLine !== '' && (
              <div
                ref={helmBlock}
                className='space-y-4 text-[26px] leading-snug text-pretty'
              >
                {splitIntoParagraphs(helmLine).map((part, index) => (
                  <p key={index}>{part}</p>
                ))}
              </div>
            )}
            {voice.note !== null && voice.note !== helmLine && (
              <p className='text-foreground/80 text-[15px]'>{voice.note}</p>
            )}
          </div>
        )}
      </div>
      <p className='text-foreground/80 relative px-6 pt-2 text-center text-[13px]'>
        {HELM_COPY.liveEndHint}
      </p>
      <div className='relative flex items-start justify-center gap-12 px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]'>
        <div className='flex flex-col items-center gap-1.5'>
          <Button
            type='button'
            variant='secondary'
            aria-label={
              voice.isLiveMuted ? HELM_COPY.liveMicOn : HELM_COPY.liveMicOff
            }
            className={ROUND}
            onClick={() => voice.setLiveMuted(!voice.isLiveMuted)}
          >
            {voice.isLiveMuted ? (
              <MicOff className='size-6' aria-hidden='true' />
            ) : (
              <Mic className='size-6' aria-hidden='true' />
            )}
          </Button>
          <span className='text-[13px] font-medium'>
            {voice.isLiveMuted ? HELM_COPY.liveMicOn : HELM_COPY.liveMicOff}
          </span>
        </div>
        <div className='flex flex-col items-center gap-1.5'>
          <Button
            type='button'
            variant='destructive'
            aria-label={HELM_COPY.liveEndLabel}
            className={ROUND}
            onClick={voice.endLive}
          >
            <X className='size-6' aria-hidden='true' />
          </Button>
          <span className='text-[13px] font-medium'>{HELM_COPY.liveEnd}</span>
        </div>
      </div>
    </div>
  );
}

export default LiveConversation;

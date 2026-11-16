import { useEffect, useState } from 'react';

import { Ear } from 'lucide-react';

import { FOLLOW_UP_MS } from '@/hooks/useVoiceConversation';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';
import type { HelmQuestion } from '@apps/helm/types';

const PHRASES_SHOWN = 3;

const quote = (words: string) => `“${words}”`;

/** Up to three things to say that answer the question, the way they read in a sentence. */
const toPhrases = (question: HelmQuestion) => {
  if (question.shape === 'yesNo') return [quote('yes'), quote('no')];
  if (question.shape !== 'pickOne' && question.shape !== 'pickSeveral') {
    return [];
  }
  const labels = question.options
    .filter((option) => option.id !== 'none' && option.id !== 'new')
    .map((option) => option.label);
  const said =
    question.shape === 'pickSeveral' && labels.length === 2
      ? [...labels, 'both']
      : labels;
  return said.slice(0, PHRASES_SHOWN).map(quote);
};

const joinOr = (items: string[]) =>
  items.length < 2
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;

interface ListeningStripProps {
  captureId: string;
  questionId: string;
  question: HelmQuestion;
}

/** Under a question said aloud: what to say while it listens, with the window draining; after it, how the wake phrase still answers. */
function ListeningStrip({
  captureId,
  questionId,
  question,
}: ListeningStripProps) {
  const voice = useHelmVoiceContext();
  const asked = voice.askedAloud;
  if (asked?.captureId !== captureId || asked.questionId !== questionId) {
    return null;
  }
  return (
    <AskedStrip
      key={asked.wakeUntil}
      question={question}
      wakeUntil={voice.canWakeAnswer ? asked.wakeUntil : null}
    />
  );
}

function AskedStrip({
  question,
  wakeUntil,
}: {
  question: HelmQuestion;
  wakeUntil: number | null;
}) {
  const voice = useHelmVoiceContext();
  const name = useAssistantName();
  const [isWakeOver, setIsWakeOver] = useState(
    () => wakeUntil === null || Date.now() >= wakeUntil,
  );
  useEffect(() => {
    if (wakeUntil === null) return;
    const id = window.setTimeout(
      () => setIsWakeOver(true),
      Math.max(0, wakeUntil - Date.now()),
    );
    return () => window.clearTimeout(id);
  }, [wakeUntil]);
  const isListening =
    !voice.isDictating &&
    (voice.isFollowUpOpen ||
      (voice.isLive && !voice.isLiveMuted && voice.state === 'listening'));
  if (!isListening && isWakeOver) return null;
  const phrases = toPhrases(question);

  return (
    <div
      className='text-muted-foreground flex w-full flex-col gap-1.5 text-[13px]'
      role='status'
    >
      <p className='flex items-start gap-1.5 text-pretty'>
        <Ear className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
        <span className='min-w-0 break-words'>
          {!isListening
            ? HELM_COPY.questionWakeToAnswer(name)
            : phrases.length > 0
              ? HELM_COPY.questionListeningFor(joinOr(phrases))
              : HELM_COPY.questionListening}
        </span>
      </p>
      {isListening && voice.isFollowUpOpen && (
        <div className='bg-border h-0.5 w-full overflow-hidden rounded-full'>
          <div
            className='helm-listen-drain bg-primary h-full w-full origin-left rounded-full'
            style={{ animationDuration: `${FOLLOW_UP_MS}ms` }}
          />
        </div>
      )}
    </div>
  );
}

/** In the hands-free screen, under the question it just said: what to say to answer it. */
export function LiveAnswerHint() {
  const voice = useHelmVoiceContext();
  const asked = voice.askedAloud;
  if (!asked || voice.isLiveMuted || voice.state !== 'listening') return null;
  const phrases = toPhrases(asked.question);
  if (phrases.length === 0) return null;
  return (
    <p role='status' className='text-foreground/80 text-[17px] text-pretty'>
      <Ear className='mr-1.5 inline size-4 align-[-2px]' aria-hidden='true' />
      {HELM_COPY.questionListeningFor(joinOr(phrases))}
    </p>
  );
}

export default ListeningStrip;

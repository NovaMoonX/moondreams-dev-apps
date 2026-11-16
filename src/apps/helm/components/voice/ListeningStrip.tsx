import { useEffect, useState } from 'react';

import { Ear } from 'lucide-react';

import { FOLLOW_UP_MS } from '@/hooks/useVoiceConversation';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';
import type { HelmQuestion } from '@apps/helm/types';

const PHRASES_SHOWN = 3;

const quote = (words: string) => `“${words}”`;

/** What to say that answers the question, the way it reads in a sentence; empty when it has no options to name. */
const toHint = (question: HelmQuestion) => {
  if (question.shape === 'yesNo') {
    return HELM_COPY.questionSay(joinOr([quote('yes'), quote('no')]));
  }
  if (question.shape !== 'pickOne' && question.shape !== 'pickSeveral') {
    return HELM_COPY.questionSayAnswer;
  }
  const labels = question.options
    .filter((option) => option.id !== 'none' && option.id !== 'new')
    .map((option) => option.label);
  if (labels.length === 0) return HELM_COPY.questionSayAnswer;
  const isSeveral = question.shape === 'pickSeveral';
  const said = isSeveral && labels.length === 2 ? [...labels, 'both'] : labels;
  const shown = said.slice(0, PHRASES_SHOWN).map(quote);
  const phrases = joinOr(
    said.length > PHRASES_SHOWN ? [...shown, HELM_COPY.questionSayMore] : shown,
  );
  return isSeveral && labels.length > 2
    ? HELM_COPY.questionSaySeveral(phrases)
    : HELM_COPY.questionSay(phrases);
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
            : HELM_COPY.questionListening(toHint(question))}
        </span>
      </p>
      {isListening && voice.isFollowUpOpen && (
        <div className='helm-listen-track bg-border h-0.5 w-full overflow-hidden rounded-full'>
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
  const hint = toHint(asked.question);
  return (
    <p role='status' className='text-foreground/80 text-[17px] text-pretty'>
      {hint.charAt(0).toUpperCase() + hint.slice(1)}
    </p>
  );
}

export default ListeningStrip;

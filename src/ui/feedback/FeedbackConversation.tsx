import { useState } from 'react';

import { Button, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import Field from '@/components/forms/Field';
import InlineNotice from '@/components/InlineNotice';
import useNow from '@/hooks/useNow';
import { CARD_CLASS } from '@/ui/siteSurface';
import { formatTimeAgo } from '@/utils/timeAgoUtils';
import { useFeedbackMessages } from '@hooks/useFeedbackMessages';
import {
  getContextPlaceName,
  KIND_EMOJI,
  KIND_LABEL,
  STATUS_EVENT_TEXT,
} from '@lib/feedback/feedbackDisplay';
import type { Feedback } from '@lib/feedback/types';

const MAX_REPLY_LENGTH = 2000;

interface FeedbackConversationProps {
  feedback: Feedback;
  /** Whose side is reading: their own replies sit on the right. */
  viewer: 'sender' | 'admin';
  onReply: (text: string) => Promise<void>;
  replyLabel: string;
  sendLabel: string;
  /** A quiet line under the reply box. */
  replyNote?: string;
}

function ContextDetails({ feedback }: { feedback: Feedback }) {
  const { context } = feedback;
  const rows = [
    ['Where', getContextPlaceName(context)],
    ['Screen', context.path],
    ['Version', context.siteVersion],
    ['Device', context.userAgent],
    ['Window', `${context.viewportWidth} × ${context.viewportHeight}`],
  ];
  return (
    <dl className='text-muted-foreground mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs'>
      {rows.map(([term, detail]) => (
        <div key={term} className='contents'>
          <dt className='font-medium'>{term}</dt>
          <dd className='min-w-0 break-all'>{detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The original message, the replies and status changes, and a reply box; the sender's inbox and the admin's feedback view share it. */
function FeedbackConversation({
  feedback,
  viewer,
  onReply,
  replyLabel,
  sendLabel,
  replyNote,
}: FeedbackConversationProps) {
  const now = useNow(60_000);
  const { messages, status } = useFeedbackMessages(feedback.id);
  const [reply, setReply] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdminView = viewer === 'admin';

  const handleSend = async () => {
    const text = reply.trim();
    if (!text) return;
    setIsSending(true);
    setError(null);
    try {
      await onReply(text);
      setReply('');
    } catch {
      setError(
        "We couldn't send that just now. Your reply is still here, so check your connection and try again.",
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className='space-y-4'>
      <div className={CARD_CLASS}>
        <div className='text-muted-foreground flex items-center gap-2 text-xs'>
          <span aria-hidden='true'>{KIND_EMOJI[feedback.kind]}</span>
          <span className='font-medium'>{KIND_LABEL[feedback.kind]}</span>
          <span aria-hidden='true'>·</span>
          <span>{formatTimeAgo(feedback.createdAt, now)}</span>
        </div>
        <p className='text-foreground mt-2 text-sm wrap-break-word whitespace-pre-wrap'>
          {feedback.text}
        </p>
        {isAdminView ? (
          <ContextDetails feedback={feedback} />
        ) : (
          <p className='text-muted-foreground mt-3 text-xs'>
            Sent from {getContextPlaceName(feedback.context)} · version{' '}
            {feedback.context.siteVersion}
          </p>
        )}
      </div>

      {status === 'loading' ? (
        <p className='text-muted-foreground text-sm'>Loading the thread…</p>
      ) : null}
      {status === 'error' ? (
        <InlineNotice tone='warning'>
          We couldn&apos;t load the replies just now.
        </InlineNotice>
      ) : null}

      <ul className='space-y-3'>
        {messages.map((message) => {
          if (message.kind === 'status') {
            return (
              <li
                key={message.id}
                className='text-muted-foreground text-center text-xs'
              >
                {message.status ? STATUS_EVENT_TEXT[message.status] : ''} ·{' '}
                {formatTimeAgo(message.createdAt, now)}
              </li>
            );
          }
          const isMine = message.isFromAdmin === isAdminView;
          return (
            <li
              key={message.id}
              className={join('flex', isMine ? 'justify-end' : 'justify-start')}
            >
              <div
                className={join(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5',
                  isMine ? 'bg-primary/10' : 'bg-muted',
                )}
              >
                <p className='text-foreground text-sm wrap-break-word whitespace-pre-wrap'>
                  {message.text}
                </p>
                <p className='text-muted-foreground mt-1 text-[11px]'>
                  {message.isFromAdmin && !isAdminView ? 'The team · ' : ''}
                  {formatTimeAgo(message.createdAt, now)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className='space-y-2'>
        <Field label={replyLabel}>
          {() => (
            <Textarea
              variant='outline'
              rows={3}
              maxLength={MAX_REPLY_LENGTH}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
            />
          )}
        </Field>
        {error ? <InlineNotice tone='warning'>{error}</InlineNotice> : null}
        <div className='flex items-center justify-between gap-3'>
          <p className='text-muted-foreground min-w-0 flex-1 text-xs'>
            {replyNote}
          </p>
          <Button
            type='button'
            size='sm'
            disabled={reply.trim().length === 0}
            loading={isSending}
            onClick={() => void handleSend()}
          >
            {sendLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default FeedbackConversation;

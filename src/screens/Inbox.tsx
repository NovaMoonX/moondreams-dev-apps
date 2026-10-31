import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, Inbox as InboxIcon } from 'lucide-react';
import { useQueryState } from 'nuqs';
import { useEffect, useRef } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import DetailSheet from '@/components/DetailSheet';
import InlineNotice from '@/components/InlineNotice';
import { SubviewHeader } from '@/components/Subview';
import useNow from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { CANVAS_CLASS, CARD_CLASS, LIST_CARD_CLASS } from '@/ui/siteSurface';
import { formatTimeAgo } from '@/utils/timeAgoUtils';
import { useAuth } from '@hooks/useAuth';
import {
  getFirstLine,
  KIND_EMOJI,
  sortByActivity,
  STATUS_LABEL,
} from '@lib/feedback/feedbackDisplay';
import {
  markFeedbackSeen,
  replyToFeedback,
} from '@lib/feedback/feedbackWrites';
import type { Feedback } from '@lib/feedback/types';
import { savePostLoginRedirect } from '@lib/postLoginRedirect';
import {
  selectAdminUnreadCount,
  selectMyFeedback,
} from '@store/slices/feedbackSlice';
import FeedbackConversation, {
  FeedbackReplyBar,
} from '@ui/feedback/FeedbackConversation';
import { useFeedbackSheet } from '@ui/feedback/feedbackSheetContext';

const THREAD_TITLE: Record<Feedback['kind'], string> = {
  bug: 'Your bug report',
  idea: 'Your idea',
  question: 'Your question',
};

function FeedbackRow({
  feedback,
  now,
  onOpen,
}: {
  feedback: Feedback;
  now: number;
  onOpen: () => void;
}) {
  return (
    <li>
      <Button
        type='button'
        variant='tertiary'
        className='h-auto min-h-16 w-full justify-start gap-3 rounded-none px-4! py-3 text-left font-normal'
        onClick={onOpen}
      >
        <span aria-hidden='true' className='text-xl'>
          {KIND_EMOJI[feedback.kind]}
        </span>
        <span className='min-w-0 flex-1'>
          <span className='text-foreground line-clamp-2 text-sm font-medium wrap-break-word'>
            {getFirstLine(feedback.text)}
          </span>
          <span className='text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs'>
            <span>{STATUS_LABEL[feedback.status]}</span>
            <span aria-hidden='true'>·</span>
            <span>{formatTimeAgo(feedback.lastActivityAt, now)}</span>
          </span>
        </span>
        {feedback.isUnreadBySender ? (
          <span
            role='img'
            aria-label='New reply'
            className='bg-primary size-2.5 shrink-0 rounded-full'
          />
        ) : null}
        <ChevronRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
    </li>
  );
}

/** Opening a thread marks it read; it re-marks only when something newer arrives while it is open. */
function useMarkSeenOnOpen(feedback: Feedback | null) {
  const markedRef = useRef<string | null>(null);
  const unreadKey =
    feedback?.isUnreadBySender === true
      ? `${feedback.id}:${feedback.lastActivityAt}`
      : null;

  useEffect(() => {
    if (!feedback || !unreadKey || markedRef.current === unreadKey) return;
    markedRef.current = unreadKey;
    void markFeedbackSeen({ feedbackId: feedback.id, as: 'sender' }).catch(
      () => {
        markedRef.current = null;
      },
    );
  }, [feedback, unreadKey]);
}

/** The signed-in person's own feedback and the replies to it; the owner also gets a way into everyone's. */
function Inbox() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const now = useNow(60_000);
  const { open: openFeedback } = useFeedbackSheet();
  const [openId, setOpenId] = useQueryState('feedback');
  const mineStatus = useAppSelector((state) => state.feedback.mineStatus);
  const mine = useAppSelector(selectMyFeedback);
  const adminUnread = useAppSelector(selectAdminUnreadCount);
  const items = sortByActivity(mine);
  const openFeedbackItem = items.find((item) => item.id === openId) ?? null;
  useMarkSeenOnOpen(openFeedbackItem);
  const repliesUnread = items.filter((item) => item.isUnreadBySender).length;

  useEffect(() => {
    if (!loading && !user) {
      savePostLoginRedirect(location.pathname + location.search);
    }
  }, [loading, user, location.pathname, location.search]);

  if (loading) return null;
  if (!user) return <Navigate to='/' replace />;

  const getListBody = () => {
    if (mineStatus === 'loading' && items.length === 0) {
      return <p className='text-muted-foreground text-sm'>Loading…</p>;
    }
    if (mineStatus === 'error' && items.length === 0) {
      return (
        <InlineNotice tone='warning'>
          We couldn&apos;t load what you&apos;ve sent just now. Try again in a
          moment.
        </InlineNotice>
      );
    }
    if (items.length === 0) {
      return (
        <div
          className={join(
            CARD_CLASS,
            'flex flex-col items-center gap-3 text-center',
          )}
        >
          <InboxIcon
            className='text-muted-foreground size-8'
            aria-hidden='true'
          />
          <div className='space-y-1'>
            <p className='text-foreground text-base font-semibold'>
              Nothing here yet
            </p>
            <p className='text-muted-foreground text-sm'>
              Found a bug, have an idea or a question? Tell us, and our replies
              will land right here.
            </p>
          </div>
          <Button type='button' onClick={() => openFeedback(null)}>
            Send feedback
          </Button>
        </div>
      );
    }
    return (
      <ul className={LIST_CARD_CLASS}>
        {items.map((item) => (
          <FeedbackRow
            key={item.id}
            feedback={item}
            now={now}
            onOpen={() => void setOpenId(item.id)}
          />
        ))}
      </ul>
    );
  };

  return (
    <div className={join('page', CANVAS_CLASS, 'pt-20')}>
      <div className='mx-auto w-full max-w-xl space-y-6'>
        <SubviewHeader
          title='Inbox'
          onBack={() =>
            location.key === 'default' ? navigate('/') : navigate(-1)
          }
        />

        {isAdmin ? (
          <section className='space-y-3'>
            <h2 className='text-foreground text-base font-semibold'>
              Feedback from people
              {adminUnread ? ` · ${adminUnread} new` : ''}
            </h2>
            <div className={LIST_CARD_CLASS}>
              <Button
                type='button'
                variant='tertiary'
                className='h-auto min-h-14 w-full justify-start gap-3 rounded-none px-4! py-3 text-left font-normal'
                onClick={() => navigate('/admin?view=feedback')}
              >
                <span className='text-foreground min-w-0 flex-1 truncate text-sm font-medium'>
                  Open everyone&apos;s feedback
                </span>
                <ChevronRight
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
              </Button>
            </div>
          </section>
        ) : null}

        <section className='space-y-3'>
          <h2 className='text-foreground text-base font-semibold'>
            {isAdmin ? 'Replies to you' : "What you've sent"}
            {isAdmin && repliesUnread ? ` · ${repliesUnread} new` : ''}
          </h2>
          {getListBody()}
        </section>
      </div>

      <DetailSheet
        isOpen={openFeedbackItem !== null}
        onClose={() => void setOpenId(null)}
        title={openFeedbackItem ? THREAD_TITLE[openFeedbackItem.kind] : ''}
        footer={
          openFeedbackItem ? (
            <FeedbackReplyBar
              key={openFeedbackItem.id}
              label='Add a reply'
              sendLabel='Send'
              onReply={(text) =>
                replyToFeedback({
                  feedback: openFeedbackItem,
                  uid: user.uid,
                  isAdmin: false,
                  text,
                })
              }
            />
          ) : undefined
        }
      >
        {openFeedbackItem ? (
          <FeedbackConversation
            key={openFeedbackItem.id}
            feedback={openFeedbackItem}
            viewer='sender'
          />
        ) : null}
      </DetailSheet>
    </div>
  );
}

export default Inbox;

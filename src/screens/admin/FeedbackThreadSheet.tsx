import { useEffect, useRef, useState } from 'react';

import DetailSheet from '@/components/DetailSheet';
import InlineNotice from '@/components/InlineNotice';
import { PillGroup } from '@/components/PillGroup';
import { useAuth } from '@hooks/useAuth';
import { STATUS_OPTIONS } from '@lib/feedback/feedbackDisplay';
import {
  markFeedbackSeen,
  replyToFeedback,
  setFeedbackStatus,
} from '@lib/feedback/feedbackWrites';
import type { Feedback, FeedbackStatus } from '@lib/feedback/types';
import FeedbackConversation from '@ui/feedback/FeedbackConversation';

interface FeedbackThreadSheetProps {
  feedback: Feedback | null;
  senderName: string;
  onClose: () => void;
}

/** One piece of feedback for the owner: what was sent and from where, the thread, a status that saves as soon as it is picked, and a reply that also reaches the sender's phone. */
function FeedbackThreadSheet({
  feedback,
  senderName,
  onClose,
}: FeedbackThreadSheetProps) {
  const { user } = useAuth();
  const [statusError, setStatusError] = useState<string | null>(null);
  const markedRef = useRef<string | null>(null);
  const unreadKey =
    feedback?.isUnreadByAdmin === true
      ? `${feedback.id}:${feedback.lastActivityAt}`
      : null;

  useEffect(() => {
    if (!feedback || !unreadKey || markedRef.current === unreadKey) return;
    markedRef.current = unreadKey;
    void markFeedbackSeen({ feedbackId: feedback.id, as: 'admin' }).catch(
      () => {
        markedRef.current = null;
      },
    );
  }, [feedback, unreadKey]);

  const handleStatus = async (status: FeedbackStatus) => {
    if (!feedback || !user || status === feedback.status) return;
    setStatusError(null);
    try {
      await setFeedbackStatus({ feedback, uid: user.uid, status });
    } catch {
      setStatusError("We couldn't change the status just now. Try again.");
    }
  };

  return (
    <DetailSheet
      isOpen={feedback !== null}
      onClose={onClose}
      title={senderName}
    >
      {feedback && user ? (
        <div key={feedback.id} className='space-y-4'>
          <div className='space-y-2'>
            <PillGroup
              label='Status'
              isThin
              options={STATUS_OPTIONS}
              value={feedback.status}
              onChange={(status) => void handleStatus(status)}
            />
            {statusError ? (
              <InlineNotice tone='warning'>{statusError}</InlineNotice>
            ) : null}
          </div>
          <FeedbackConversation
            feedback={feedback}
            viewer='admin'
            replyLabel='Reply'
            sendLabel='Send reply'
            replyNote="They'll get a notification and see it in their inbox."
            onReply={(text) =>
              replyToFeedback({
                feedback,
                uid: user.uid,
                isAdmin: true,
                text,
              })
            }
          />
        </div>
      ) : null}
    </DetailSheet>
  );
}

export default FeedbackThreadSheet;

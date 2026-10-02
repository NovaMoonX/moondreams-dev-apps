import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ThumbsUp } from 'lucide-react';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { toggleIdeaVote } from '@apps/waypoint/store/actions/ideaActions';
import type { TripIdea, TripSpace } from '@apps/waypoint/types';

interface IdeaVoteButtonProps {
  trip: TripSpace;
  idea: TripIdea;
  currentUserId: string;
}

function IdeaVoteButton({ trip, idea, currentUserId }: IdeaVoteButtonProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const hasVoted = idea.voterUids.includes(currentUserId);

  const handleVote = async () => {
    try {
      await dispatch(toggleIdeaVote({ uid: currentUserId, trip, ideaId: idea.id, hasVoted })).unwrap();
    } catch (voteError) {
      addToast({
        title: 'Unable to save your vote',
        description: getErrorMessage(voteError, 'Please try again.'),
        type: 'error',
      });
    }
  };

  return (
    <Button
      type='button'
      size='sm'
      variant='tertiary'
      aria-label={hasVoted ? `Remove your vote for ${idea.title}` : `Vote for ${idea.title}`}
      onClick={() => void handleVote()}
    >
      <ThumbsUp className={join('h-3.5 w-3.5', hasVoted && 'fill-current text-primary')} />{' '}
      {idea.voterUids.length}
    </Button>
  );
}

export default IdeaVoteButton;

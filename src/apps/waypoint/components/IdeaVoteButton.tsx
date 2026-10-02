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
  /** A large, centered circle with the count underneath — for where voting is the point. */
  isProminent?: boolean;
}

function IdeaVoteButton({ trip, idea, currentUserId, isProminent = false }: IdeaVoteButtonProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const hasVoted = idea.voterUids.includes(currentUserId);
  const voteCount = idea.voterUids.length;
  const ariaLabel = hasVoted ? `Remove your vote for ${idea.title}` : `Vote for ${idea.title}`;

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

  if (isProminent) {
    return (
      <div className='flex flex-col items-center gap-1.5'>
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          aria-label={ariaLabel}
          className='border-border h-16 w-16 rounded-full! border'
          onClick={() => void handleVote()}
        >
          <ThumbsUp className={join('h-7 w-7', hasVoted && 'fill-current text-primary')} />
        </Button>
        <span className='text-muted-foreground text-sm'>
          {voteCount} {voteCount === 1 ? 'vote' : 'votes'}
        </span>
      </div>
    );
  }

  return (
    <Button
      type='button'
      size='sm'
      variant='tertiary'
      aria-label={ariaLabel}
      onClick={() => void handleVote()}
    >
      <ThumbsUp className={join('h-3.5 w-3.5', hasVoted && 'fill-current text-primary')} /> {voteCount}
    </Button>
  );
}

export default IdeaVoteButton;

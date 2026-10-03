import { useState } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CalendarDays, Pencil } from 'lucide-react';

import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import IdeaFormModal, { type IdeaFormFields } from '@apps/waypoint/components/IdeaFormModal';
import IdeaDetailsOverlay, { type IdeaAnchor, type IdeaOpenProps } from '@apps/waypoint/components/IdeaDetailsOverlay';
import IdeaVoteButton from '@apps/waypoint/components/IdeaVoteButton';
import {
  IDEA_TYPE_CHIP_CLASSES,
  IDEA_TYPE_EMOJIS,
  IDEA_TYPE_LABELS,
} from '@apps/waypoint/constants';
import { deleteIdea, updateIdea } from '@apps/waypoint/store/actions/ideaActions';
import type { TripIdea, TripSpace } from '@apps/waypoint/types';
import { getIdeaTags, getIdeaTimingSummary } from '@apps/waypoint/utils/ideaLabels';
import { canManageIdea } from '@apps/waypoint/utils/roleGuards';

interface IdeaCardProps {
  trip: TripSpace;
  idea: TripIdea;
  currentUserId: string;
}

function IdeaCard({ trip, idea, currentUserId }: IdeaCardProps) {
  const adderInfo = useUserInfo(idea.addedByUid);
  const adderName = adderInfo?.displayName || adderInfo?.email || 'Someone';
  const timing = getIdeaTimingSummary(trip, idea);
  const tags = getIdeaTags(idea);
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canManage = canManageIdea(trip, currentUserId, idea);

  const handleSave = async (fields: IdeaFormFields) => {
    setIsSubmitting(true);
    try {
      await dispatch(updateIdea({ uid: currentUserId, trip, idea, ...fields })).unwrap();
      setIsEditing(false);
    } catch (saveError) {
      addToast({
        title: 'Unable to save this idea',
        description: getErrorMessage(saveError, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      await dispatch(deleteIdea({ uid: currentUserId, trip, idea })).unwrap();
      setIsEditing(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCard = (openProps: IdeaOpenProps, anchor: IdeaAnchor) => (
    <div
      {...openProps}
      className='border-border bg-card cursor-pointer space-y-2 rounded-xl border p-3'
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-start gap-2.5'>
          <span
            className={join(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm',
              IDEA_TYPE_CHIP_CLASSES[idea.ideaType],
            )}
            title={IDEA_TYPE_LABELS[idea.ideaType]}
          >
            {IDEA_TYPE_EMOJIS[idea.ideaType]}
          </span>
          {anchor(
          <div className='min-w-0'>
            <p className='font-medium'>{idea.title}</p>
            {timing && (
              <p className='mt-0.5 flex items-center gap-1.5 text-sm font-medium'>
                <CalendarDays className='text-primary h-3.5 w-3.5 shrink-0' />
                {timing}
              </p>
            )}
            <p className='text-muted-foreground text-xs'>Suggested by {adderName}</p>
          </div>,
          )}
        </div>
        <span
          className='flex shrink-0 items-center gap-1'
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          {canManage && (
            <Button
              type='button'
              variant='tertiary'
              size='icon'
              aria-label={`Edit ${idea.title}`}
              onClick={() => setIsEditing(true)}
            >
              <Pencil className='h-3.5 w-3.5' />
            </Button>
          )}
          <IdeaVoteButton trip={trip} idea={idea} currentUserId={currentUserId} />
        </span>
      </div>
      {tags.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {tags.map((tag) => (
            <Badge key={tag} variant='muted' outline>
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <IdeaDetailsOverlay
        trip={trip}
        idea={idea}
        currentUserId={currentUserId}
        renderTrigger={renderCard}
      />
      {isEditing && (
        <IdeaFormModal
          key={idea.id}
          isOpen
          trip={trip}
          defaultType={idea.ideaType}
          idea={idea}
          canPost
          isSubmitting={isSubmitting}
          onSubmit={handleSave}
          onDelete={handleDelete}
          onClose={() => setIsEditing(false)}
        />
      )}
    </>
  );
}

export default IdeaCard;

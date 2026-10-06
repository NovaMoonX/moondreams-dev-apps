import { useId, useState, useSyncExternalStore, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';

import { Badge, Button, Drawer, Popover } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CalendarDays } from 'lucide-react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch } from '@/store';
import { getDayLabel } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import IdeaToEventModal from '@apps/waypoint/components/IdeaToEventModal';
import IdeaFormModal, { type IdeaFormFields } from '@apps/waypoint/components/IdeaFormModal';
import IdeaVoteButton from '@apps/waypoint/components/IdeaVoteButton';
import {
  IDEA_TYPE_CHIP_CLASSES,
  IDEA_TYPE_EMOJIS,
  IDEA_TYPE_LABELS,
} from '@apps/waypoint/constants';
import { deleteIdea, updateIdea } from '@apps/waypoint/store/actions/ideaActions';
import type { TripIdea, TripSpace } from '@apps/waypoint/types';
import { getIdeaTags, getIdeaTiming } from '@apps/waypoint/utils/ideaLabels';
import { canCreateItem, canDeleteIdea, canEditIdea } from '@apps/waypoint/utils/roleGuards';

let openOverlayId: string | null = null;
const openIdeaListeners = new Set<() => void>();

const subscribeToOpenIdea = (listener: () => void) => {
  openIdeaListeners.add(listener);
  return () => {
    openIdeaListeners.delete(listener);
  };
};

const setOpenIdea = (overlayId: string, isOpen: boolean) => {
  if (isOpen) {
    openOverlayId = overlayId;
  } else if (openOverlayId === overlayId) {
    openOverlayId = null;
  } else {
    return;
  }
  openIdeaListeners.forEach((listener) => listener());
};

export interface IdeaOpenProps {
  role: 'button';
  tabIndex: number;
  'aria-label': string;
  onClick: () => void;
  onKeyDown: (keyEvent: KeyboardEvent<HTMLElement>) => void;
}
export type IdeaAnchor = (content: ReactNode) => ReactElement;

interface IdeaDetailsOverlayProps {
  trip: TripSpace;
  idea: TripIdea;
  currentUserId: string;
  /** The tappable row. `openProps` opens the details; `anchor` wraps the part (the text) the
   * wider-screen popover appears beside on hover. */
  renderTrigger: (openProps: IdeaOpenProps, anchor: IdeaAnchor) => ReactElement;
}

type IdeaDetailsBodyProps = Pick<IdeaDetailsOverlayProps, 'trip' | 'idea' | 'currentUserId'> & {
  isDrawer: boolean;
  onEdit: (() => void) | null;
  onDelete: (() => void) | null;
  onAddToItinerary: (() => void) | null;
};

function IdeaDetailsBody({
  trip,
  idea,
  currentUserId,
  isDrawer,
  onEdit,
  onDelete,
  onAddToItinerary,
}: IdeaDetailsBodyProps) {
  const adderInfo = useUserInfo(idea.addedByUid);
  const adderName = adderInfo?.displayName || adderInfo?.email || 'Someone';
  const tags = getIdeaTags(idea);
  const { days, blocks } = getIdeaTiming(trip, idea);
  const timingText = [days.map((day) => getDayLabel(trip.startDate, day)).join(', '), blocks.join(' / ')]
    .filter(Boolean)
    .join(' · ');

  const typeChip = (
    <span
      className={join(
        'flex shrink-0 items-center justify-center rounded-full text-sm',
        isDrawer ? 'h-7 w-7' : 'h-9 w-9',
        IDEA_TYPE_CHIP_CLASSES[idea.ideaType],
      )}
    >
      {IDEA_TYPE_EMOJIS[idea.ideaType]}
    </span>
  );
  const itineraryBadge = idea.convertedToEntityId !== null && (
    <Badge variant='success' use='status'>
      On the itinerary
    </Badge>
  );
  const details = (
    <>
      {timingText && (
        <p className='flex items-center gap-2 text-sm font-medium'>
          <CalendarDays className='text-primary h-4 w-4 shrink-0' />
          {timingText}
        </p>
      )}
      {tags.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {tags.map((tag) => (
            <Badge key={tag} variant='muted' outline>
              {tag}
            </Badge>
          ))}
        </div>
      )}
      {idea.notes && <p className='text-sm'>{idea.notes}</p>}
    </>
  );

  if (isDrawer) {
    return (
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center gap-2'>
          {typeChip}
          <span className='text-sm font-medium'>{IDEA_TYPE_LABELS[idea.ideaType]}</span>
          {itineraryBadge}
        </div>
        <p className='text-muted-foreground text-sm'>Suggested by {adderName}</p>
        {details}
        <div className='flex justify-center pt-2'>
          <IdeaVoteButton trip={trip} idea={idea} currentUserId={currentUserId} isProminent />
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-start gap-3'>
        {typeChip}
        <div className='min-w-0'>
          <h3 className='font-semibold'>{idea.title}</h3>
          <p className='text-muted-foreground text-xs'>
            {IDEA_TYPE_LABELS[idea.ideaType]} · Suggested by {adderName}
          </p>
        </div>
      </div>
      {itineraryBadge}
      {details}
      <div className='border-border flex items-center justify-between gap-2 border-t pt-3'>
        <IdeaVoteButton trip={trip} idea={idea} currentUserId={currentUserId} />
        <div className='flex flex-wrap items-center justify-end gap-2'>
          {onAddToItinerary && (
            <Button type='button' size='sm' onClick={onAddToItinerary}>
              Add to itinerary
            </Button>
          )}
          {onEdit && (
            <Button type='button' size='sm' variant='secondary' onClick={onEdit}>
              Modify
            </Button>
          )}
          {onDelete && (
            <Button
              type='button'
              size='sm'
              variant='secondary'
              className='text-destructive!'
              onClick={onDelete}
            >
              Delete
            </Button>
          )}
          {idea.linkUrl && (
            <Button href={idea.linkUrl} target='_blank' rel='noreferrer' size='sm' variant='secondary'>
              Visit site
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Phones get a bottom drawer with a big centered vote; wider screens a popover that opens on
 * hover, beside the idea's text. */
function IdeaDetailsOverlay({ trip, idea, currentUserId, renderTrigger }: IdeaDetailsOverlayProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const adderInfo = useUserInfo(idea.addedByUid);
  const adderName = adderInfo?.displayName || adderInfo?.email || 'Someone';
  const isSmallScreen = useMediaQuery().isBelow('sm');
  // Keyed per rendered card, not per idea: the same idea can sit on Overview and in the Ideas list.
  const overlayId = useId();
  const isOpen = useSyncExternalStore(subscribeToOpenIdea, () => openOverlayId === overlayId);
  const setIsOpen = (open: boolean) => setOpenIdea(overlayId, open);
  const [isEditing, setIsEditing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canEdit = canEditIdea(trip, currentUserId, idea);
  const canDelete = canDeleteIdea(trip, currentUserId, idea);
  const openProps: IdeaOpenProps = {
    role: 'button',
    tabIndex: 0,
    'aria-label': `Open details for ${idea.title}`,
    onClick: () => setIsOpen(true),
    onKeyDown: (keyEvent) => {
      if (keyEvent.target === keyEvent.currentTarget && (keyEvent.key === 'Enter' || keyEvent.key === ' ')) {
        keyEvent.preventDefault();
        setIsOpen(true);
      }
    },
  };
  const startConverting =
    idea.convertedToEntityId === null && canCreateItem(trip, currentUserId)
      ? () => {
          setIsOpen(false);
          setIsConverting(true);
        }
      : null;
  const startEditing = canEdit
    ? () => {
        setIsOpen(false);
        setIsEditing(true);
      }
    : null;

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

  const deleteAsAdmin = async () => {
    const confirmed = await confirm({
      title: 'Delete idea',
      message: `This is ${adderName}'s idea, not yours. Delete "${idea.title}" for everyone?${
        idea.convertedToEntityId === null ? '' : " It's already on the itinerary, and that event stays exactly as it is."
      }`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await handleDelete();
    } catch (deleteError) {
      addToast({
        title: 'Unable to delete this idea',
        description: getErrorMessage(deleteError, 'Please try again.'),
        type: 'error',
      });
    }
  };
  const startAdminDelete = canDelete && !canEdit ? () => void deleteAsAdmin() : null;

  const editModal = isEditing && (
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
  );

  const convertModal = isConverting && (
    <IdeaToEventModal
      key={idea.id}
      trip={trip}
      idea={idea}
      currentUserId={currentUserId}
      onClose={() => setIsConverting(false)}
    />
  );

  if (isSmallScreen) {
    return (
      <>
        {renderTrigger(openProps, (content) => <>{content}</>)}
        <Drawer
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title={idea.title}
          showCloseButton
          footer={
            idea.linkUrl || startConverting || startEditing || startAdminDelete ? (
              <div className='flex flex-col gap-2'>
                {startConverting && (
                  <Button type='button' size='lg' onClick={startConverting}>
                    Add to itinerary
                  </Button>
                )}
                {idea.linkUrl && (
                  <Button href={idea.linkUrl} target='_blank' rel='noreferrer' size='lg' variant='secondary'>
                    Visit site
                  </Button>
                )}
                {startEditing && (
                  <Button type='button' size='lg' variant='secondary' onClick={startEditing}>
                    Modify
                  </Button>
                )}
                {startAdminDelete && (
                  <Button
                    type='button'
                    size='lg'
                    variant='secondary'
                    className='text-destructive!'
                    onClick={startAdminDelete}
                  >
                    Delete
                  </Button>
                )}
              </div>
            ) : undefined
          }
        >
          {isOpen && (
            <IdeaDetailsBody
              trip={trip}
              idea={idea}
              currentUserId={currentUserId}
              isDrawer
              onEdit={null}
              onDelete={null}
              onAddToItinerary={null}
            />
          )}
        </Drawer>
        {editModal}
        {convertModal}
      </>
    );
  }

  return (
    <>
      {renderTrigger(openProps, (content) => (
        <Popover
          trigger={<div>{content}</div>}
          isOpen={isOpen && !isEditing}
          onOpenChange={(open) => !isEditing && setIsOpen(open)}
          hoverable
          placement='right'
          alignment='start'
          offset={12}
          className='border-border w-80 cursor-default rounded-xl border p-4 shadow-xl'
        >
          {isOpen && (
            <IdeaDetailsBody
              trip={trip}
              idea={idea}
              currentUserId={currentUserId}
              isDrawer={false}
              onEdit={startEditing}
              onDelete={startAdminDelete}
              onAddToItinerary={startConverting}
            />
          )}
        </Popover>
      ))}
      {editModal}
      {convertModal}
    </>
  );
}

export default IdeaDetailsOverlay;

import { useSyncExternalStore, type ReactElement, type ReactNode } from 'react';

import { Badge, Button, Drawer, Popover } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CalendarDays } from 'lucide-react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getDayLabel } from '@/utils/dateRangeUtils';
import IdeaVoteButton from '@apps/waypoint/components/IdeaVoteButton';
import {
  IDEA_TYPE_CHIP_CLASSES,
  IDEA_TYPE_EMOJIS,
  IDEA_TYPE_LABELS,
} from '@apps/waypoint/constants';
import type { TripIdea, TripSpace } from '@apps/waypoint/types';
import { getIdeaTags, getIdeaTiming } from '@apps/waypoint/utils/ideaLabels';
import { getOpenDetailsProps } from '@apps/waypoint/utils/openDetailsProps';

let openIdeaId: string | null = null;
const openIdeaListeners = new Set<() => void>();

const subscribeToOpenIdea = (listener: () => void) => {
  openIdeaListeners.add(listener);
  return () => {
    openIdeaListeners.delete(listener);
  };
};

const setOpenIdea = (ideaId: string, isOpen: boolean) => {
  if (isOpen) {
    openIdeaId = ideaId;
  } else if (openIdeaId === ideaId) {
    openIdeaId = null;
  } else {
    return;
  }
  openIdeaListeners.forEach((listener) => listener());
};

export type IdeaOpenProps = ReturnType<typeof getOpenDetailsProps>;
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
};

function IdeaDetailsBody({ trip, idea, currentUserId, isDrawer }: IdeaDetailsBodyProps) {
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
        {idea.linkUrl && (
          <Button href={idea.linkUrl} target='_blank' rel='noreferrer' size='sm' variant='secondary'>
            Visit site
          </Button>
        )}
      </div>
    </div>
  );
}

/** Phones get a bottom drawer with a big centered vote; wider screens a popover that opens on
 * hover, beside the idea's text. */
function IdeaDetailsOverlay({ trip, idea, currentUserId, renderTrigger }: IdeaDetailsOverlayProps) {
  const isSmallScreen = useMediaQuery().isBelow('sm');
  // One details view is open at a time, so moving between ideas never leaves two showing.
  const isOpen = useSyncExternalStore(subscribeToOpenIdea, () => openIdeaId === idea.id);
  const setIsOpen = (open: boolean) => setOpenIdea(idea.id, open);
  const openProps = getOpenDetailsProps(idea.title, () => setIsOpen(true));

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
            idea.linkUrl ? (
              <Button href={idea.linkUrl} target='_blank' rel='noreferrer' size='lg' variant='secondary'>
                Visit site
              </Button>
            ) : undefined
          }
        >
          {isOpen && <IdeaDetailsBody trip={trip} idea={idea} currentUserId={currentUserId} isDrawer />}
        </Drawer>
      </>
    );
  }

  return renderTrigger(openProps, (content) => (
    <Popover
      trigger={<div>{content}</div>}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      hoverable
      placement='right'
      alignment='start'
      offset={12}
      className='border-border w-80 cursor-default rounded-xl border p-4 shadow-xl'
    >
      {isOpen && (
        <IdeaDetailsBody trip={trip} idea={idea} currentUserId={currentUserId} isDrawer={false} />
      )}
    </Popover>
  ));
}

export default IdeaDetailsOverlay;

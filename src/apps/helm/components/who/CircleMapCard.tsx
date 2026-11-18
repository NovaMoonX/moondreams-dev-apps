import { Plus, User } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import { HELM_COPY } from '@apps/helm/constants';
import type { MapCard } from '@apps/helm/utils/circleMap';

interface CircleMapCardProps {
  card: MapCard | null;
  /** What the card adds under the line: links here, the next thing, a near date. */
  summary: string[];
  /** Null when the person has no page of their own to open. */
  onOpen: (() => void) | null;
  onAddConnection: (() => void) | null;
  onClose: () => void;
}

/** A tapped person: their name, what they are to the owner, and the two next steps. */
function CircleMapCard({
  card,
  summary,
  onOpen,
  onAddConnection,
  onClose,
}: CircleMapCardProps) {
  return (
    <DetailSheet
      isOpen={card !== null}
      onClose={onClose}
      title={card?.title ?? ''}
    >
      <div className='space-y-4 pb-2'>
        {card && (card.line || summary.length > 0) && (
          <ul className='text-muted-foreground space-y-1 text-[15px] text-pretty'>
            {[card.line, ...summary]
              .filter((part) => part)
              .map((part) => (
                <li key={part}>{part}</li>
              ))}
          </ul>
        )}
        <ActionGroup>
          {onOpen && (
            <ActionRow
              isGrouped
              hasChevron
              icon={<User className='size-4' aria-hidden='true' />}
              label={HELM_COPY.mapOpen}
              onClick={onOpen}
            />
          )}
          {onAddConnection && (
            <ActionRow
              isGrouped
              hasChevron
              icon={<Plus className='size-4' aria-hidden='true' />}
              label={
                card?.isOwner
                  ? HELM_COPY.mapAddForYou
                  : HELM_COPY.mapAddConnection
              }
              onClick={onAddConnection}
            />
          )}
        </ActionGroup>
      </div>
    </DetailSheet>
  );
}

export default CircleMapCard;

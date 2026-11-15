import { Plus, User } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import { HELM_COPY } from '@apps/helm/constants';
import type { MapCard } from '@apps/helm/utils/circleMap';

interface CircleMapCardProps {
  card: MapCard | null;
  /** Null when the person has no page of their own to open. */
  onOpen: (() => void) | null;
  onAddConnection: (() => void) | null;
  onClose: () => void;
}

/** A tapped person: their name, what they are to the owner, and the two next steps. */
function CircleMapCard({
  card,
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
        {card && (card.line || card.count !== null) && (
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {[
              card.line,
              card.count !== null && card.count > 0
                ? HELM_COPY.mapConnectionCount(card.count)
                : '',
            ]
              .filter((part) => part)
              .join(' · ')}
          </p>
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
              label={HELM_COPY.mapAddConnection}
              onClick={onAddConnection}
            />
          )}
        </ActionGroup>
      </div>
    </DetailSheet>
  );
}

export default CircleMapCard;

import Subview from '@/components/Subview';
import { formatDate, formatTime } from '@/utils/formatUtils';
import OutsideMark from '@apps/helm/components/outside/OutsideMark';
import TurnCard from '@apps/helm/components/home/TurnCard';
import { HELM_COPY } from '@apps/helm/constants';
import type { OutsideConversation } from '@apps/helm/utils/outsideTurns';
import { groupTurns } from '@apps/helm/utils/sessions';

/** One conversation with an outside assistant: each question with its reply and card, drawn as home draws a turn. */
function OutsideConversationView({
  conversation,
  onClose,
}: {
  conversation: OutsideConversation;
  onClose: () => void;
}) {
  return (
    <Subview
      overlay
      title={HELM_COPY.assistantFrom(conversation.via)}
      onClose={onClose}
    >
      <div className='flex flex-col gap-6'>
        <p className='text-muted-foreground flex items-center gap-2 text-[13px] tabular-nums'>
          <OutsideMark via={conversation.via} />
          {HELM_COPY.sheetDayTime(
            formatDate(conversation.startedAt),
            formatTime(conversation.startedAt),
          )}
        </p>
        {groupTurns(conversation.turns).map(({ lead, joined }) => (
          <TurnCard
            key={lead.id}
            capture={lead}
            joined={joined}
            showsOutcome={false}
            showsReading={false}
            isOnHome={false}
            showsNotice={false}
          />
        ))}
      </div>
    </Subview>
  );
}

export default OutsideConversationView;

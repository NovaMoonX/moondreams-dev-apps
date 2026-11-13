import { User } from 'lucide-react';

import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import type { OpenExecution } from '@apps/helm/types';

/** Who did it: the assistant's mark, or a person icon for what the person did themselves. */
function ActorMark({ actor }: { actor: OpenExecution['actor'] }) {
  const name = useAssistantName();
  if (actor === 'nomos') return <AssistantMark name={name} />;
  return (
    <span
      aria-hidden='true'
      className='bg-muted text-muted-foreground inline-grid size-[22px] shrink-0 place-items-center rounded-full'
    >
      <User className='size-3.5' />
    </span>
  );
}

export default ActorMark;

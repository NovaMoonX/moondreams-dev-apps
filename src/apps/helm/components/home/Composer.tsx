import type { Ref } from 'react';

import { Textarea } from '@moondreamsdev/dreamer-ui/components';

import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

interface ComposerProps {
  /** Lets the dock's Type and Talk put the cursor here. */
  fieldRef: Ref<HTMLTextAreaElement>;
}

/** The text field at the foot of home's conversation. It has no Send until a turn can be kept. */
function Composer({ fieldRef }: ComposerProps) {
  const name = useAssistantName();

  return (
    <Textarea
      ref={fieldRef}
      variant='outline'
      rows={2}
      aria-label={HELM_COPY.composerLabel(name)}
      placeholder={HELM_COPY.composerPlaceholder(name)}
      className='bg-card'
    />
  );
}

export default Composer;

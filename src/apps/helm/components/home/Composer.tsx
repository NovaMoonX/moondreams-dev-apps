import type { Ref } from 'react';

import { Textarea } from '@moondreamsdev/dreamer-ui/components';

import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

interface ComposerProps {
  /** Lets the dock's Type and Talk put the cursor here. */
  fieldRef: Ref<HTMLTextAreaElement>;
  onFocusChange: (isFocused: boolean) => void;
}

/** The text field at the foot of home's conversation. It has no Send until a turn can be kept. */
function Composer({ fieldRef, onFocusChange }: ComposerProps) {
  const name = useAssistantName();

  return (
    <Textarea
      ref={fieldRef}
      variant='outline'
      rows={2}
      aria-label={HELM_COPY.composerLabel(name)}
      placeholder={HELM_COPY.composerPlaceholder(name)}
      className='helm-field'
      onFocus={(event) => {
        onFocusChange(true);
        // The keyboard shrinks the viewport after focus lands, so the field is brought back into view each time it does.
        const field = event.currentTarget;
        const keepInView = () => field.scrollIntoView({ block: 'nearest' });
        window.visualViewport?.addEventListener('resize', keepInView);
        field.addEventListener(
          'blur',
          () =>
            window.visualViewport?.removeEventListener('resize', keepInView),
          { once: true },
        );
      }}
      onBlur={() => onFocusChange(false)}
    />
  );
}

export default Composer;

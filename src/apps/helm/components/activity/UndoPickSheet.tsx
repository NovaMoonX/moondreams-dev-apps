import { useState } from 'react';

import FormSheet from '@/components/FormSheet';
import UndoChoices from '@apps/helm/components/activity/UndoChoices';
import UndoPickActions from '@apps/helm/components/activity/UndoPickActions';
import { HELM_COPY } from '@apps/helm/constants';
import { useUndoChoices } from '@apps/helm/hooks/useUndoChoices';
import type { OpenExecution } from '@apps/helm/types';

interface UndoPickSheetProps {
  execution: OpenExecution;
  isOpen: boolean;
  onClose: () => void;
}

/** Everything ticked to start; the person unticks what to keep, then takes the rest back. */
function UndoPickSheet({ execution, isOpen, onClose }: UndoPickSheetProps) {
  const { units, choices } = useUndoChoices(execution);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [isBusy, setIsBusy] = useState(false);
  const picked = new Set(
    choices.flatMap((c) => (kept.has(c.key) ? [] : [c.key])),
  );

  const close = () => {
    setKept(new Set());
    onClose();
  };

  return (
    <FormSheet isOpen={isOpen} onClose={close} title={HELM_COPY.undoPickTitle}>
      <UndoChoices
        units={choices}
        picked={picked}
        onChange={(next) =>
          setKept(
            new Set(choices.flatMap((c) => (next.has(c.key) ? [] : [c.key]))),
          )
        }
        isBusy={isBusy}
      />
      <UndoPickActions
        execution={execution}
        units={units}
        picked={picked}
        isBusyChange={setIsBusy}
        onCancel={close}
        onDone={close}
      />
    </FormSheet>
  );
}

export default UndoPickSheet;

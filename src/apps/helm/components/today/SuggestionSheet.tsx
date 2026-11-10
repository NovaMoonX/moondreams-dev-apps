import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DetailSheet from '@/components/DetailSheet';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import {
  PlacementBody,
  PlacementFooter,
} from '@apps/helm/components/today/Placement';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { usePlacementMode } from '@apps/helm/hooks/usePlacementMode';
import {
  keepSlot,
  moveSlot,
  restoreSlot,
  skipSlot,
} from '@apps/helm/store/actions/planActions';
import { selectOpenTasksById } from '@apps/helm/store/selectors/captureSelectors';
import { formatSlotRange } from '@apps/helm/utils/planDays';
import {
  toPlannerTask,
  type Opening,
  type PlanSources,
} from '@apps/helm/utils/planInput';

export interface SuggestionTarget {
  dayKey: string;
  slotId: string;
}

interface SuggestionSheetProps {
  target: SuggestionTarget | null;
  sources: PlanSources | null;
  onClose: () => void;
  /** Called once "Not today" is written, so the screen can offer its Undo. */
  onSkipped: (title: string, undo: () => void) => void;
}

/** One suggested slot: why it is there, and Keep, Another time or Not today. Each writes at once and closes the sheet. */
function SuggestionSheet({
  target,
  sources,
  onClose,
  onSkipped,
}: SuggestionSheetProps) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { addToast } = useToast();
  const assistantName = useAssistantName();
  const [mode, setMode] = usePlacementMode();
  const tasksById = useAppSelector(selectOpenTasksById);
  const day = target ? sources?.planDays[target.dayKey] : undefined;
  const slot = target ? day?.slots[target.slotId] : undefined;
  const task = slot ? tasksById.get(slot.taskId) : undefined;

  const close = () => {
    setMode('main');
    onClose();
  };
  const run = (write: Promise<unknown>) => {
    write.catch((error: unknown) => {
      console.error('Helm suggestion did not save', error);
      addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
    });
  };

  if (!target || !uid || !sources || !day || !slot || !task) {
    return (
      <DetailSheet isOpen={false} onClose={close} title=''>
        {null}
      </DetailSheet>
    );
  }

  const { dayKey, slotId } = target;
  const reason = day.reasons[slotId] ?? null;
  const chip = [
    slot.startAt !== null && slot.endAt !== null
      ? formatSlotRange(slot.startAt, slot.endAt, sources.timeZone)
      : null,
    reason,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
  const place = (toKey: string, opening: Opening | null) => {
    run(
      moveSlot(uid, {
        fromKey: dayKey,
        toKey,
        slotId,
        slot,
        startAt: opening?.startAt ?? null,
        endAt: opening?.endAt ?? null,
      }),
    );
    close();
  };

  return (
    <DetailSheet
      isOpen
      onClose={close}
      title={task.isUnreadable ? HELM_COPY.unreadable : task.title}
      viewKey={mode}
      footer={
        <PlacementFooter
          mode={mode}
          onModeChange={setMode}
          onKeep={() => {
            run(keepSlot(uid, dayKey, slotId));
            close();
          }}
          leftAction={
            <Button
              type='button'
              variant='tertiary'
              onClick={() => {
                run(skipSlot(uid, dayKey, slotId));
                onSkipped(
                  task.isUnreadable ? HELM_COPY.unreadable : task.title,
                  () => run(restoreSlot(uid, dayKey, slotId)),
                );
                close();
              }}
            >
              {HELM_COPY.planNotToday}
            </Button>
          }
        />
      }
    >
      <PlacementBody
        mode={mode}
        sources={sources}
        task={toPlannerTask(task)}
        slotId={slotId}
        currentStartAt={slot.startAt}
        headline={null}
        chip={chip}
        assistantName={assistantName}
        onModeChange={setMode}
        onBack={() => setMode(mode === 'days' ? 'times' : 'main')}
        onPlace={place}
      />
    </DetailSheet>
  );
}

export default SuggestionSheet;

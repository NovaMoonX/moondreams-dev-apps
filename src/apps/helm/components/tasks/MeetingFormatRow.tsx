import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import SegmentedControl from '@/components/SegmentedControl';
import type { TaskEditing } from '@apps/helm/components/tasks/TaskDetails';
import { HELM_COPY, MEETING_FORMAT_OPTIONS } from '@apps/helm/constants';
import type { MeetingFormat, TaskMeets } from '@apps/helm/types';

interface MeetingFormatRowProps {
  editing: TaskEditing;
}

/** How a task with a moment due meets. A tap saves at once and touches only this row; its toast's Undo puts back what was there, including nothing. */
function MeetingFormatRow({ editing }: MeetingFormatRowProps) {
  const { task, saveFields } = editing;
  const { addToast } = useToast();
  if (task.due?.kind !== 'moment') return null;

  const change = (meets: TaskMeets | null, line: string) => {
    const previous = task.meets;
    saveFields({ meets });
    addToast({
      title: line,
      type: 'success',
      action: {
        label: HELM_COPY.undo,
        onClick: () => saveFields({ meets: previous }),
      },
    });
  };

  return (
    <div className='space-y-1.5'>
      <span className='text-muted-foreground block text-xs'>
        {HELM_COPY.meetsLabel}
      </span>
      <SegmentedControl<MeetingFormat | 'unset'>
        label={HELM_COPY.meetsLabel}
        options={MEETING_FORMAT_OPTIONS}
        value={task.meets?.how ?? 'unset'}
        onChange={(how) => {
          if (how === 'unset' || how === task.meets?.how) return;
          change(
            { how, setBy: 'person' },
            HELM_COPY.meetsSet(
              MEETING_FORMAT_OPTIONS.find((option) => option.value === how)
                ?.label ?? how,
            ),
          );
        }}
      />
      {task.meets && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className="text-foreground! relative before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']"
          onClick={() => change(null, HELM_COPY.meetsCleared)}
        >
          {HELM_COPY.clearField}
        </Button>
      )}
    </div>
  );
}

export default MeetingFormatRow;

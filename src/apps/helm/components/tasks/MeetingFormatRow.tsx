import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import SegmentedControl from '@/components/SegmentedControl';
import { store } from '@/store';
import type { TaskEditing } from '@apps/helm/components/tasks/TaskDetails';
import { HELM_COPY, MEETING_FORMAT_OPTIONS } from '@apps/helm/constants';
import type { MeetingFormat, TaskMeets } from '@apps/helm/types';

interface MeetingFormatRowProps {
  editing: TaskEditing;
}

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
        onClick: () => {
          const live = store
            .getState()
            .helm.openTasks.items.find((item) => item.id === task.id);
          if (live?.meets?.how === meets?.how) saveFields({ meets: previous });
        },
      },
    });
  };

  return (
    <div className='space-y-1.5 pt-2'>
      <div className='flex min-h-7 items-center justify-between gap-3'>
        <span className='text-muted-foreground text-xs'>
          {HELM_COPY.meetsLabel}
        </span>
        {task.meets && (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className="text-muted-foreground! relative text-xs before:absolute before:-inset-x-2 before:-inset-y-1.5 before:content-['']"
            onClick={() => change(null, HELM_COPY.meetsCleared)}
          >
            {HELM_COPY.clearField}
          </Button>
        )}
      </div>
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
    </div>
  );
}

export default MeetingFormatRow;

import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import AppCheckbox from '@/components/AppCheckbox';

import BackLink from '@/components/BackLink';
import { HELM_COPY, WAITS_ON_LIMIT } from '@apps/helm/constants';
import type { OpenTask } from '@apps/helm/types';

interface WaitsOnPickerProps {
  /** The open tasks that can be waited on: not this one, and none that already waits on it. */
  candidates: OpenTask[];
  selectedIds: string[];
  onDone: (ids: string[]) => void;
  onBack: () => void;
}

function WaitsOnPicker({
  candidates,
  selectedIds,
  onDone,
  onBack,
}: WaitsOnPickerProps) {
  const [chosen, setChosen] = useState(selectedIds);
  const isFull = chosen.length >= WAITS_ON_LIMIT;

  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <BackLink onBack={onBack} />
        <p className='font-medium'>{HELM_COPY.waitsOnLabel}</p>
      </div>
      {candidates.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{HELM_COPY.tasksEmpty}</p>
      ) : (
        <ul className='divide-border divide-y'>
          {candidates.map((task) => {
            const isChosen = chosen.includes(task.id);
            return (
              <li key={task.id}>
                <label className='flex min-h-12 items-center gap-3 py-1'>
                  <AppCheckbox
                    checked={isChosen}
                    disabled={isFull && !isChosen}
                    onCheckedChange={(isOn) =>
                      setChosen((ids) =>
                        isOn
                          ? [...ids, task.id]
                          : ids.filter((id) => id !== task.id),
                      )
                    }
                  />
                  <span className='min-w-0 flex-1 break-words'>
                    {task.title}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {isFull && (
        <p className='text-muted-foreground text-sm'>{HELM_COPY.waitsOnFull}</p>
      )}
      <Button type='button' className='w-full' onClick={() => onDone(chosen)}>
        {HELM_COPY.doneEditing}
      </Button>
    </div>
  );
}

export default WaitsOnPicker;

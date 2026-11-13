import { useRef, useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { HELM_COPY } from '@apps/helm/constants';
import { completeTask } from '@apps/helm/store/actions/taskActions';
import type { OpenTask } from '@apps/helm/types';

interface HeldTick {
  task: OpenTask;
  completedAt: number;
  undo: () => Promise<boolean>;
}

/** The tasks ticked while a list is open. Each stays in view, struck, with its Undo until the list closes; the copy is taken before the write so the row has words to show once the store drops the task. */
export function useTaskTicks(uid: string | null) {
  const { addToast } = useToast();
  const [held, setHeld] = useState<ReadonlyMap<string, HeldTick>>(new Map());
  const heldRef = useRef(held);
  const busyIds = useRef(new Set<string>());

  const hold = (next: ReadonlyMap<string, HeldTick>) => {
    heldRef.current = next;
    setHeld(next);
  };

  const tick = (task: OpenTask) => {
    if (!uid || heldRef.current.has(task.id) || busyIds.current.has(task.id)) {
      return;
    }
    const { completedAt, write, undo } = completeTask(uid, task.id);
    hold(new Map(heldRef.current).set(task.id, { task, completedAt, undo }));
    write.catch((error: unknown) => {
      console.error('Helm task was not marked done', error);
      hold(
        new Map([...heldRef.current].filter(([taskId]) => taskId !== task.id)),
      );
      addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
    });
  };

  const undoTick = async (taskId: string) => {
    const entry = heldRef.current.get(taskId);
    if (!entry || busyIds.current.has(taskId)) return;
    busyIds.current.add(taskId);
    const isUndone = await entry.undo().catch(() => false);
    busyIds.current.delete(taskId);
    if (!isUndone) {
      addToast({ title: HELM_COPY.cannotTakeBack, type: 'error' });
      return;
    }
    hold(new Map([...heldRef.current].filter(([heldId]) => heldId !== taskId)));
  };

  const forget = (taskId: string) =>
    hold(new Map([...heldRef.current].filter(([heldId]) => heldId !== taskId)));

  return { held, tick, undoTick, forget };
}

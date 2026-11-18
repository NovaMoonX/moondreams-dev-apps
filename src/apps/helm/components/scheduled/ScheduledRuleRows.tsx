import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CalendarClock } from 'lucide-react';

import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { useUndoChoices } from '@apps/helm/hooks/useUndoChoices';
import UndoButton from '@apps/helm/components/activity/UndoButton';
import ScheduledForm from '@apps/helm/components/scheduled/ScheduledForm';
import { HELM_COPY } from '@apps/helm/constants';
import { canUndo } from '@apps/helm/nomos/planUndo';
import { selectScheduledById } from '@apps/helm/store/selectors/scheduledSelectors';
import type { OpenExecution } from '@apps/helm/types';
import {
  formatRun,
  readActionZone,
  readNextOf,
  readRuleWords,
} from '@apps/helm/utils/scheduledWords';

interface ScheduledRuleRowsProps {
  execution: OpenExecution;
  /** The reply has no other card, so the Undo sits on this one. */
  hasUndoHere: boolean;
}

/** Undo for a whole turn, offering a pick when more than one thing is left to take back. */
export function TurnUndo({ execution }: { execution: OpenExecution }) {
  const { units } = useUndoChoices(execution);
  return <UndoButton execution={execution} unitCount={units.length} />;
}

/** What a reply that made or changed an action says it will do, in the rule's own words with Change; the action may have changed or ended since, so it is read live and a gone one draws nothing. */
function ScheduledRuleRows({ execution, hasUndoHere }: ScheduledRuleRowsProps) {
  const now = useNow(60_000);
  const byId = useAppSelector(selectScheduledById);
  const homeZone =
    useAppSelector((state) => state.helm.profile?.timeZone) ?? 'UTC';
  const [formId, setFormId] = useState<{ id: string; token: number } | null>(
    null,
  );
  const ids = [
    ...new Set(
      execution.effectRefs
        .filter((ref) => ref.collection === 'scheduledActions')
        .map((ref) => ref.docId),
    ),
  ];
  const actions = ids.flatMap((id) => {
    const action = byId.get(id);
    return action && !action.isUnreadable && action.status !== 'ended'
      ? [action]
      : [];
  });
  if (actions.length === 0) return null;
  const formAction = formId ? (byId.get(formId.id) ?? null) : null;

  return (
    <>
      {actions.map((action, index) => {
        const zone = readActionZone(action, homeZone);
        const { words } = readRuleWords(action, homeZone, now);
        const [next] = readNextOf(action, homeZone, now);
        return (
          <div
            key={action.id}
            className='helm-card ml-[30px] w-[calc(100%-30px)] space-y-2 px-3.5 py-3'
          >
            <div className='flex items-start gap-2.5'>
              <CalendarClock
                className='text-muted-foreground mt-0.5 size-4 shrink-0'
                aria-hidden='true'
              />
              <span className='min-w-0 flex-1'>
                <span className='block text-[15px] leading-[21px] break-words'>
                  {action.title}
                </span>
                <span className='text-muted-foreground block text-[13px] break-words'>
                  {words}
                </span>
                {next && (
                  <span className='text-muted-foreground block text-[13px]'>
                    {HELM_COPY.scheduledNext(formatRun(next, zone))}
                  </span>
                )}
              </span>
            </div>
            <div className='flex items-center justify-between gap-3 pl-[26px]'>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                onClick={() => setFormId({ id: action.id, token: Date.now() })}
              >
                {HELM_COPY.scheduledChangeShort}
              </Button>
              {hasUndoHere && index === 0 && canUndo(execution) && (
                <TurnUndo execution={execution} />
              )}
            </div>
          </div>
        );
      })}
      {formId && formAction && (
        <ScheduledForm
          key={formId.token}
          action={formAction}
          runKey={null}
          onClose={() => setFormId(null)}
        />
      )}
    </>
  );
}

export default ScheduledRuleRows;

import { useState } from 'react';

import {
  Button,
  DropdownMenuFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Plus } from 'lucide-react';

import { useAppSelector } from '@/store';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import ProcedureForm from '@apps/helm/components/procedures/ProcedureForm';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import { selectProcedures } from '@apps/helm/store/selectors/procedureSelectors';
import type { OpenProcedure } from '@apps/helm/types';
import { countSteps, groupSteps } from '@apps/helm/utils/stepGroups';
import PrivateLock from '@apps/helm/components/privacy/PrivateLock';

const { option } = DropdownMenuFactories;

interface ProceduresViewProps {
  onBack: () => void;
  onHome: () => void;
  onOpenProcedure: (procedureId: string) => void;
}

/** One procedure: its title, how many steps it has and when it last changed. */
function ProcedureRow({
  procedure,
  sourceTitle,
  isTwin,
  onOpen,
}: {
  procedure: OpenProcedure;
  sourceTitle: string | null;
  /** Another procedure carries the same title, so this row says what sets it apart. */
  isTwin: boolean;
  onOpen: (procedureId: string) => void;
}) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={() => onOpen(procedure.id)}
    >
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block text-[15px] leading-[21px] break-words'>
          {procedure.title || HELM_COPY.procedureUntitled}
          <PrivateLock kind='procedure' record={procedure} />
        </span>
        <span className='text-muted-foreground block text-[13px]'>
          {[
            HELM_COPY.procedureStepCount(countSteps(groupSteps(procedure))),
            HELM_COPY.procedureChanged(
              formatDateShort(procedure.lastEditedAt ?? procedure.createdAt),
            ),
            ...(isTwin
              ? [
                  sourceTitle
                    ? HELM_COPY.procedureMadeFrom(sourceTitle)
                    : HELM_COPY.procedureMadeOn(
                        `${formatDateShort(procedure.createdAt)}, ${formatTime(procedure.createdAt)}`,
                      ),
                ]
              : []),
          ].join(' · ')}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

/** Procedures: the routines kept once, the most recently changed first. */
function ProceduresView({
  onBack,
  onHome,
  onOpenProcedure,
}: ProceduresViewProps) {
  const assistant = useAssistantName();
  const { isLoaded, isFailed } = useAppSelector(
    (state) => state.helm.procedures,
  );
  const procedures = useAppSelector(selectProcedures);
  const tasks = useAppSelector((state) => state.helm.openTasks.items);
  const projectTasks = useAppSelector((state) => state.helm.projectTasks.items);
  const [isMaking, setIsMaking] = useState(false);
  const taskTitles = new Map(
    [...tasks, ...projectTasks].map((task) => [task.id, task.title]),
  );
  const titleCounts = procedures.reduce(
    (counts, procedure) =>
      counts.set(procedure.title, (counts.get(procedure.title) ?? 0) + 1),
    new Map<string, number>(),
  );

  useScreenContext('procedures', null, [], {
    ask: HELM_COPY.askAboutProcedures(procedures.length),
    chip: HELM_COPY.chipProcedures,
    back: HELM_COPY.backToProcedures,
  });

  return (
    <>
      <HelmHeader
        backLabel='Home'
        onBack={onBack}
        onHome={onHome}
        menu={{
          items: [option({ label: HELM_COPY.procedureNew, value: 'new' })],
          onItemSelect: (value) => {
            if (value === 'new') setIsMaking(true);
          },
        }}
      />
      <main className='space-y-4 pt-4'>
        <h1 className='helm-serif text-[28px] leading-[34px]'>
          {HELM_COPY.proceduresTitle}
        </h1>
        {isFailed && !isLoaded && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.proceduresFailed}
          </p>
        )}
        {isLoaded && procedures.length === 0 && (
          <div className='helm-card space-y-3 p-4'>
            <p className='text-muted-foreground text-[15px] text-pretty'>
              {HELM_COPY.proceduresEmpty(assistant)}
            </p>
            <Button
              type='button'
              variant='secondary'
              onClick={() => setIsMaking(true)}
            >
              <Plus className='size-4' aria-hidden='true' />
              {HELM_COPY.procedureNew}
            </Button>
          </div>
        )}
        {procedures.length > 0 && (
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {procedures.map((procedure) => (
              <li key={procedure.id}>
                <ProcedureRow
                  procedure={procedure}
                  sourceTitle={
                    procedure.sourceTaskId
                      ? (taskTitles.get(procedure.sourceTaskId) ?? null)
                      : null
                  }
                  isTwin={(titleCounts.get(procedure.title) ?? 0) > 1}
                  onOpen={onOpenProcedure}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
      <ProcedureForm
        isOpen={isMaking}
        onClose={() => setIsMaking(false)}
        procedure={null}
        onMade={onOpenProcedure}
      />
    </>
  );
}

export default ProceduresView;

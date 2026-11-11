import { useState } from 'react';

import {
  Button,
  DropdownMenuFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import ProcedureForm from '@apps/helm/components/procedures/ProcedureForm';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import { selectProcedures } from '@apps/helm/store/selectors/procedureSelectors';
import type { OpenProcedure } from '@apps/helm/types';
import { countSteps, groupSteps } from '@apps/helm/utils/stepGroups';

const { option } = DropdownMenuFactories;

interface ProceduresViewProps {
  onBack: () => void;
  onHome: () => void;
  onOpenProcedure: (procedureId: string) => void;
}

/** One procedure: its title, how many steps it has and when it last changed. */
function ProcedureRow({
  procedure,
  onOpen,
}: {
  procedure: OpenProcedure;
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
        </span>
        <span className='text-muted-foreground block text-[13px]'>
          {[
            HELM_COPY.procedureStepCount(countSteps(groupSteps(procedure))),
            HELM_COPY.procedureChanged(
              formatDateShort(procedure.lastEditedAt ?? procedure.createdAt),
            ),
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
  const [isMaking, setIsMaking] = useState(false);

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
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.proceduresEmpty(assistant)}
          </p>
        )}
        {procedures.length > 0 && (
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {procedures.map((procedure) => (
              <li key={procedure.id}>
                <ProcedureRow procedure={procedure} onOpen={onOpenProcedure} />
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

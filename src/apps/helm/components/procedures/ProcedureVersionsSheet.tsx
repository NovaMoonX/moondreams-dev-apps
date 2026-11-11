import { useAuth } from '@/hooks/useAuth';
import VersionsSheet, {
  type VersionRow,
} from '@apps/helm/components/shell/VersionsSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useProcedureVersions } from '@apps/helm/hooks/useProcedureVersions';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { restoreProcedureVersion } from '@apps/helm/store/actions/procedureActions';
import type { OpenProcedure, OpenProcedureVersion } from '@apps/helm/types';
import {
  countSteps,
  groupSteps,
  type StepGroupBlock,
} from '@apps/helm/utils/stepGroups';

interface ProcedureVersionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  procedure: OpenProcedure;
}

const SUMMARY_REASONS = ['personEdit', 'revisedOnRequest', 'restored'];

export function StepBlocks({ blocks }: { blocks: StepGroupBlock[] }) {
  return (
    <>
      {blocks.map((block) => (
        <section key={block.groupId ?? 'ungrouped'} className='space-y-1'>
          {block.name !== null && (
            <h3 className='text-foreground text-[15px] leading-[21px] font-semibold'>
              {block.name}
            </h3>
          )}
          <ul className='space-y-1'>
            {block.steps.map((step) => (
              <li key={step.id} className='text-[15px] text-pretty'>
                <span className='text-foreground break-words'>{step.text}</span>
                {step.detail && (
                  <span className='text-muted-foreground block text-[13px] break-words'>
                    {step.detail}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function ProcedureVersionsBody({
  procedure,
  onClose,
}: Omit<ProcedureVersionsSheetProps, 'isOpen'>) {
  const { user } = useAuth();
  const assistant = useAssistantName();
  const { versions, hasFailed } = useProcedureVersions(procedure.id);

  const toRow = (entry: OpenProcedureVersion): VersionRow => {
    const reasonText = HELM_COPY.historyReason(
      entry.reason,
      entry.createdBy === 'person',
      assistant,
    );
    return {
      id: entry.id,
      version: entry.version,
      createdBy: entry.createdBy,
      restoredFromVersion: entry.restoredFromVersion,
      createdAt: entry.createdAt,
      changeSummary: entry.changeSummary,
      requestQuote: entry.requestQuote,
      executionId: entry.executionId,
      reason: entry.reason,
      title:
        SUMMARY_REASONS.includes(entry.reason) && entry.changeSummary
          ? entry.changeSummary
          : reasonText,
      reasonText,
      contentLine: HELM_COPY.historyStepsLine(countSteps(groupSteps(entry))),
    };
  };

  return (
    <VersionsSheet
      isOpen
      onClose={onClose}
      title={HELM_COPY.procedureHistoryTitle(procedure.title)}
      newest={procedure.version}
      rows={versions && versions.map(toRow)}
      hasFailed={hasFailed}
      undoHint={() => HELM_COPY.procedureUndoHint}
      lines={{
        changed: HELM_COPY.procedureRaced,
        offline: HELM_COPY.procedureNeedsConnection,
      }}
      onRestore={async (target) =>
        user
          ? restoreProcedureVersion(
              user.uid,
              await getHelmEncryption(user.uid),
              procedure.id,
              procedure.version,
              target,
            )
          : 'missing'
      }
      renderVersion={(version) => {
        const entry = versions?.find((item) => item.version === version);
        return entry ? <StepBlocks blocks={groupSteps(entry)} /> : null;
      }}
    />
  );
}

/** A procedure's History, with its steps shown under each version. */
function ProcedureVersionsSheet({
  isOpen,
  onClose,
  procedure,
}: ProcedureVersionsSheetProps) {
  return isOpen ? (
    <ProcedureVersionsBody procedure={procedure} onClose={onClose} />
  ) : null;
}

export default ProcedureVersionsSheet;

import { useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight } from 'lucide-react';

import BackLink from '@/components/BackLink';
import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { canUndo } from '@apps/helm/nomos/planUndo';
import type { DocumentChange } from '@apps/helm/store/actions/topicActions';
import { selectExecutionsById } from '@apps/helm/store/selectors/captureSelectors';
import { takeBack } from '@apps/helm/store/actions/undoActions';

/** One change as the sheet draws it, whatever it is a change to. */
export interface VersionRow {
  id: string;
  version: number;
  createdBy: 'person' | 'nomos';
  restoredFromVersion: number | null;
  createdAt: number;
  changeSummary: string;
  requestQuote: string | null;
  executionId: string | null;
  /** The reason as stored, for the rows whose Undo takes back a whole turn. */
  reason: string;
  /** The row's headline: its summary when it has one, else the reason in words. */
  title: string;
  reasonText: string;
  /** What the version holds, in a line ("12 steps in this version"). */
  contentLine: string;
}

interface VersionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** The sheet's list title. */
  title: string;
  /** The version the thing is on now. */
  newest: number;
  /** Newest first; null until the first snapshot. */
  rows: VersionRow[] | null;
  hasFailed: boolean;
  /** Writes an earlier version again as the newest. */
  onRestore: (target: number) => Promise<DocumentChange>;
  /** What a version holds, drawn under its header. */
  renderVersion: (version: number) => ReactNode;
  /** The reasons whose newest row is taken back as the whole turn that made it. */
  turnReasons?: string[];
  undoHint: (createdBy: 'person' | 'nomos') => string;
  /** Say it in the thing's own words where the generic line would name the wrong thing. */
  lines?: { changed: string; offline: string };
  /** Lets the first version be put back once it is no longer the newest. */
  canRestoreFirst?: boolean;
}

const ROW =
  'flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2';

const whenOf = (at: number) => `${formatDateShort(at)}, ${formatTime(at)}`;

const failureLine = (
  kind: Exclude<DocumentChange, 'saved'>,
  lines: VersionsSheetProps['lines'],
) =>
  kind === 'offline'
    ? (lines?.offline ?? HELM_COPY.historyNeedsConnection)
    : kind === 'changed'
      ? (lines?.changed ?? HELM_COPY.historyChanged)
      : kind === 'busy'
        ? HELM_COPY.sectionBusy
        : kind === 'first'
          ? HELM_COPY.historyFirstVersion
          : HELM_COPY.historyRestoreFailed;

function VersionsBody({
  onClose,
  title,
  newest,
  rows,
  hasFailed,
  onRestore,
  renderVersion,
  turnReasons = [],
  undoHint,
  canRestoreFirst = false,
  lines,
}: Omit<VersionsSheetProps, 'isOpen'>) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const assistant = useAssistantName();
  const executionsById = useAppSelector(selectExecutionsById);
  const [openVersion, setOpenVersion] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const opened = rows?.find((entry) => entry.version === openVersion) ?? null;
  const lineOf = (entry: VersionRow) =>
    HELM_COPY.historyRowLine(
      entry.version,
      whenOf(entry.createdAt),
      entry.createdBy === 'person',
      assistant,
    );

  const change = async (target: number, undoneSummary: string | null) => {
    if (!user || isBusy) return;
    setIsBusy(true);
    try {
      const result = await onRestore(target);
      if (result === 'saved') {
        setOpenVersion(null);
        addToast({
          title:
            undoneSummary === null
              ? HELM_COPY.historyRestored(target)
              : HELM_COPY.historyUndone(undoneSummary),
          type: 'success',
        });
      } else {
        addToast({ title: failureLine(result, lines), type: 'info' });
      }
    } catch (error) {
      console.error('Helm version was not restored', error);
      addToast({ title: HELM_COPY.historyRestoreFailed, type: 'error' });
    }
    setIsBusy(false);
  };

  const takeBackTurn = async (executionId: string, summary: string) => {
    if (!user || isBusy) return;
    setIsBusy(true);
    try {
      const result = await takeBack(user.uid, executionId);
      if (result.kind === 'done') {
        setOpenVersion(null);
        addToast({ title: HELM_COPY.historyUndone(summary), type: 'success' });
      } else {
        addToast({
          title:
            result.kind === 'offline'
              ? (lines?.offline ?? HELM_COPY.historyNeedsConnection)
              : result.reason === 'unreadable'
                ? HELM_COPY.historyRestoreFailed
                : (lines?.changed ?? HELM_COPY.historyChanged),
          type: 'info',
        });
      }
    } catch (error) {
      console.error('Helm move was not taken back', error);
      addToast({ title: HELM_COPY.historyRestoreFailed, type: 'error' });
    }
    setIsBusy(false);
  };

  const isNewest = opened !== null && opened.version === newest;
  const isFirst = opened !== null && opened.version === 1;
  const canChange = opened !== null && opened.version <= newest;
  const isTurnRow = isNewest && turnReasons.includes(opened.reason);
  const turn =
    isTurnRow && opened.executionId
      ? executionsById.get(opened.executionId)
      : undefined;
  const turnId = turn && canUndo(turn) ? turn.id : null;
  const canAct =
    canChange &&
    !(isFirst && !(canRestoreFirst && !isNewest)) &&
    !(isTurnRow && turnId === null);

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={opened ? HELM_COPY.historyVersionTitle(opened.version) : title}
      viewKey={opened ? `version-${opened.version}` : 'list'}
      footer={
        opened &&
        canAct && (
          <div className='px-6 pt-2 pb-3'>
            <ModalFooterActions
              note={
                !isNewest
                  ? HELM_COPY.historyRestoreHint
                  : undoHint(opened.createdBy)
              }
              rightActions={
                <Button
                  type='button'
                  variant='secondary'
                  loading={isBusy}
                  onClick={() =>
                    void (turnId
                      ? takeBackTurn(turnId, opened.title)
                      : change(
                          isNewest ? opened.version - 1 : opened.version,
                          isNewest ? opened.title : null,
                        ))
                  }
                >
                  {isNewest
                    ? HELM_COPY.historyUndo
                    : HELM_COPY.historyRestore(opened.version)}
                </Button>
              }
            />
          </div>
        )
      }
    >
      {opened ? (
        <div className='space-y-4'>
          <BackLink onBack={() => setOpenVersion(null)} label={title} />
          <div className='space-y-1'>
            <p className='text-foreground text-[15px] font-semibold'>
              {opened.reasonText}
              {opened.restoredFromVersion !== null &&
                `\u00a0· ${HELM_COPY.historyRestoredFrom(opened.restoredFromVersion)}`}
            </p>
            {opened.changeSummary && (
              <p className='text-foreground text-[15px] text-pretty'>
                {opened.changeSummary}
              </p>
            )}
            {opened.requestQuote && (
              <p className='text-muted-foreground text-[13px] text-pretty'>
                “{opened.requestQuote}”
              </p>
            )}
            <p className='text-muted-foreground text-[13px]'>
              {lineOf(opened)}
            </p>
            <p className='text-muted-foreground text-[13px]'>
              {opened.contentLine}
            </p>
          </div>
          {isFirst && (
            <p className='text-muted-foreground text-[13px]'>
              {HELM_COPY.historyFirstVersion}
            </p>
          )}
          {renderVersion(opened.version)}
        </div>
      ) : hasFailed ? (
        <p className='text-muted-foreground text-[15px]'>
          {HELM_COPY.historyFailed}
        </p>
      ) : rows && rows.length === 0 ? (
        <p className='text-muted-foreground text-[15px]'>
          {HELM_COPY.historyEmpty}
        </p>
      ) : (
        rows && (
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {rows.map((entry) => (
              <li key={entry.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  className={ROW}
                  onClick={() => setOpenVersion(entry.version)}
                >
                  <span className='min-w-0 flex-1'>
                    <span className='text-foreground block text-[15px] leading-[21px] break-words'>
                      {entry.title}
                    </span>
                    {entry.changeSummary &&
                      entry.title !== entry.changeSummary && (
                        <span className='text-muted-foreground line-clamp-2 text-[13px] break-words'>
                          {entry.changeSummary}
                        </span>
                      )}
                    <span className='text-muted-foreground block text-[13px]'>
                      {lineOf(entry)}
                      {entry.version === newest &&
                        `\u00a0· ${HELM_COPY.historyNewest}`}
                    </span>
                  </span>
                  <ChevronRight
                    className='text-muted-foreground size-4 shrink-0'
                    aria-hidden='true'
                  />
                </Button>
              </li>
            ))}
          </ul>
        )
      )}
    </DetailSheet>
  );
}

/** A thing's History: what changed, when and by whom, newest first. A row opens in place with Undo on the newest and Restore on an older one. */
function VersionsSheet({ isOpen, ...rest }: VersionsSheetProps) {
  return isOpen ? <VersionsBody {...rest} /> : null;
}

export default VersionsSheet;

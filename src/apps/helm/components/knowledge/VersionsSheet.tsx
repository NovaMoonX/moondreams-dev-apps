import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight } from 'lucide-react';

import BackLink from '@/components/BackLink';
import DetailSheet from '@/components/DetailSheet';
import MarkdownText from '@/components/MarkdownText';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useTopicVersions } from '@apps/helm/hooks/useTopicVersions';
import { canUndo } from '@apps/helm/nomos/planUndo';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  restoreTopicVersion,
  type DocumentChange,
} from '@apps/helm/store/actions/topicActions';
import { selectExecutionsById } from '@apps/helm/store/selectors/captureSelectors';
import { takeBack } from '@apps/helm/store/actions/undoActions';
import type { OpenTopic, OpenTopicVersion } from '@apps/helm/types';

interface VersionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  topic: OpenTopic;
}

const ROW =
  'flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2';

const whenOf = (at: number) => `${formatDateShort(at)}, ${formatTime(at)}`;

const SUMMARY_REASONS = [
  'personEdit',
  'revisedOnRequest',
  'sourceRemoved',
  'addedFromSource',
];

const rowTitle = (entry: OpenTopicVersion) =>
  SUMMARY_REASONS.includes(entry.reason) && entry.changeSummary
    ? entry.changeSummary
    : HELM_COPY.historyReason(entry.reason);

const failureLine = (kind: Exclude<DocumentChange, 'saved'>) =>
  kind === 'offline'
    ? HELM_COPY.historyNeedsConnection
    : kind === 'changed'
      ? HELM_COPY.historyChanged
      : kind === 'busy'
        ? HELM_COPY.sectionBusy
        : kind === 'first'
          ? HELM_COPY.historyFirstVersion
          : HELM_COPY.historyRestoreFailed;

function VersionsBody({ topic, onClose }: Omit<VersionsSheetProps, 'isOpen'>) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const assistant = useAssistantName();
  const { versions, hasFailed } = useTopicVersions(topic.id);
  const executionsById = useAppSelector(selectExecutionsById);
  const [openVersion, setOpenVersion] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const opened =
    versions?.find((entry) => entry.version === openVersion) ?? null;
  const lineOf = (entry: OpenTopicVersion) =>
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
      const result = await restoreTopicVersion(
        user.uid,
        await getHelmEncryption(user.uid),
        topic.id,
        topic.version,
        target,
      );
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
        addToast({ title: failureLine(result), type: 'info' });
      }
    } catch (error) {
      console.error('Helm topic version was not restored', error);
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
              ? HELM_COPY.historyNeedsConnection
              : result.reason === 'unreadable'
                ? HELM_COPY.historyRestoreFailed
                : HELM_COPY.historyChanged,
          type: 'info',
        });
      }
    } catch (error) {
      console.error('Helm topic move was not taken back', error);
      addToast({ title: HELM_COPY.historyRestoreFailed, type: 'error' });
    }
    setIsBusy(false);
  };

  const isNewest = opened !== null && opened.version === topic.version;
  const isFirst = opened !== null && opened.version === 1;
  const canChange = opened !== null && opened.version <= topic.version;
  const turn =
    isNewest &&
    (opened.reason === 'moved' || opened.reason === 'grouped') &&
    opened.executionId
      ? executionsById.get(opened.executionId)
      : undefined;
  const turnId = turn && canUndo(turn) ? turn.id : null;

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={
        opened
          ? HELM_COPY.historyVersionTitle(opened.version)
          : HELM_COPY.historyTitle(topic.name)
      }
      viewKey={opened ? `version-${opened.version}` : 'list'}
      footer={
        opened &&
        canChange &&
        !isFirst && (
          <div className='px-6 pt-2 pb-3'>
            <ModalFooterActions
              note={
                !isNewest
                  ? HELM_COPY.historyRestoreHint
                  : opened.createdBy === 'nomos'
                    ? `${HELM_COPY.historyUndoHint} ${HELM_COPY.historyUndoNotesHint}`
                    : HELM_COPY.historyUndoHint
              }
              rightActions={
                <Button
                  type='button'
                  variant='secondary'
                  loading={isBusy}
                  onClick={() =>
                    void (turnId
                      ? takeBackTurn(turnId, rowTitle(opened))
                      : change(
                          isNewest ? opened.version - 1 : opened.version,
                          isNewest ? rowTitle(opened) : null,
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
          <BackLink
            onBack={() => setOpenVersion(null)}
            label={HELM_COPY.historyTitle(topic.name)}
          />
          <div className='space-y-1'>
            <p className='text-foreground text-[15px] font-semibold'>
              {HELM_COPY.historyReason(opened.reason)}
              {opened.restoredFromVersion !== null &&
                ` · ${HELM_COPY.historyRestoredFrom(opened.restoredFromVersion)}`}
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
              {HELM_COPY.historyPartsLine(opened.sections.length)}
            </p>
          </div>
          {isFirst && (
            <p className='text-muted-foreground text-[13px]'>
              {HELM_COPY.historyFirstVersion}
            </p>
          )}
          {opened.sections.map((section) => (
            <section key={section.id} className='space-y-2'>
              {section.heading && (
                <h3 className='text-foreground text-[15px] leading-[21px] font-semibold'>
                  {section.heading}
                </h3>
              )}
              <MarkdownText text={section.markdown} />
            </section>
          ))}
        </div>
      ) : hasFailed ? (
        <p className='text-muted-foreground text-[15px]'>
          {HELM_COPY.historyFailed}
        </p>
      ) : versions && versions.length === 0 ? (
        <p className='text-muted-foreground text-[15px]'>
          {HELM_COPY.historyEmpty}
        </p>
      ) : (
        versions && (
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {versions.map((entry) => (
              <li key={entry.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  className={ROW}
                  onClick={() => setOpenVersion(entry.version)}
                >
                  <span className='min-w-0 flex-1'>
                    <span className='text-foreground block text-[15px] leading-[21px] break-words'>
                      {rowTitle(entry)}
                    </span>
                    {entry.changeSummary &&
                      rowTitle(entry) !== entry.changeSummary && (
                        <span className='text-muted-foreground line-clamp-2 text-[13px] break-words'>
                          {entry.changeSummary}
                        </span>
                      )}
                    <span className='text-muted-foreground block text-[13px]'>
                      {lineOf(entry)}
                      {entry.version === topic.version &&
                        ` · ${HELM_COPY.historyNewest}`}
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

/** A topic's History: what changed, when and by whom, newest first. A row opens in place with Undo on the newest and Restore on an older one. */
function VersionsSheet({ isOpen, onClose, topic }: VersionsSheetProps) {
  return isOpen ? <VersionsBody topic={topic} onClose={onClose} /> : null;
}

export default VersionsSheet;

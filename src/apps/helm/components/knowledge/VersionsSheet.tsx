import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useTopicVersions } from '@apps/helm/hooks/useTopicVersions';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  restoreTopicVersion,
  type DocumentChange,
} from '@apps/helm/store/actions/topicActions';
import type { OpenTopic, OpenTopicVersion } from '@apps/helm/types';

interface VersionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  topic: OpenTopic;
}

const ROW =
  'flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2';

const whenOf = (at: number) => `${formatDateShort(at)}, ${formatTime(at)}`;

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
  const [openVersion, setOpenVersion] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const newest = versions?.[0]?.version ?? null;
  const opened =
    versions?.find((entry) => entry.version === openVersion) ?? null;
  const lineOf = (entry: OpenTopicVersion) =>
    HELM_COPY.historyRowLine(
      entry.version,
      whenOf(entry.createdAt),
      entry.createdBy === 'person',
      assistant,
    );

  const change = async (target: number) => {
    if (!user || newest === null || isBusy) return;
    setIsBusy(true);
    try {
      const result = await restoreTopicVersion(
        user.uid,
        await getHelmEncryption(user.uid),
        topic.id,
        newest,
        target,
      );
      if (result === 'saved') {
        setOpenVersion(null);
        addToast({ title: HELM_COPY.historyRestored(target), type: 'success' });
      } else {
        addToast({ title: failureLine(result), type: 'info' });
      }
    } catch (error) {
      console.error('Helm topic version was not restored', error);
      addToast({ title: HELM_COPY.historyRestoreFailed, type: 'error' });
    }
    setIsBusy(false);
  };

  const isNewest = opened !== null && opened.version === newest;
  const isFirst = opened !== null && opened.version === 1;

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
        !isFirst && (
          <div className='px-6 pt-2 pb-3'>
            <ModalFooterActions
              note={
                isNewest
                  ? HELM_COPY.historyUndoHint
                  : HELM_COPY.historyRestoreHint
              }
              rightActions={
                <Button
                  type='button'
                  variant='secondary'
                  loading={isBusy}
                  onClick={() =>
                    void change(isNewest ? opened.version - 1 : opened.version)
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
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className="relative -ml-2 after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']"
            onClick={() => setOpenVersion(null)}
          >
            <ChevronLeft className='size-4' aria-hidden='true' />
            {HELM_COPY.historyTitle(topic.name)}
          </Button>
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
                      {HELM_COPY.historyReason(entry.reason)}
                    </span>
                    {entry.changeSummary && (
                      <span className='text-muted-foreground line-clamp-2 text-[13px] break-words'>
                        {entry.changeSummary}
                      </span>
                    )}
                    <span className='text-muted-foreground block text-[13px]'>
                      {lineOf(entry)}
                      {entry.version === newest &&
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

import MarkdownText from '@/components/MarkdownText';
import { useAuth } from '@/hooks/useAuth';
import VersionsSheet, {
  type VersionRow,
} from '@apps/helm/components/shell/VersionsSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useTopicVersions } from '@apps/helm/hooks/useTopicVersions';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { restoreTopicVersion } from '@apps/helm/store/actions/topicActions';
import type { OpenTopic, OpenTopicVersion } from '@apps/helm/types';

interface TopicVersionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  topic: OpenTopic;
}

const SUMMARY_REASONS = [
  'personEdit',
  'revisedOnRequest',
  'sourceRemoved',
  'addedFromSource',
];

const toRow = (entry: OpenTopicVersion): VersionRow => ({
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
      : HELM_COPY.historyReason(entry.reason),
  reasonText: HELM_COPY.historyReason(entry.reason),
  contentLine: HELM_COPY.historyPartsLine(entry.sections.length),
});

function TopicVersionsBody({
  topic,
  onClose,
}: Omit<TopicVersionsSheetProps, 'isOpen'>) {
  const { user } = useAuth();
  const { versions, hasFailed } = useTopicVersions(topic.id);

  return (
    <VersionsSheet
      isOpen
      onClose={onClose}
      title={HELM_COPY.historyTitle(topic.name)}
      newest={topic.version}
      rows={versions && versions.map(toRow)}
      hasFailed={hasFailed}
      turnReasons={['moved', 'grouped']}
      undoHint={(createdBy) =>
        createdBy === 'nomos'
          ? `${HELM_COPY.historyUndoHint} ${HELM_COPY.historyUndoNotesHint}`
          : HELM_COPY.historyUndoHint
      }
      onRestore={async (target) =>
        user
          ? restoreTopicVersion(
              user.uid,
              await getHelmEncryption(user.uid),
              topic.id,
              topic.version,
              target,
            )
          : 'missing'
      }
      renderVersion={(version) =>
        (
          versions?.find((entry) => entry.version === version)?.sections ?? []
        ).map((section) => (
          <section key={section.id} className='space-y-2'>
            {section.heading && (
              <h3 className='text-foreground text-[15px] leading-[21px] font-semibold'>
                {section.heading}
              </h3>
            )}
            <MarkdownText text={section.markdown} />
          </section>
        ))
      }
    />
  );
}

/** A topic's History, with its parts shown under each version. */
function TopicVersionsSheet({
  isOpen,
  onClose,
  topic,
}: TopicVersionsSheetProps) {
  return isOpen ? <TopicVersionsBody topic={topic} onClose={onClose} /> : null;
}

export default TopicVersionsSheet;

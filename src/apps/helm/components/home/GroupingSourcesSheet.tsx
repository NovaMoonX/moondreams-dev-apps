import DetailSheet from '@/components/DetailSheet';
import GroupingSourceRow from '@apps/helm/components/home/GroupingSourceRow';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenGrouping } from '@apps/helm/types';

interface GroupingSourcesSheetProps {
  grouping: OpenGrouping;
  isOpen: boolean;
  onClose: () => void;
}

/** Every thing a grouping holds, for the ones the card has no room for. */
function GroupingSourcesSheet({
  grouping,
  isOpen,
  onClose,
}: GroupingSourcesSheetProps) {
  return (
    <DetailSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.groupingSourcesTitle}
    >
      <ul className='space-y-3'>
        {grouping.sources.map((source) => (
          <GroupingSourceRow
            key={source.key}
            source={source}
            title={grouping.titles[source.key]}
          />
        ))}
      </ul>
    </DetailSheet>
  );
}

export default GroupingSourcesSheet;

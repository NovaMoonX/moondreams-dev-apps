import type { MeetingFormat } from '@apps/helm/types';
import { getMeetingWhereParts } from '@apps/helm/utils/meetingWhere';

interface MeetingWhereProps {
  how: MeetingFormat | null;
  place: string | null;
  /** True when the line already has words before it, so this starts with its separator. */
  hasBefore: boolean;
}

function MeetingWhere({ how, place, hasBefore }: MeetingWhereProps) {
  const parts = getMeetingWhereParts(how, place);
  if (!parts.format && !parts.place) return null;
  return (
    <>
      {hasBefore ? ' · ' : ''}
      {parts.format && (
        <span className='whitespace-nowrap'>{parts.format}</span>
      )}
      {parts.format && parts.place ? ' · ' : ''}
      {parts.place}
    </>
  );
}

export default MeetingWhere;

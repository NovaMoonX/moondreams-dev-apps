import { Select } from '@moondreamsdev/dreamer-ui/components';

import DateInput from '@/components/DateInput';
import { PillGroup } from '@/components/PillGroup';
import type {
  ConnectionKind,
  CoupleStatus,
} from '@apps/helm/engine/connections';
import { HELM_COPY } from '@apps/helm/constants';
import type { KinKind } from '@apps/helm/types';
import {
  FAMILY_OPTIONS,
  NOT_SURE,
  STATUS_OPTIONS,
} from '@apps/helm/utils/connectionText';

interface ConnectionFieldsProps {
  kind: ConnectionKind;
  name: string;
  otherName: string;
  /** What the other is to this person. */
  word: KinKind | null;
  status: CoupleStatus | null;
  /** A date input's value. */
  since: string;
  onWordChange: (word: KinKind | null) => void;
  onStatusChange: (status: CoupleStatus) => void;
  onSinceChange: (since: string) => void;
}

/** The family word for family, the status and an optional since for a couple; a friend or coworker has nothing more. */
function ConnectionFields({
  kind,
  name,
  otherName,
  word,
  status,
  since,
  onWordChange,
  onStatusChange,
  onSinceChange,
}: ConnectionFieldsProps) {
  return (
    <>
      {kind === 'family' && (
        <div className='space-y-1.5'>
          <span className='block text-sm font-medium break-words'>
            {HELM_COPY.connectionFamilyField(otherName, name)}
          </span>
          <Select
            options={FAMILY_OPTIONS}
            value={word ?? NOT_SURE}
            onChange={(value) =>
              onWordChange(value === NOT_SURE ? null : (value as KinKind))
            }
          />
        </div>
      )}
      {kind === 'couple' && (
        <>
          <div className='space-y-1.5'>
            <span className='block text-sm font-medium'>
              {HELM_COPY.connectionStatusField}
            </span>
            <PillGroup
              label={HELM_COPY.connectionStatusField}
              isThin
              wrapsNarrow
              options={STATUS_OPTIONS}
              value={status}
              onChange={onStatusChange}
            />
          </div>
          <div className='space-y-1.5'>
            <span className='block text-sm font-medium'>
              {HELM_COPY.connectionSinceField}
            </span>
            <DateInput
              aria-label={HELM_COPY.connectionSinceField}
              value={since}
              onChange={(event) => onSinceChange(event.target.value)}
            />
          </div>
        </>
      )}
    </>
  );
}

export default ConnectionFields;

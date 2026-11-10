import DetailSheet from '@/components/DetailSheet';
import SyncedSourceBlock from '@apps/helm/components/connections/SyncedSourceBlock';
import { useSourceAppName } from '@apps/helm/hooks/useSourceAppName';
import type { SyncedRecord } from '@apps/helm/types';

interface SyncedSheetProps {
  record: SyncedRecord | null;
  now: number;
  onClose: () => void;
}

/** A copied record, read-only: its words, then where it came from. */
function SyncedSheet({ record, now, onClose }: SyncedSheetProps) {
  const { nameOf } = useSourceAppName();
  return (
    <DetailSheet
      isOpen={record !== null}
      onClose={onClose}
      title={record?.sealed.title ?? ''}
    >
      {record && (
        <div className='flex flex-col gap-4'>
          {[record.sealed.subtitle, record.sealed.placeLabel]
            .filter((line): line is string => !!line)
            .map((line) => (
              <p key={line} className='text-[15px] break-words'>
                {line}
              </p>
            ))}
          {record.sealed.detail && (
            <p className='text-muted-foreground text-[15px] text-pretty whitespace-pre-line'>
              {record.sealed.detail}
            </p>
          )}
          <SyncedSourceBlock
            record={record}
            appName={nameOf(record.connectorId)}
            now={now}
            onOpened={onClose}
          />
        </div>
      )}
    </DetailSheet>
  );
}

export default SyncedSheet;

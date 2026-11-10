import Pill from '@/components/Pill';
import { PillRow } from '@/components/PillGroup';
import { HELM_COPY } from '@apps/helm/constants';
import { formatStripDay } from '@apps/helm/utils/planDays';

interface DayStripProps {
  keys: string[];
  todayKey: string;
  selectedKey: string;
  onSelect: (key: string) => void;
}

/** Yesterday, today and the next six days, one pill each, today's by its name. */
function DayStrip({ keys, todayKey, selectedKey, onSelect }: DayStripProps) {
  return (
    <PillRow
      label={HELM_COPY.dayStripLabel}
      isScrolling
      scrollKey={selectedKey}
    >
      {keys.map((key) => (
        <Pill
          key={key}
          isSelected={key === selectedKey}
          onClick={() => onSelect(key)}
        >
          {key === todayKey ? HELM_COPY.dayStripToday : formatStripDay(key)}
        </Pill>
      ))}
    </PillRow>
  );
}

export default DayStrip;

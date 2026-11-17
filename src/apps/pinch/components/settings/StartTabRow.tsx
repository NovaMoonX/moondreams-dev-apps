import { PillGroup } from '@/components/PillGroup';
import SummaryEditor from '@/components/SummaryEditor';
import type { SummaryGroupPosition } from '@/components/summaryGroup';
import {
  PINCH_TAB_LABELS,
  START_TAB_CHOICES,
  toStartTab,
} from '@apps/pinch/constants';
import { usePinchSettings } from '@apps/pinch/hooks/usePinchSettings';

interface StartTabRowProps {
  uid: string;
  position: SummaryGroupPosition;
}

/** Which tab Pinch opens on. Saved with the account, so every device opens the same way. */
function StartTabRow({ uid, position }: StartTabRowProps) {
  const { settings, save } = usePinchSettings(uid);
  const tab = toStartTab(settings.defaultTab);

  return (
    <li className='-mx-3'>
      <SummaryEditor
        label='Opening screen'
        title='Opening screen'
        groupPosition={position}
        icon='🏠'
        summary={PINCH_TAB_LABELS[tab]}
        placeholder=''
        shouldFocus={false}
      >
        <p className='text-muted-foreground text-sm text-pretty'>
          The tab you land on when you open Pinch, on every device you use.
        </p>
        <PillGroup
          label='Open Pinch on'
          options={START_TAB_CHOICES.map((choice) => ({
            value: choice,
            label: PINCH_TAB_LABELS[choice],
          }))}
          value={tab}
          onChange={(defaultTab) => void save({ defaultTab })}
        />
      </SummaryEditor>
    </li>
  );
}

export default StartTabRow;

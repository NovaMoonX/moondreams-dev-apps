import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useAppSelector } from '@/store';
import { LINK_BANKS_GATE_ID } from '@apps/runway/constants';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';

/** Whether the Link entry points show: the switch is on for this person and the plan is at Track or Link. Otherwise nothing about linking is drawn. */
export function useCanLinkBank() {
  const isGateOpen = useIsGateOpen('runway', LINK_BANKS_GATE_ID);
  const level = useAppSelector(selectLevel);
  return isGateOpen && level !== 'plan';
}

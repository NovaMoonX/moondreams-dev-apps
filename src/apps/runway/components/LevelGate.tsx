import type { ReactNode } from 'react';

import { useAppSelector } from '@/store';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import type { Level } from '@apps/runway/types';

interface LevelGateProps {
  /** The lowest level that needs the children. */
  level: Level;
  children: ReactNode;
}

/** Draws its children only at the level that needs them; below it nothing is drawn, so nothing is ever greyed out. */
function LevelGate({ level, children }: LevelGateProps) {
  const current = useAppSelector(selectLevel);
  if (level === 'track' && current === 'plan') return null;
  return <>{children}</>;
}

export default LevelGate;

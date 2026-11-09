/** The views that have a screen so far; each later issue adds its own. */
export type HelmView = 'home' | 'today';

export interface HelmProfile {
  /** IANA zone, set from the device on first open. */
  timeZone: string;
  /** Floating "HH:mm": the earliest a slot may start. */
  dayStartTime: string;
  dayEndTime: string;
  /** Share of free time the planner may fill. */
  planFillPercent: number;
  createdAt: number;
  lastEditedAt: number | null;
}

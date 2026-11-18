// The types the vendored planner reads, as the server holds them (src/apps/helm/types.ts is the client's).
import type { DayPart } from '../nomos/habitDay.js';
import type { TaskDue } from '../nomos/commands.js';

export type { TaskDue };
export type Importance = 'must' | 'should' | 'could';
export type Energy = 'low' | 'medium' | 'high';
export type TaskContext = 'atHome' | 'out' | 'atComputer' | 'onPhone';
export type TaskEffort = 'light' | 'moderate' | 'heavy';
export type PatternBucket = {
  kind: 'weekdayPart';
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  part: DayPart;
};

export interface PlanSlot {
  taskId: string;
  startAt: number | null;
  endAt: number | null;
  status: 'suggested' | 'kept' | 'notToday';
  source: 'nomos' | 'person';
  decidedAt: number | null;
  overlapsEventRef: string | null;
}

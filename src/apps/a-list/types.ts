export interface MembershipProfile {
  /** Equals the document id; immutable. */
  uid: string;
  /** Before tax: what the member typed in Setup. */
  monthlyCostCents: number;
  /** Tax included: the bill total. Equals `monthlyCostCents` when no bill total was given. */
  monthlyTotalCents: number;
  /** Decimal fraction gauged from the bill (0.075 = 7.5%); null when no bill total was given. */
  taxRate: number | null;
  /** Date-only (UTC midnight): the day the membership started. */
  startDate: number;
  weeklyGoal: number | null;
  monthlyGoal: number | null;
  /** Immutable; its presence is what "Setup is done" means. */
  setupCompletedAt: number;
  createdAt: number;
  lastEditedAt: number;
}

export type AListTab = 'dashboard' | 'calendar' | 'watchlist';

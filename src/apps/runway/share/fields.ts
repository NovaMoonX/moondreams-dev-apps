import type { ShareDecision } from '@/lib/connections/fieldDecisions';
import type {
  PlanSealedFields,
  HoldsPromptChoice,
  PlanNotify,
  TrackingPeriod,
  SortingState,
  PlanDoc,
  ShareSummary,
  MoneyRange,
  Ending,
  Schedule,
  SourceSealed,
  PayLineSealed,
  Pairing,
  DayOverrideSealed,
  IncomeDayDoc,
  DayRecordDoc,
  RecordLine,
  ProposedSealed,
  ConfirmedSealed,
  CorrectionChange,
  CorrectionSealed,
  FundingRule,
  FundingPay,
  PriorityExtra,
  EnvelopeSealed,
  BillSealed,
  GroupSealed,
  GoalSealed,
  HorizonMoneyLeft,
  HorizonLink,
  HorizonSealed,
  HorizonCost,
  PlanItemDoc,
  MatchSealed,
  CardDoc,
  CardSealed,
  CardAnnualFee,
  AccountDoc,
  AccountSealed,
  LinkDoc,
  LinkProviderAccount,
  LinkSealed,
  AccountBalanceDoc,
  CardStatementDoc,
  CardStatementSealed,
  ExpenseDoc,
  ExpenseSealed,
  RuleDoc,
  RuleSealed,
  MemoryDoc,
  RouteMemorySealed,
  PayerMemorySealed,
  ReceiptImageDoc,
  ReceiptImageSealed,
  PlanVersionDoc,
  ChangeMove,
  ChangeSealed,
  ChangeDoc,
  MoveDoc,
  BillPaidSealed,
  AutoPaidMark,
  CostPaidSealed,
  CardPaymentSealed,
  TransferSealed,
  StartSealed,
  TrackingChangeSealed,
  PurchaseLine,
  CostRef,
  BillRef,
  PurchaseSealed,
  PurchaseDoc,
  ReleasedChargeDoc,
  ReleasedChargeSealed,
  ClosingSealed,
  ClosingDoc,
} from '@apps/runway/types';

const PLAN_SEALED_FIELDS_FIELDS = {
  currencyCode: 'shared',
  notifyHour: 'notUseful',
  notifyTimeZone: 'notUseful',
  holdsPrompt: 'notUseful',
  bankBackedSeenAt: 'notUseful',
  horizonNudgeDismissed: 'notUseful',
  homePins: 'notUseful',
} satisfies Record<keyof PlanSealedFields, ShareDecision>;

const HOLDS_PROMPT_CHOICE_FIELDS = {
  askAfter: 'notUseful',
  isOff: 'notUseful',
} satisfies Record<keyof HoldsPromptChoice, ShareDecision>;

const PLAN_NOTIFY_FIELDS = {
  needsHome: 'notUseful',
} satisfies Record<keyof PlanNotify, ShareDecision>;

const TRACKING_PERIOD_FIELDS = {
  from: 'notUseful',
  to: 'notUseful',
  linkedFrom: 'notUseful',
} satisfies Record<keyof TrackingPeriod, ShareDecision>;

const SORTING_STATE_FIELDS = {
  isPaused: 'notUseful',
  from: 'notUseful',
} satisfies Record<keyof SortingState, ShareDecision>;

const PLAN_DOC_FIELDS = {
  uid: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'notUseful',
  stance: 'notUseful',
  startDate: 'notUseful',
  trackingPeriods: 'notUseful',
  dirtyFrom: 'notUseful',
  notify: 'notUseful',
  sorting: 'notUseful',
  keyId: 'notUseful',
  sealed: 'shared',
  shareSummary: 'shared',
} satisfies Record<keyof PlanDoc, ShareDecision>;

const SHARE_SUMMARY_FIELDS = {
  computedAt: 'shared',
  currency: 'shared',
  freeToSpendCents: 'shared',
  nextIncomeOn: 'shared',
  dueBeforeIncomeCents: 'shared',
  bills: 'shared',
  horizon: 'shared',
} satisfies Record<keyof ShareSummary, ShareDecision>;

const MONEY_RANGE_FIELDS = {
  lowCents: 'never',
  highCents: 'never',
} satisfies Record<keyof MoneyRange, ShareDecision>;

const ENDING_FIELDS = {
  onDate: 'notUseful',
  afterCount: 'notUseful',
} satisfies Record<keyof Ending, ShareDecision>;

const SCHEDULE_FIELDS = {
  kind: 'notUseful',
  anchor: 'notUseful',
  monthDays: 'notUseful',
  intervalMonths: 'notUseful',
} satisfies Record<keyof Schedule, ShareDecision>;

const SOURCE_SEALED_FIELDS = {
  name: 'never',
  pairings: 'never',
} satisfies Record<keyof SourceSealed, ShareDecision>;

const PAY_LINE_SEALED_FIELDS = {
  name: 'never',
  schedule: 'never',
  amount: 'never',
  ending: 'never',
  stanceOverride: 'never',
  accountId: 'never',
  pairings: 'never',
} satisfies Record<keyof PayLineSealed, ShareDecision>;

const PAIRING_FIELDS = {
  targetItemId: 'notUseful',
  amount: 'never',
  topUpFromAnySource: 'notUseful',
} satisfies Record<keyof Pairing, ShareDecision>;

const DAY_OVERRIDE_SEALED_FIELDS = {
  pairings: 'notUseful',
  holdResolutions: 'notUseful',
  payloads: 'notUseful',
  billCents: 'never',
} satisfies Record<keyof DayOverrideSealed, ShareDecision>;

const INCOME_DAY_DOC_FIELDS = {
  id: 'never',
  payLineId: 'never',
  sourceId: 'never',
  expectedOn: 'never',
  arrivedOn: 'never',
  status: 'never',
  createdAt: 'never',
  confirmedAt: 'never',
  doneLineIds: 'never',
  sealed: 'never',
} satisfies Record<keyof IncomeDayDoc, ShareDecision>;

const DAY_RECORD_DOC_FIELDS = {
  id: 'never',
  dayId: 'never',
  kind: 'never',
  createdAt: 'never',
  sealed: 'never',
  supersedesId: 'never',
} satisfies Record<keyof DayRecordDoc, ShareDecision>;

const RECORD_LINE_FIELDS = {
  lineId: 'never',
  itemId: 'never',
  part: 'never',
  name: 'never',
  emoji: 'never',
  tier: 'never',
  demandCents: 'never',
  cents: 'never',
  shortBy: 'never',
  paidBy: 'never',
  costId: 'never',
  costName: 'never',
  repaysFree: 'never',
} satisfies Record<keyof RecordLine, ShareDecision>;

const PROPOSED_SEALED_FIELDS = {
  fingerprint: 'never',
  stance: 'never',
  expectedCents: 'never',
  freeToSpendCents: 'never',
  lines: 'never',
} satisfies Record<keyof ProposedSealed, ShareDecision>;

const CONFIRMED_SEALED_FIELDS = {
  fingerprint: 'never',
  stance: 'never',
  arrivedCents: 'never',
  expectedCents: 'never',
  freeToSpendCents: 'never',
  lines: 'never',
  differences: 'never',
} satisfies Record<keyof ConfirmedSealed, ShareDecision>;

const CORRECTION_CHANGE_FIELDS = {
  lineId: 'never',
  itemId: 'never',
  name: 'never',
  emoji: 'never',
  beforeCents: 'never',
  afterCents: 'never',
} satisfies Record<keyof CorrectionChange, ShareDecision>;

const CORRECTION_SEALED_FIELDS = {
  stance: 'never',
  arrivedCents: 'never',
  freeToSpendCents: 'never',
  lines: 'never',
  before: 'never',
  changes: 'never',
  note: 'never',
} satisfies Record<keyof CorrectionSealed, ShareDecision>;

const FUNDING_RULE_FIELDS = {
  amount: 'never',
  cadence: 'notUseful',
  sourceId: 'notUseful',
  pay: 'notUseful',
} satisfies Record<keyof FundingRule, ShareDecision>;

const FUNDING_PAY_FIELDS = {
  payLineId: 'notUseful',
  monthDay: 'notUseful',
} satisfies Record<keyof FundingPay, ShareDecision>;

const PRIORITY_EXTRA_FIELDS = {
  tier: 'notUseful',
  cents: 'never',
  orderIndex: 'notUseful',
} satisfies Record<keyof PriorityExtra, ShareDecision>;

const ENVELOPE_SEALED_FIELDS = {
  name: 'shared',
  emoji: 'notUseful',
  priority: 'notUseful',
  orderIndex: 'notUseful',
  funding: 'notUseful',
  maxCents: 'never',
  groupId: 'notUseful',
  spillTo: 'notUseful',
  startingCents: 'never',
  extras: 'notUseful',
} satisfies Record<keyof EnvelopeSealed, ShareDecision>;

const BILL_SEALED_FIELDS = {
  name: 'notUseful',
  emoji: 'notUseful',
  priority: 'notUseful',
  orderIndex: 'notUseful',
  amount: 'never',
  timing: 'notUseful',
  ending: 'notUseful',
  fundedBy: 'notUseful',
  stanceOverride: 'notUseful',
  groupId: 'notUseful',
  paidByCardId: 'never',
  accountId: 'never',
  paysItself: 'notUseful',
  startingCents: 'never',
  payOnDay: 'notUseful',
  cardFeeOf: 'notUseful',
} satisfies Record<keyof BillSealed, ShareDecision>;

const GROUP_SEALED_FIELDS = {
  name: 'notUseful',
  startingPriority: 'notUseful',
  envelopePriority: 'notUseful',
  goalPriority: 'notUseful',
  emoji: 'notUseful',
} satisfies Record<keyof GroupSealed, ShareDecision>;

const GOAL_SEALED_FIELDS = {
  name: 'notUseful',
  emoji: 'notUseful',
  priority: 'notUseful',
  orderIndex: 'notUseful',
  targetCents: 'never',
  targetDate: 'notUseful',
  funding: 'notUseful',
  startingCents: 'never',
  state: 'notUseful',
  extras: 'notUseful',
  groupId: 'notUseful',
} satisfies Record<keyof GoalSealed, ShareDecision>;

const HORIZON_MONEY_LEFT_FIELDS = {
  kind: 'notUseful',
  toId: 'notUseful',
  cents: 'never',
  moveId: 'notUseful',
} satisfies Record<keyof HorizonMoneyLeft, ShareDecision>;

const HORIZON_LINK_FIELDS = {
  changeId: 'notUseful',
  itemId: 'notUseful',
} satisfies Record<keyof HorizonLink, ShareDecision>;

const HORIZON_SEALED_FIELDS = {
  name: 'notUseful',
  emoji: 'notUseful',
  happensOn: 'notUseful',
  happensUntil: 'notUseful',
  priority: 'notUseful',
  orderIndex: 'notUseful',
  rest: 'notUseful',
  note: 'never',
  costs: 'never',
  state: 'notUseful',
  stateOn: 'notUseful',
  stateMoney: 'notUseful',
  links: 'notUseful',
  goalId: 'notUseful',
} satisfies Record<keyof HorizonSealed, ShareDecision>;

const HORIZON_COST_FIELDS = {
  id: 'notUseful',
  name: 'notUseful',
  amount: 'never',
  schedule: 'notUseful',
  ending: 'notUseful',
  isOutside: 'notUseful',
  pricedOn: 'notUseful',
  endsAfter: 'notUseful',
  becameBillId: 'notUseful',
  becameBillOn: 'notUseful',
  priority: 'notUseful',
  note: 'never',
} satisfies Record<keyof HorizonCost, ShareDecision>;

const PLAN_ITEM_DOC_FIELDS = {
  id: 'notUseful',
  kind: 'filter',
  parentId: 'notUseful',
  createdAt: 'notUseful',
  endedAt: 'filter',
  archivedAt: 'filter',
  heldReleasedOn: 'notUseful',
  matchSealed: 'notUseful',
} satisfies Record<keyof PlanItemDoc, ShareDecision>;

const MATCH_SEALED_FIELDS = {
  merchantKeys: 'notUseful',
} satisfies Record<keyof MatchSealed, ShareDecision>;

const CARD_DOC_FIELDS = {
  id: 'never',
  createdAt: 'never',
  updatedAt: 'never',
  archivedAt: 'never',
  linkId: 'never',
  sealed: 'never',
} satisfies Record<keyof CardDoc, ShareDecision>;

const CARD_SEALED_FIELDS = {
  issuer: 'never',
  name: 'never',
  dueDay: 'never',
  lastFour: 'never',
  payFromAccountId: 'never',
  annualFee: 'never',
} satisfies Record<keyof CardSealed, ShareDecision>;

const CARD_ANNUAL_FEE_FIELDS = {
  cents: 'never',
  firstDueOn: 'never',
  billId: 'never',
} satisfies Record<keyof CardAnnualFee, ShareDecision>;

const ACCOUNT_DOC_FIELDS = {
  id: 'never',
  createdAt: 'never',
  updatedAt: 'never',
  archivedAt: 'never',
  linkId: 'never',
  sealed: 'never',
} satisfies Record<keyof AccountDoc, ShareDecision>;

const ACCOUNT_SEALED_FIELDS = {
  name: 'never',
  institution: 'never',
  kind: 'never',
  countedTowardTotal: 'never',
  isPullAccount: 'never',
  lastFour: 'never',
  balanceCents: 'never',
  balanceOn: 'never',
  holds: 'never',
  apyBps: 'never',
  interestDay: 'never',
} satisfies Record<keyof AccountSealed, ShareDecision>;

const LINK_DOC_FIELDS = {
  id: 'never',
  status: 'never',
  lastSyncAt: 'never',
  createdAt: 'never',
  needsCardConsent: 'never',
  cardDetails: 'never',
  sealed: 'never',
} satisfies Record<keyof LinkDoc, ShareDecision>;

const LINK_PROVIDER_ACCOUNT_FIELDS = {
  providerAccountId: 'never',
  name: 'never',
  kind: 'never',
  mask: 'never',
  balanceCents: 'never',
  accountId: 'never',
  cardId: 'never',
  isSkipped: 'never',
} satisfies Record<keyof LinkProviderAccount, ShareDecision>;

const LINK_SEALED_FIELDS = {
  institutionName: 'never',
  institutionLogo: 'never',
  providerAccounts: 'never',
} satisfies Record<keyof LinkSealed, ShareDecision>;

const ACCOUNT_BALANCE_DOC_FIELDS = {
  id: 'never',
  asOf: 'never',
  sealed: 'never',
} satisfies Record<keyof AccountBalanceDoc, ShareDecision>;

const CARD_STATEMENT_DOC_FIELDS = {
  id: 'never',
  asOf: 'never',
  sealed: 'never',
} satisfies Record<keyof CardStatementDoc, ShareDecision>;

const CARD_STATEMENT_SEALED_FIELDS = {
  minimumCents: 'never',
  statementCents: 'never',
  statementOn: 'never',
  dueOn: 'never',
  lastPaymentCents: 'never',
  lastPaymentOn: 'never',
} satisfies Record<keyof CardStatementSealed, ShareDecision>;

const EXPENSE_DOC_FIELDS = {
  id: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'notUseful',
  sealed: 'notUseful',
} satisfies Record<keyof ExpenseDoc, ShareDecision>;

const EXPENSE_SEALED_FIELDS = {
  name: 'never',
  note: 'never',
} satisfies Record<keyof ExpenseSealed, ShareDecision>;

const RULE_DOC_FIELDS = {
  id: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'notUseful',
  sealed: 'notUseful',
} satisfies Record<keyof RuleDoc, ShareDecision>;

const RULE_SEALED_FIELDS = {
  merchantKey: 'notUseful',
  merchantName: 'notUseful',
  category: 'notUseful',
  cardId: 'never',
  target: 'notUseful',
} satisfies Record<keyof RuleSealed, ShareDecision>;

const MEMORY_DOC_FIELDS = {
  id: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'notUseful',
  sealed: 'notUseful',
} satisfies Record<keyof MemoryDoc, ShareDecision>;

const ROUTE_MEMORY_SEALED_FIELDS = {
  kind: 'notUseful',
  fromAccountId: 'never',
  toAccountId: 'never',
  toCardId: 'never',
} satisfies Record<keyof RouteMemorySealed, ShareDecision>;

const PAYER_MEMORY_SEALED_FIELDS = {
  kind: 'notUseful',
  merchantKey: 'notUseful',
  merchantName: 'notUseful',
  payLineId: 'notUseful',
} satisfies Record<keyof PayerMemorySealed, ShareDecision>;

const RECEIPT_IMAGE_DOC_FIELDS = {
  id: 'never',
  purchaseId: 'never',
  createdAt: 'never',
  bytes: 'never',
  sealed: 'never',
} satisfies Record<keyof ReceiptImageDoc, ShareDecision>;

const RECEIPT_IMAGE_SEALED_FIELDS = {
  fileName: 'never',
  contentType: 'never',
  nonce: 'never',
} satisfies Record<keyof ReceiptImageSealed, ShareDecision>;

const PLAN_VERSION_DOC_FIELDS = {
  id: 'notUseful',
  itemId: 'filter',
  kind: 'filter',
  createdAt: 'filter',
  effectiveFrom: 'notUseful',
  effectiveUntil: 'notUseful',
  changeId: 'notUseful',
  sealed: 'shared',
} satisfies Record<keyof PlanVersionDoc, ShareDecision>;

const CHANGE_MOVE_FIELDS = {
  moveId: 'notUseful',
  date: 'notUseful',
  fromId: 'notUseful',
  toId: 'notUseful',
  cents: 'never',
  note: 'never',
  isOutside: 'notUseful',
  undoText: 'notUseful',
  isUndo: 'notUseful',
  bill: 'notUseful',
  cost: 'notUseful',
} satisfies Record<keyof ChangeMove, ShareDecision>;

const CHANGE_SEALED_FIELDS = {
  summary: 'notUseful',
  note: 'never',
  move: 'notUseful',
} satisfies Record<keyof ChangeSealed, ShareDecision>;

const CHANGE_DOC_FIELDS = {
  id: 'notUseful',
  kind: 'notUseful',
  createdAt: 'notUseful',
  effectiveFrom: 'notUseful',
  itemIds: 'notUseful',
  sealed: 'notUseful',
} satisfies Record<keyof ChangeDoc, ShareDecision>;

const MOVE_DOC_FIELDS = {
  id: 'notUseful',
  kind: 'notUseful',
  date: 'notUseful',
  refId: 'notUseful',
  reversesMoveId: 'notUseful',
  createdAt: 'notUseful',
  sealed: 'notUseful',
} satisfies Record<keyof MoveDoc, ShareDecision>;

const BILL_PAID_SEALED_FIELDS = {
  amountCents: 'never',
  paidOn: 'notUseful',
  fromFreeCents: 'never',
  cardId: 'never',
  auto: 'notUseful',
} satisfies Record<keyof BillPaidSealed, ShareDecision>;

const AUTO_PAID_MARK_FIELDS = {
  isEstimate: 'notUseful',
  purchaseId: 'notUseful',
} satisfies Record<keyof AutoPaidMark, ShareDecision>;

const COST_PAID_SEALED_FIELDS = {
  costId: 'notUseful',
  dueOn: 'notUseful',
  amountCents: 'never',
  paidOn: 'notUseful',
  fromFreeCents: 'never',
  mark: 'notUseful',
  purchaseId: 'notUseful',
  fromGoalCents: 'never',
  goalId: 'notUseful',
} satisfies Record<keyof CostPaidSealed, ShareDecision>;

const CARD_PAYMENT_SEALED_FIELDS = {
  amountCents: 'never',
  covers: 'notUseful',
} satisfies Record<keyof CardPaymentSealed, ShareDecision>;

const TRANSFER_SEALED_FIELDS = {
  fromId: 'notUseful',
  toId: 'notUseful',
  cents: 'never',
  note: 'never',
  isOutside: 'notUseful',
} satisfies Record<keyof TransferSealed, ShareDecision>;

const START_SEALED_FIELDS = {
  amountCents: 'never',
  holding: 'notUseful',
} satisfies Record<keyof StartSealed, ShareDecision>;

const TRACKING_CHANGE_SEALED_FIELDS = {
  direction: 'notUseful',
} satisfies Record<keyof TrackingChangeSealed, ShareDecision>;

const PURCHASE_LINE_FIELDS = {
  envelopeId: 'shared',
  cents: 'never',
  via: 'never',
} satisfies Record<keyof PurchaseLine, ShareDecision>;

const COST_REF_FIELDS = {
  itemId: 'notUseful',
  costId: 'notUseful',
  dueOn: 'notUseful',
} satisfies Record<keyof CostRef, ShareDecision>;

const BILL_REF_FIELDS = {
  billId: 'notUseful',
  dueOn: 'notUseful',
  moveId: 'notUseful',
} satisfies Record<keyof BillRef, ShareDecision>;

const PURCHASE_SEALED_FIELDS = {
  amountCents: 'shared',
  merchant: 'shared',
  merchantLogo: 'notUseful',
  bankName: 'notUseful',
  category: 'notUseful',
  ruleId: 'notUseful',
  label: 'shared',
  note: 'never',
  lines: 'shared',
  refundOfId: 'notUseful',
  paidByCardId: 'never',
  link: 'notUseful',
  receiptText: 'never',
  costRef: 'notUseful',
  billRef: 'shared',
  notSameAs: 'notUseful',
  incomeDayId: 'notUseful',
  assignedBy: 'notUseful',
  pairedWithId: 'notUseful',
  pairKind: 'notUseful',
  cardPaymentMoveId: 'notUseful',
  tickedDayKey: 'notUseful',
} satisfies Record<keyof PurchaseSealed, ShareDecision>;

const PURCHASE_DOC_FIELDS = {
  id: 'notUseful',
  date: 'shared',
  source: 'notUseful',
  status: 'notUseful',
  needsHome: 'filter',
  accountId: 'never',
  dedupeKey: 'notUseful',
  expenseId: 'notUseful',
  createdAt: 'notUseful',
  updatedAt: 'notUseful',
  sealed: 'shared',
} satisfies Record<keyof PurchaseDoc, ShareDecision>;

const RELEASED_CHARGE_DOC_FIELDS = {
  id: 'notUseful',
  date: 'notUseful',
  createdAt: 'notUseful',
  sealed: 'notUseful',
} satisfies Record<keyof ReleasedChargeDoc, ShareDecision>;

const RELEASED_CHARGE_SEALED_FIELDS = {
  title: 'notUseful',
  amountCents: 'never',
  lines: 'notUseful',
} satisfies Record<keyof ReleasedChargeSealed, ShareDecision>;

const CLOSING_SEALED_FIELDS = {
  version: 'notUseful',
  startDay: 'notUseful',
  arrivedCents: 'never',
  given: 'never',
  late: 'never',
  spentCents: 'never',
  spentByItem: 'never',
  funded: 'never',
  paid: 'never',
  charged: 'never',
  cardPaid: 'never',
  transfers: 'never',
  costPaid: 'never',
  repaid: 'never',
} satisfies Record<keyof ClosingSealed, ShareDecision>;

const CLOSING_DOC_FIELDS = {
  id: 'notUseful',
  month: 'notUseful',
  createdAt: 'notUseful',
  sealed: 'notUseful',
} satisfies Record<keyof ClosingDoc, ShareDecision>;

/** What runway lets Helm read, per stored field; an added, removed or renamed field fails the typecheck until it is decided here. */
export const SHARE_FIELDS = {
  PlanSealedFields: PLAN_SEALED_FIELDS_FIELDS,
  HoldsPromptChoice: HOLDS_PROMPT_CHOICE_FIELDS,
  PlanNotify: PLAN_NOTIFY_FIELDS,
  TrackingPeriod: TRACKING_PERIOD_FIELDS,
  SortingState: SORTING_STATE_FIELDS,
  PlanDoc: PLAN_DOC_FIELDS,
  ShareSummary: SHARE_SUMMARY_FIELDS,
  MoneyRange: MONEY_RANGE_FIELDS,
  Ending: ENDING_FIELDS,
  Schedule: SCHEDULE_FIELDS,
  SourceSealed: SOURCE_SEALED_FIELDS,
  PayLineSealed: PAY_LINE_SEALED_FIELDS,
  Pairing: PAIRING_FIELDS,
  DayOverrideSealed: DAY_OVERRIDE_SEALED_FIELDS,
  IncomeDayDoc: INCOME_DAY_DOC_FIELDS,
  DayRecordDoc: DAY_RECORD_DOC_FIELDS,
  RecordLine: RECORD_LINE_FIELDS,
  ProposedSealed: PROPOSED_SEALED_FIELDS,
  ConfirmedSealed: CONFIRMED_SEALED_FIELDS,
  CorrectionChange: CORRECTION_CHANGE_FIELDS,
  CorrectionSealed: CORRECTION_SEALED_FIELDS,
  FundingRule: FUNDING_RULE_FIELDS,
  FundingPay: FUNDING_PAY_FIELDS,
  PriorityExtra: PRIORITY_EXTRA_FIELDS,
  EnvelopeSealed: ENVELOPE_SEALED_FIELDS,
  BillSealed: BILL_SEALED_FIELDS,
  GroupSealed: GROUP_SEALED_FIELDS,
  GoalSealed: GOAL_SEALED_FIELDS,
  HorizonMoneyLeft: HORIZON_MONEY_LEFT_FIELDS,
  HorizonLink: HORIZON_LINK_FIELDS,
  HorizonSealed: HORIZON_SEALED_FIELDS,
  HorizonCost: HORIZON_COST_FIELDS,
  PlanItemDoc: PLAN_ITEM_DOC_FIELDS,
  MatchSealed: MATCH_SEALED_FIELDS,
  CardDoc: CARD_DOC_FIELDS,
  CardSealed: CARD_SEALED_FIELDS,
  CardAnnualFee: CARD_ANNUAL_FEE_FIELDS,
  AccountDoc: ACCOUNT_DOC_FIELDS,
  AccountSealed: ACCOUNT_SEALED_FIELDS,
  LinkDoc: LINK_DOC_FIELDS,
  LinkProviderAccount: LINK_PROVIDER_ACCOUNT_FIELDS,
  LinkSealed: LINK_SEALED_FIELDS,
  AccountBalanceDoc: ACCOUNT_BALANCE_DOC_FIELDS,
  CardStatementDoc: CARD_STATEMENT_DOC_FIELDS,
  CardStatementSealed: CARD_STATEMENT_SEALED_FIELDS,
  ExpenseDoc: EXPENSE_DOC_FIELDS,
  ExpenseSealed: EXPENSE_SEALED_FIELDS,
  RuleDoc: RULE_DOC_FIELDS,
  RuleSealed: RULE_SEALED_FIELDS,
  MemoryDoc: MEMORY_DOC_FIELDS,
  RouteMemorySealed: ROUTE_MEMORY_SEALED_FIELDS,
  PayerMemorySealed: PAYER_MEMORY_SEALED_FIELDS,
  ReceiptImageDoc: RECEIPT_IMAGE_DOC_FIELDS,
  ReceiptImageSealed: RECEIPT_IMAGE_SEALED_FIELDS,
  PlanVersionDoc: PLAN_VERSION_DOC_FIELDS,
  ChangeMove: CHANGE_MOVE_FIELDS,
  ChangeSealed: CHANGE_SEALED_FIELDS,
  ChangeDoc: CHANGE_DOC_FIELDS,
  MoveDoc: MOVE_DOC_FIELDS,
  BillPaidSealed: BILL_PAID_SEALED_FIELDS,
  AutoPaidMark: AUTO_PAID_MARK_FIELDS,
  CostPaidSealed: COST_PAID_SEALED_FIELDS,
  CardPaymentSealed: CARD_PAYMENT_SEALED_FIELDS,
  TransferSealed: TRANSFER_SEALED_FIELDS,
  StartSealed: START_SEALED_FIELDS,
  TrackingChangeSealed: TRACKING_CHANGE_SEALED_FIELDS,
  PurchaseLine: PURCHASE_LINE_FIELDS,
  CostRef: COST_REF_FIELDS,
  BillRef: BILL_REF_FIELDS,
  PurchaseSealed: PURCHASE_SEALED_FIELDS,
  PurchaseDoc: PURCHASE_DOC_FIELDS,
  ReleasedChargeDoc: RELEASED_CHARGE_DOC_FIELDS,
  ReleasedChargeSealed: RELEASED_CHARGE_SEALED_FIELDS,
  ClosingSealed: CLOSING_SEALED_FIELDS,
  ClosingDoc: CLOSING_DOC_FIELDS,
};

/** Exported types that are not stored, so have no fields to decide. */
export const NOT_STORED: Record<string, string> = {
  OpenPlan: 'decrypted view of PlanDoc',
  OpenAccount: 'decrypted view of AccountDoc',
  OpenCard: 'decrypted view of CardDoc',
  OpenLink: 'decrypted view of LinkDoc',
  OpenAccountBalance: 'decrypted view of AccountBalanceDoc',
  OpenCardStatement: 'decrypted view of CardStatementDoc',
  OpenExpense: 'decrypted view of ExpenseDoc',
  OpenRule: 'decrypted view of RuleDoc',
  OpenReceiptImage: 'decrypted view of ReceiptImageDoc',
  OpenReleasedCharge: 'decrypted view of ReleasedChargeDoc',
  OpenPurchase: 'decrypted view of PurchaseDoc',
  OpenChange: 'decrypted view of ChangeDoc',
  OpenDay: 'decrypted view of IncomeDayDoc',
  NormalizedAccount: 'provider account reading',
};

import {
  patternId,
  isEvidenceAsStrong,
  isPatternEligible,
} from '@apps/helm/engine/patterns';
import type { PatternFinding } from '@apps/helm/engine/patterns';
import type { Pattern, PatternEvidence } from '@apps/helm/types';
import type { PrivacyClass } from '@apps/helm/utils/privacy';

export type PatternMove =
  | { kind: 'create' }
  | { kind: 'refresh' }
  | { kind: 'comeBack'; fresh: PatternFinding }
  | { kind: 'skip' };

type Stored = Pick<
  Pattern,
  'state' | 'offReason' | 'nextEligibleOn' | 'evidenceSince' | 'evidence'
>;

const isSameEvidence = (a: PatternEvidence, b: PatternEvidence) =>
  JSON.stringify(a) === JSON.stringify(b);

/** What the daily check does with one finding given what is stored for it: make it, refresh its evidence, bring an answered one back on fresh evidence at least as strong, or leave it. `today` is date-only. */
export function readPatternMove(input: {
  current: Stored | null;
  finding: PatternFinding;
  recheck: (since: number) => PatternFinding | null;
  today: number;
}): PatternMove {
  const { current, finding } = input;
  if (current === null) return { kind: 'create' };
  if (current.state === 'accepted') return { kind: 'skip' };
  if (current.state === 'suggested' || current.state === 'candidate') {
    return current.offReason === null &&
      !isSameEvidence(current.evidence, finding.evidence)
      ? { kind: 'refresh' }
      : { kind: 'skip' };
  }
  if (!isPatternEligible(current, input.today)) return { kind: 'skip' };
  const fresh = input.recheck(current.evidenceSince);
  return fresh &&
    isEvidenceAsStrong(current.evidence, fresh.evidence, current.evidenceSince)
    ? { kind: 'comeBack', fresh }
    : { kind: 'skip' };
}

export const toSourceKeys = (evidence: PatternEvidence) =>
  evidence.kind === 'said'
    ? evidence.observationIds.map((id) => `observations/${id}`)
    : evidence.kind === 'occurrences'
      ? evidence.dayKeys.map((key) => `habitDays/${key}`)
      : [];

/** A finding as the pattern document's readable fields; the sealed lines are made beside it. */
export const toPatternFields = (
  finding: PatternFinding,
  input: {
    now: number;
    privacy: PrivacyClass;
    moment?: Pattern['moment'];
    reasons?: Pattern['reasons'];
  },
): Omit<Pattern, 'sealed'> => ({
  kind: finding.kind,
  subject: finding.subject,
  bucket: finding.bucket,
  signature: finding.signature,
  moment: input.moment ?? 'daily',
  state: 'candidate',
  handling: finding.handling,
  acceptedBy: null,
  effect: finding.effect,
  evidence: finding.evidence,
  reasons: input.reasons ?? [],
  evidenceSince: 0,
  sourceKeys: toSourceKeys(finding.evidence),
  declineCount: 0,
  nextEligibleOn: null,
  confirmedAt: null,
  offReason: null,
  history: [],
  seenAt: null,
  executionId: null,
  undoneByExecutionId: null,
  isLive: true,
  offAt: null,
  lastEvidenceAt: finding.lastEvidenceAt,
  privacy: input.privacy,
  createdAt: input.now,
  lastEditedAt: null,
  stateAt: input.now,
});

export const patternDocId = (finding: Pick<PatternFinding, 'signature'>) =>
  patternId(finding.signature);

export const CUT_EVIDENCE: PatternEvidence = {
  kind: 'occurrences',
  from: 0,
  to: 0,
  matched: 0,
  total: 0,
  dayKeys: [],
};

/** A stopped pattern kept only as its signature, so its stop still holds. */
export const isPatternCut = (
  pattern: Pick<Pattern, 'sourceKeys' | 'reasons' | 'evidence'>,
) =>
  pattern.sourceKeys.length === 0 &&
  pattern.reasons.length === 0 &&
  pattern.evidence.kind === 'occurrences' &&
  pattern.evidence.total === 0;

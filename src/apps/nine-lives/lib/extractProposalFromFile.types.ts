import type {
  CatConditionStatus,
  CatSex,
  ConditionCategory,
  PreventiveType,
  SymptomSeverity,
  VisitReason,
} from '../types';

export interface IngestionCatProposal {
  name: string;
  breed: string | null;
  dateOfBirth: number | null;
  isDateOfBirthEstimated: boolean | null;
  sex: CatSex | null;
}

export interface IngestionClinicProposal {
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
}

export interface IngestionVisitProposal {
  /** More than one when the document makes clear a single visit event covers multiple cats. */
  catNames: string[];
  clinicName: string | null;
  scheduledAt: number;
  reason: VisitReason;
  customReasonLabel: string | null;
  notes: string | null;
}

export interface IngestionVaccinationProposal {
  catName: string | null;
  name: string;
  administeredAt: number;
  expiresAt: number | null;
  lotNumber: string | null;
}

export interface IngestionPreventiveProposal {
  catNames: string[];
  name: string;
  type: PreventiveType;
  administeredAt: number;
  expiresAt: number | null;
  dosage: string | null;
}

export interface IngestionWeightProposal {
  catName: string | null;
  weight: number;
  unit: 'lb' | 'kg';
  measuredAt: number;
}

export interface IngestionSymptomProposal {
  catName: string | null;
  description: string;
  quickTags: string[];
  firstNoticedAt: number;
  severity: SymptomSeverity | null;
}

export interface IngestionConditionProposal {
  catName: string | null;
  name: string;
  category: ConditionCategory;
  status: CatConditionStatus;
  occurredAt: number;
  description: string | null;
}

export interface IngestionExpenseItemProposal {
  category: string;
  label: string | null;
  amount: number;
}

export interface IngestionExpenseProposal {
  catNames: string[];
  /** Line items making up this expense, mirroring `ExpenseLineItem`. Always at least one. */
  items: IngestionExpenseItemProposal[];
  incurredAt: number;
  notes: string | null;
}

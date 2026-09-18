import { SchemaType } from 'firebase/ai';

import { generativeModel } from '@/lib/firebase/ai';

import { compressIngestionImage } from '../utils/imageCompression';
import type {
  IngestionCatProposal,
  IngestionClinicProposal,
  IngestionConditionProposal,
  IngestionExpenseItemProposal,
  IngestionExpenseProposal,
  IngestionPreventiveProposal,
  IngestionSymptomProposal,
  IngestionVaccinationProposal,
  IngestionVisitProposal,
  IngestionWeightProposal,
} from './extractProposalFromFile.types';

export interface ExtractedIngestionProposal {
  proposedCats: IngestionCatProposal[];
  proposedClinics: IngestionClinicProposal[];
  proposedVisits: IngestionVisitProposal[];
  proposedVaccinations: IngestionVaccinationProposal[];
  proposedPreventives: IngestionPreventiveProposal[];
  proposedWeightEntry: IngestionWeightProposal | null;
  proposedSymptoms: IngestionSymptomProposal[];
  proposedConditions: IngestionConditionProposal[];
  proposedExpenses: IngestionExpenseProposal[];
  suggestKeepAsRecord: boolean;
  confidence: number | null;
}

const nullableString = { type: SchemaType.STRING, nullable: true };
const nullableNumber = { type: SchemaType.NUMBER, nullable: true };

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    proposedCats: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          breed: nullableString,
          dateOfBirth: nullableNumber,
          isDateOfBirthEstimated: { type: SchemaType.BOOLEAN, nullable: true },
          sex: nullableString,
        },
      },
    },
    proposedClinics: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          phone: nullableString,
          email: nullableString,
          website: nullableString,
          address: nullableString,
        },
      },
    },
    proposedVisits: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          catName: nullableString,
          clinicName: nullableString,
          scheduledAt: { type: SchemaType.NUMBER },
          reason: {
            type: SchemaType.STRING,
            enum: ['checkup', 'illness', 'accident', 'vaccination', 'follow_up', 'custom'],
          },
          customReasonLabel: nullableString,
          notes: nullableString,
        },
      },
    },
    proposedVaccinations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          catName: nullableString,
          name: { type: SchemaType.STRING },
          administeredAt: { type: SchemaType.NUMBER },
          expiresAt: nullableNumber,
          lotNumber: nullableString,
        },
      },
    },
    proposedPreventives: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          catNames: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          name: { type: SchemaType.STRING },
          type: {
            type: SchemaType.STRING,
            enum: ['flea-tick', 'heartworm', 'mite', 'dewormer', 'medication', 'other'],
          },
          administeredAt: { type: SchemaType.NUMBER },
          expiresAt: nullableNumber,
          dosage: nullableString,
        },
      },
    },
    proposedWeightEntry: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        catName: nullableString,
        weight: { type: SchemaType.NUMBER },
        unit: { type: SchemaType.STRING, enum: ['lb', 'kg'] },
        measuredAt: { type: SchemaType.NUMBER },
      },
    },
    proposedSymptoms: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          catName: nullableString,
          description: { type: SchemaType.STRING },
          quickTags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          firstNoticedAt: { type: SchemaType.NUMBER },
          severity: { type: SchemaType.STRING, nullable: true, enum: ['mild', 'moderate', 'severe'] },
        },
      },
    },
    proposedConditions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          catName: nullableString,
          name: { type: SchemaType.STRING },
          category: {
            type: SchemaType.STRING,
            enum: ['illness', 'injury', 'chronic', 'parasite', 'allergy'],
          },
          status: { type: SchemaType.STRING, enum: ['active', 'ongoing', 'resolved'] },
          occurredAt: { type: SchemaType.NUMBER },
          description: nullableString,
        },
      },
    },
    proposedExpenses: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          catNames: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          items: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                category: { type: SchemaType.STRING },
                label: nullableString,
                amount: { type: SchemaType.NUMBER },
              },
            },
          },
          incurredAt: { type: SchemaType.NUMBER },
          notes: nullableString,
        },
      },
    },
    suggestKeepAsRecord: { type: SchemaType.BOOLEAN },
    confidence: nullableNumber,
  },
};

function asBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function normalizeCat(value: Partial<IngestionCatProposal>): IngestionCatProposal {
  return {
    name: value.name ?? '',
    breed: value.breed ?? null,
    dateOfBirth: value.dateOfBirth ?? null,
    isDateOfBirthEstimated: value.isDateOfBirthEstimated ?? null,
    sex: value.sex ?? null,
  };
}

function normalizeClinic(value: Partial<IngestionClinicProposal>): IngestionClinicProposal {
  return {
    name: value.name ?? '',
    phone: value.phone ?? null,
    email: value.email ?? null,
    website: value.website ?? null,
    address: value.address ?? null,
  };
}

function normalizeVisit(value: Partial<IngestionVisitProposal>): IngestionVisitProposal {
  return {
    catName: value.catName ?? null,
    clinicName: value.clinicName ?? null,
    scheduledAt: value.scheduledAt ?? Date.now(),
    reason: value.reason ?? 'checkup',
    customReasonLabel: value.customReasonLabel ?? null,
    notes: value.notes ?? null,
  };
}

function normalizeVaccination(
  value: Partial<IngestionVaccinationProposal>,
): IngestionVaccinationProposal {
  return {
    catName: value.catName ?? null,
    name: value.name ?? '',
    administeredAt: value.administeredAt ?? Date.now(),
    expiresAt: value.expiresAt ?? null,
    lotNumber: value.lotNumber ?? null,
  };
}

function normalizePreventive(
  value: Partial<IngestionPreventiveProposal>,
): IngestionPreventiveProposal {
  return {
    catNames: value.catNames ?? [],
    name: value.name ?? '',
    type: value.type ?? 'other',
    administeredAt: value.administeredAt ?? Date.now(),
    expiresAt: value.expiresAt ?? null,
    dosage: value.dosage ?? null,
  };
}

function normalizeWeight(value: Partial<IngestionWeightProposal>): IngestionWeightProposal {
  return {
    catName: value.catName ?? null,
    weight: value.weight ?? 0,
    unit: value.unit ?? 'lb',
    measuredAt: value.measuredAt ?? Date.now(),
  };
}

function normalizeSymptom(value: Partial<IngestionSymptomProposal>): IngestionSymptomProposal {
  return {
    catName: value.catName ?? null,
    description: value.description ?? '',
    quickTags: value.quickTags ?? [],
    firstNoticedAt: value.firstNoticedAt ?? Date.now(),
    severity: value.severity ?? null,
  };
}

function normalizeCondition(
  value: Partial<IngestionConditionProposal>,
): IngestionConditionProposal {
  return {
    catName: value.catName ?? null,
    name: value.name ?? '',
    category: value.category ?? 'illness',
    status: value.status ?? 'active',
    occurredAt: value.occurredAt ?? Date.now(),
    description: value.description ?? null,
  };
}

function normalizeExpenseItem(
  value: Partial<IngestionExpenseItemProposal>,
): IngestionExpenseItemProposal {
  return {
    category: value.category ?? 'other',
    label: value.label ?? null,
    amount: value.amount ?? 0,
  };
}

function normalizeExpense(value: Partial<IngestionExpenseProposal>): IngestionExpenseProposal {
  return {
    catNames: value.catNames ?? [],
    items: (value.items ?? []).map(normalizeExpenseItem),
    incurredAt: value.incurredAt ?? Date.now(),
    notes: value.notes ?? null,
  };
}

function normalizeProposal(value: Partial<ExtractedIngestionProposal>): ExtractedIngestionProposal {
  return {
    proposedCats: (value.proposedCats ?? []).map(normalizeCat),
    proposedClinics: (value.proposedClinics ?? []).map(normalizeClinic),
    proposedVisits: (value.proposedVisits ?? []).map(normalizeVisit),
    proposedVaccinations: (value.proposedVaccinations ?? []).map(normalizeVaccination),
    proposedPreventives: (value.proposedPreventives ?? []).map(normalizePreventive),
    proposedWeightEntry: value.proposedWeightEntry ? normalizeWeight(value.proposedWeightEntry) : null,
    proposedSymptoms: (value.proposedSymptoms ?? []).map(normalizeSymptom),
    proposedConditions: (value.proposedConditions ?? []).map(normalizeCondition),
    proposedExpenses: (value.proposedExpenses ?? []).map(normalizeExpense),
    suggestKeepAsRecord: value.suggestKeepAsRecord ?? true,
    confidence: value.confidence ?? null,
  };
}

export async function extractProposalFromFile(file: File): Promise<ExtractedIngestionProposal> {
  const inputFile = await compressIngestionImage(file);
  const data = asBase64(await inputFile.arrayBuffer());
  const result = await generativeModel.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Extract only facts explicitly present in this veterinary document. Return an empty array when an entity type is not present — a document can mention more than one cat, clinic, visit, or expense, so propose one entry per distinct one found. Dates must be Unix milliseconds. Do not invent cat names, diagnoses, costs, or dates. The source filename is "${file.name}".`,
          },
          {
            inlineData: {
              data,
              mimeType: inputFile.type || file.type,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  });
  const parsed = JSON.parse(result.response.text()) as Partial<ExtractedIngestionProposal>;

  return normalizeProposal(parsed);
}

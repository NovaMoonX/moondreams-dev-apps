import { SchemaType } from 'firebase/ai';

import { generativeModel } from '@/lib/firebase/ai';

import { compressIngestionImage } from '../utils/imageCompression';
import type {
  IngestionCatProposal,
  IngestionClinicProposal,
  IngestionConditionProposal,
  IngestionExpenseProposal,
  IngestionPreventiveProposal,
  IngestionSymptomProposal,
  IngestionVaccinationProposal,
  IngestionVisitProposal,
  IngestionWeightProposal,
} from '../types';

export interface ExtractedIngestionProposal {
  proposedCat: IngestionCatProposal | null;
  proposedClinic: IngestionClinicProposal | null;
  proposedVisit: IngestionVisitProposal | null;
  proposedVaccinations: IngestionVaccinationProposal[];
  proposedPreventives: IngestionPreventiveProposal[];
  proposedWeightEntry: IngestionWeightProposal | null;
  proposedSymptoms: IngestionSymptomProposal[];
  proposedConditions: IngestionConditionProposal[];
  proposedExpense: IngestionExpenseProposal | null;
  suggestKeepAsRecord: boolean;
  confidence: number | null;
}

const nullableString = { type: SchemaType.STRING, nullable: true };
const nullableNumber = { type: SchemaType.NUMBER, nullable: true };

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    proposedCat: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        name: { type: SchemaType.STRING },
        breed: nullableString,
        dateOfBirth: nullableNumber,
        isDateOfBirthEstimated: { type: SchemaType.BOOLEAN, nullable: true },
        sex: nullableString,
      },
    },
    proposedClinic: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        name: { type: SchemaType.STRING },
        phone: nullableString,
        email: nullableString,
        website: nullableString,
        address: nullableString,
      },
    },
    proposedVisit: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        catName: nullableString,
        scheduledAt: { type: SchemaType.NUMBER },
        reason: { type: SchemaType.STRING },
        customReasonLabel: nullableString,
        notes: nullableString,
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
          type: { type: SchemaType.STRING },
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
        unit: { type: SchemaType.STRING },
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
          severity: nullableString,
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
          category: { type: SchemaType.STRING },
          status: { type: SchemaType.STRING },
          occurredAt: { type: SchemaType.NUMBER },
          description: nullableString,
        },
      },
    },
    proposedExpense: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        catNames: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        label: nullableString,
        amount: { type: SchemaType.NUMBER },
        category: { type: SchemaType.STRING },
        incurredAt: { type: SchemaType.NUMBER },
        notes: nullableString,
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

function normalizeProposal(value: Partial<ExtractedIngestionProposal>): ExtractedIngestionProposal {
  return {
    proposedCat: value.proposedCat ?? null,
    proposedClinic: value.proposedClinic ?? null,
    proposedVisit: value.proposedVisit ?? null,
    proposedVaccinations: value.proposedVaccinations ?? [],
    proposedPreventives: value.proposedPreventives ?? [],
    proposedWeightEntry: value.proposedWeightEntry ?? null,
    proposedSymptoms: value.proposedSymptoms ?? [],
    proposedConditions: value.proposedConditions ?? [],
    proposedExpense: value.proposedExpense ?? null,
    suggestKeepAsRecord: value.suggestKeepAsRecord ?? true,
    confidence: value.confidence ?? null,
  };
}

export async function extractProposalFromFile(file: File): Promise<ExtractedIngestionProposal> {
  const inputFile = await compressIngestionImage(file);
  const data = asBase64(await inputFile.arrayBuffer());
  const result = await generativeModel.generateContent([
    `Extract only facts explicitly present in this veterinary document. Return null or an empty array when an entity is not present. Dates must be Unix milliseconds. Do not invent cat names, diagnoses, costs, or dates. The source filename is "${file.name}".`,
    {
      inlineData: {
        data,
        mimeType: inputFile.type || file.type,
      },
    },
  ], {
    responseMimeType: 'application/json',
    responseSchema,
  });
  const parsed = JSON.parse(result.response.text()) as Partial<ExtractedIngestionProposal>;

  return normalizeProposal(parsed);
}

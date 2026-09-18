import { SchemaType } from 'firebase/ai';

import { generativeModel } from '@/lib/firebase/ai';

import { compressIngestionImage } from '../utils/imageCompression';
import { CAT_BREEDS } from '../constants/presetOptions';
import { DEFAULT_EXPENSE_CATEGORIES } from '../utils/budgetCalculators';
import type { HealthRecordType } from '../types';
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
  proposedWeightEntries: IngestionWeightProposal[];
  proposedSymptoms: IngestionSymptomProposal[];
  proposedConditions: IngestionConditionProposal[];
  proposedExpenses: IngestionExpenseProposal[];
  proposedRecordType: Exclude<HealthRecordType, 'custom'> | null;
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
          breed: {
            type: SchemaType.STRING,
            nullable: true,
            description: `The breed if stated. Prefer an exact match (case-insensitive) to one of: ${CAT_BREEDS.join(', ')}. If the document uses different wording for a clear match (e.g. "DSH"), map it to the closest one of these. Otherwise use whatever breed name is actually stated, in Title Case.`,
          },
          dateOfBirth: nullableNumber,
          isDateOfBirthEstimated: { type: SchemaType.BOOLEAN, nullable: true },
          sex: { type: SchemaType.STRING, nullable: true, enum: ['male', 'female', 'unknown'] },
        },
      },
    },
    proposedClinics: {
      type: SchemaType.ARRAY,
      description:
        'Every clinic named in the document, with as much contact detail (phone, email, website, address) as is actually printed on it — headers, footers, and letterhead often carry this even when the body text does not.',
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
      description:
        'One entry per distinct visit event. If a single visit event (one appointment, one date, one summary) clearly covers more than one cat, list every one of their names in catNames rather than creating a separate visit per cat.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          catNames: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
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
      description:
        'Every vaccine administration stated in the document, even ones only listed in a table or invoice line rather than called out in prose.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          catName: nullableString,
          name: {
            type: SchemaType.STRING,
            description:
              "The vaccine name ONLY — e.g. 'FVRCP', 'Rabies', 'FeLV'. WRONG: 'FVRCP 3 weeks', 'FVRCP due in 3 years', 'Rabies (1-year)'. Strip any duration, dosing interval, or next-due phrase from the name; that information belongs in expiresAt instead, never appended to the name string.",
          },
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
    proposedWeightEntries: {
      type: SchemaType.ARRAY,
      description:
        'One entry per weight measurement stated anywhere in the document — exam vitals, a weigh-in log line, or a summary table, not only a dedicated "weight" section. If more than one cat has a weight recorded, propose one entry per cat; do not stop after the first.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          catName: nullableString,
          weight: { type: SchemaType.NUMBER },
          unit: { type: SchemaType.STRING, enum: ['lb', 'kg'] },
          measuredAt: { type: SchemaType.NUMBER },
        },
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
                category: {
                  type: SchemaType.STRING,
                  enum: DEFAULT_EXPENSE_CATEGORIES,
                  description:
                    "Use 'vet' for anything tied to a clinic visit, exam, or vet service — including when it's billed alongside vaccines, labs, or medication given during that visit — not just when the line item literally says 'vet'.",
                },
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
    proposedRecordType: {
      type: SchemaType.STRING,
      nullable: true,
      enum: [
        'lab_result',
        'vet_paperwork',
        'insurance',
        'shelter_adoption',
        'prescription',
        'microchip_registration',
        'miscellaneous',
      ],
      description: 'What kind of document this is, for filing it as a permanent health record.',
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

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ');
}

/** Prefers the app's known breed list's exact casing when the model's answer matches case-insensitively. */
function normalizeBreed(breed: string | null | undefined): string | null {
  if (!breed) {
    return null;
  }

  const trimmed = breed.trim();
  const knownMatch = CAT_BREEDS.find((known) => known.toLowerCase() === trimmed.toLowerCase());
  return knownMatch ?? toTitleCase(trimmed);
}

function normalizeCat(value: Partial<IngestionCatProposal>): IngestionCatProposal {
  return {
    name: value.name ?? '',
    breed: normalizeBreed(value.breed),
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
    catNames: value.catNames ?? [],
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
    proposedWeightEntries: (value.proposedWeightEntries ?? []).map(normalizeWeight),
    proposedSymptoms: (value.proposedSymptoms ?? []).map(normalizeSymptom),
    proposedConditions: (value.proposedConditions ?? []).map(normalizeCondition),
    proposedExpenses: (value.proposedExpenses ?? []).map(normalizeExpense),
    proposedRecordType: value.proposedRecordType ?? null,
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
            text: `Extract every fact explicitly present in this veterinary document — don't stop at the first or most prominent item of a given type; scan the entire document for every vaccination, weight measurement, clinic detail, and expense line, including ones stated only in a table, invoice line, or vitals block rather than in prose. Return an empty array when an entity type is not present — a document can mention more than one cat, clinic, visit, or expense, so propose one entry per distinct one found. Dates must be Unix milliseconds. Do not invent cat names, diagnoses, costs, or dates. The source filename is "${file.name}".`,
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

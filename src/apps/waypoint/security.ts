import type { TripSpace } from '@apps/waypoint/types';

export const TRIP_COLLECTION_PATH = ['apps', 'waypoint', 'trips'] as const;

export interface CreateTripValues {
  id: string;
  title: string;
  startDate: number;
  endDate: number;
  createdBy: string;
  createdAt: number;
  inviteCode?: string | null;
}

export function createTripSpace(values: CreateTripValues): TripSpace {
  const trip: TripSpace = {
    id: values.id,
    title: values.title,
    coverImageUrl: null,
    startDate: values.startDate,
    endDate: values.endDate,
    defaultCurrency: null,
    isArchived: false,
    members: {
      [values.createdBy]: {
        uid: values.createdBy,
        role: 'ADMIN',
        joinedAt: values.createdAt,
      },
    },
    inviteCode: values.inviteCode ?? null,
    createdBy: values.createdBy,
    createdAt: values.createdAt,
    lastEditedAt: values.createdAt,
  };

  return trip;
}

export function validateTripDates(
  startDate: number,
  endDate: number,
): string | null {
  if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) {
    return 'Enter both trip dates.';
  }

  if (endDate < startDate) {
    return 'The end date must be on or after the start date.';
  }

  return null;
}

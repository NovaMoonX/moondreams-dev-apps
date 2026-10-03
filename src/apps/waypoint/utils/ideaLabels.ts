import { getDayCount } from '@/utils/dateRangeUtils';
import { ACTIVITY_SETTING_LABELS, TIME_BLOCK_LABELS } from '@apps/waypoint/constants';
import type { TripIdea, TripSpace } from '@apps/waypoint/types';

/** The idea's cuisines or indoor/outdoor settings. */
export function getIdeaTags(idea: TripIdea) {
  const { ideaDetails } = idea;
  if (!ideaDetails) {
    return [];
  }

  const result = ('cuisines' in ideaDetails
    ? ideaDetails.cuisines
    : ideaDetails.settings.map((setting) => ACTIVITY_SETTING_LABELS[setting])
  ).filter((tag): tag is string => typeof tag === 'string');
  return result;
}

/** Suggested days that still fall inside the trip's current dates, plus the time-of-day labels. */
export function getIdeaTiming(trip: TripSpace, idea: TripIdea) {
  const { ideaDetails } = idea;
  if (!ideaDetails) {
    return { days: [], blocks: [] };
  }

  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const result = {
    days: ideaDetails.suggestedDays.filter(
      (day) => typeof day === 'number' && day >= 0 && day < dayCount,
    ),
    blocks: ideaDetails.suggestedTimeBlocks
      .map((block) => TIME_BLOCK_LABELS[block])
      .filter((label): label is string => typeof label === 'string'),
  };
  return result;
}

/** "Day 1 · Evening" — null when the idea has no day or time preference. */
export function getIdeaTimingSummary(trip: TripSpace, idea: TripIdea) {
  const { days, blocks } = getIdeaTiming(trip, idea);
  const dayText =
    days.length === 0 ? null : `${days.length > 1 ? 'Days' : 'Day'} ${days.map((day) => day + 1).join(', ')}`;
  const parts = [dayText, blocks.length > 0 ? blocks.join(' / ') : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

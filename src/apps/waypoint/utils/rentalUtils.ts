import { getDisplayImage } from '@/utils/enrichmentUtils';
import type { Rental } from '@apps/waypoint/types';

export function getRentalPickupLocation(rental: Rental) {
  return {
    locationName: null,
    address: rental.pickupAddress,
    latitude: rental.pickupLatitude,
    longitude: rental.pickupLongitude,
  };
}

/** A rental with no separate return location goes back where it was picked up. */
export function getRentalReturnLocation(rental: Rental) {
  return rental.returnAddress
    ? {
        locationName: null,
        address: rental.returnAddress,
        latitude: rental.returnLatitude,
        longitude: rental.returnLongitude,
      }
    : getRentalPickupLocation(rental);
}

export function getRentalImage(rental: Rental) {
  return getDisplayImage({ place: rental.pickupPlace, linkPreview: rental.linkPreview });
}

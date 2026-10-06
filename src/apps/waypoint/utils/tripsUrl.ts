/** The only query params the My Trips page acts on: a join code, and a trip to open. Anything else is dropped. */
export const MY_TRIPS_QUERY_PARAMS = ['inviteCode', 'trip'] as const;

/** `params` reduced to the ones My Trips uses, or `null` when nothing needs dropping. */
export function getMyTripsParams(params: URLSearchParams): URLSearchParams | null {
  const kept = new URLSearchParams(
    MY_TRIPS_QUERY_PARAMS.flatMap((key) => (params.has(key) ? [[key, params.get(key) ?? ''] as [string, string]] : [])),
  );
  return kept.toString() === params.toString() ? null : kept;
}

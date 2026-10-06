/** `text` is the city and zone name ("Phoenix · Mountain Standard Time"); `description` carries the
 * abbreviation, offset and the other cities and names a search also matches. */
export interface TimezoneChoice {
  value: string;
  text: string;
  description: string;
}

/** Well-known cities per zone, so "Boston" or "Miami" finds Eastern Time. A zone without an entry
 * is still found by its own city (the last part of its name) and by its zone name. */
const CITY_ALIASES: Record<string, string[]> = {
  'America/New_York': ['Boston', 'Miami', 'Atlanta', 'Washington DC', 'Philadelphia', 'Charlotte', 'Orlando', 'Pittsburgh', 'Raleigh', 'Baltimore'],
  'America/Detroit': ['Ann Arbor', 'Grand Rapids'],
  'America/Toronto': ['Ottawa', 'Montreal', 'Quebec City'],
  'America/Chicago': ['Dallas', 'Houston', 'Austin', 'Nashville', 'New Orleans', 'Minneapolis', 'Milwaukee', 'St. Louis', 'Kansas City', 'San Antonio', 'Memphis', 'Oklahoma City'],
  'America/Winnipeg': ['Manitoba'],
  'America/Denver': ['Salt Lake City', 'Albuquerque', 'Boulder', 'Colorado Springs', 'Santa Fe', 'Jackson Hole'],
  'America/Boise': ['Idaho'],
  'America/Edmonton': ['Calgary', 'Banff', 'Alberta'],
  'America/Phoenix': ['Arizona', 'Tucson', 'Scottsdale', 'Sedona', 'Grand Canyon', 'Tempe', 'Mesa'],
  'America/Los_Angeles': ['San Francisco', 'San Diego', 'Seattle', 'Portland', 'Las Vegas', 'Sacramento', 'San Jose', 'Oakland', 'Napa'],
  'America/Vancouver': ['Victoria', 'Whistler', 'British Columbia'],
  'America/Anchorage': ['Alaska', 'Juneau', 'Fairbanks'],
  'Pacific/Honolulu': ['Hawaii', 'Maui', 'Kauai', 'Oahu', 'Waikiki'],
  'America/Halifax': ['Nova Scotia', 'Atlantic Canada'],
  'America/St_Johns': ['Newfoundland'],
  'America/Puerto_Rico': ['San Juan'],
  'America/Mexico_City': ['Guadalajara', 'Monterrey', 'Oaxaca'],
  'America/Cancun': ['Tulum', 'Playa del Carmen', 'Quintana Roo'],
  'America/Tijuana': ['Baja California'],
  'America/Havana': ['Cuba'],
  'America/Jamaica': ['Kingston', 'Montego Bay'],
  'America/Nassau': ['Bahamas'],
  'America/Panama': ['Panama City'],
  'America/Costa_Rica': ['San Jose Costa Rica'],
  'America/Bogota': ['Colombia', 'Medellin', 'Cartagena'],
  'America/Lima': ['Peru', 'Cusco', 'Machu Picchu'],
  'America/Santiago': ['Chile', 'Valparaiso'],
  'America/Sao_Paulo': ['Rio de Janeiro', 'Brasilia', 'Brazil'],
  'America/Argentina/Buenos_Aires': ['Argentina'],
  'America/Caracas': ['Venezuela'],
  'Europe/London': ['Edinburgh', 'Manchester', 'Glasgow', 'Liverpool', 'UK', 'England', 'Scotland', 'Wales'],
  'Europe/Dublin': ['Ireland', 'Cork', 'Galway'],
  'Europe/Lisbon': ['Porto', 'Portugal', 'Algarve'],
  'Atlantic/Reykjavik': ['Iceland'],
  'Europe/Paris': ['France', 'Nice', 'Lyon', 'Marseille', 'Bordeaux'],
  'Europe/Madrid': ['Barcelona', 'Spain', 'Seville', 'Valencia', 'Malaga', 'Ibiza'],
  'Europe/Berlin': ['Munich', 'Germany', 'Hamburg', 'Frankfurt', 'Cologne'],
  'Europe/Rome': ['Italy', 'Venice', 'Florence', 'Milan', 'Naples', 'Amalfi'],
  'Europe/Amsterdam': ['Netherlands', 'Rotterdam'],
  'Europe/Brussels': ['Belgium', 'Bruges'],
  'Europe/Zurich': ['Switzerland', 'Geneva', 'Interlaken'],
  'Europe/Vienna': ['Austria', 'Salzburg'],
  'Europe/Prague': ['Czech Republic', 'Czechia'],
  'Europe/Budapest': ['Hungary'],
  'Europe/Warsaw': ['Poland', 'Krakow'],
  'Europe/Stockholm': ['Sweden', 'Gothenburg'],
  'Europe/Oslo': ['Norway', 'Bergen'],
  'Europe/Copenhagen': ['Denmark'],
  'Europe/Helsinki': ['Finland'],
  'Europe/Athens': ['Greece', 'Santorini', 'Mykonos', 'Crete'],
  'Europe/Istanbul': ['Turkey', 'Ankara', 'Cappadocia'],
  'Europe/Moscow': ['Russia', 'St. Petersburg'],
  'Europe/Kyiv': ['Kyiv', 'Kiev', 'Ukraine'],
  'Africa/Cairo': ['Egypt', 'Luxor'],
  'Africa/Johannesburg': ['South Africa', 'Cape Town', 'Pretoria', 'Durban'],
  'Africa/Nairobi': ['Kenya', 'Tanzania', 'Serengeti', 'Zanzibar'],
  'Africa/Casablanca': ['Morocco', 'Marrakech'],
  'Africa/Lagos': ['Nigeria'],
  'Asia/Dubai': ['UAE', 'Abu Dhabi'],
  'Asia/Jerusalem': ['Israel', 'Tel Aviv'],
  'Asia/Riyadh': ['Saudi Arabia'],
  'Asia/Tehran': ['Iran'],
  'Asia/Kolkata': ['Kolkata', 'India', 'Mumbai', 'Delhi', 'New Delhi', 'Bangalore', 'Chennai', 'Goa', 'Calcutta'],
  'Asia/Kathmandu': ['Nepal', 'Everest'],
  'Asia/Colombo': ['Sri Lanka'],
  'Asia/Dhaka': ['Bangladesh'],
  'Asia/Bangkok': ['Thailand', 'Phuket', 'Chiang Mai', 'Hanoi'],
  'Asia/Ho_Chi_Minh': ['Vietnam', 'Saigon', 'Da Nang'],
  'Asia/Jakarta': ['Indonesia'],
  'Asia/Makassar': ['Bali', 'Lombok'],
  'Asia/Singapore': ['Singapore'],
  'Asia/Kuala_Lumpur': ['Malaysia'],
  'Asia/Manila': ['Philippines', 'Cebu'],
  'Asia/Hong_Kong': ['Hong Kong', 'Macau'],
  'Asia/Shanghai': ['Beijing', 'China', 'Chengdu', 'Xi\'an'],
  'Asia/Taipei': ['Taiwan'],
  'Asia/Seoul': ['South Korea', 'Korea', 'Busan'],
  'Asia/Tokyo': ['Japan', 'Kyoto', 'Osaka', 'Hokkaido', 'Sapporo', 'Nagoya', 'Hiroshima'],
  'Australia/Sydney': ['Melbourne', 'Canberra', 'Hobart', 'New South Wales', 'Victoria Australia', 'Tasmania'],
  'Australia/Brisbane': ['Queensland', 'Gold Coast', 'Cairns'],
  'Australia/Perth': ['Western Australia'],
  'Australia/Adelaide': ['South Australia'],
  'Australia/Darwin': ['Northern Territory', 'Uluru'],
  'Pacific/Auckland': ['New Zealand', 'Wellington', 'Queenstown', 'Christchurch'],
  'Pacific/Fiji': ['Suva'],
  'Pacific/Tahiti': ['Bora Bora', 'French Polynesia'],
  'Pacific/Guam': ['Saipan'],
};

// Browsers disagree on a few zones' names (Calcutta or Kolkata), so both spellings share one entry.
const LEGACY_ZONE_NAMES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
};

const cityFromZone = (zone: string) => (zone.split('/').pop() ?? zone).replace(/_/g, ' ');

const getZoneName = (timeZone: string, at: number, style: 'long' | 'longGeneric' | 'short' | 'shortGeneric') => {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: style as Intl.DateTimeFormatOptions['timeZoneName'] })
      .formatToParts(new Date(at))
      .find((entry) => entry.type === 'timeZoneName');
    return part?.value ?? '';
  } catch {
    return '';
  }
};

const getOffsetMinutes = (timeZone: string, at: number) => getOffsetFromParts(timeZone, at);

function getOffsetFromParts(timeZone: string, at: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(at));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const wallClockAsUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'));
  const result = Math.round((wallClockAsUtc - Math.floor(at / 60_000) * 60_000) / 60_000);
  return result;
}

/** "UTC-7", "UTC+5:30" */
export function formatUtcOffset(minutes: number) {
  if (minutes === 0) {
    return 'UTC';
  }
  const sign = minutes < 0 ? '-' : '+';
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  return `UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}

/** Whether the zone's offset ever changes over a year (daylight saving or similar), judged from
 * January and July of `at`'s year — so Phoenix, which keeps one offset, reads "no daylight saving". */
export function observesDaylightSaving(timeZone: string, at: number = Date.now()) {
  const year = new Date(at).getUTCFullYear();
  const result = getOffsetMinutes(timeZone, Date.UTC(year, 0, 15)) !== getOffsetMinutes(timeZone, Date.UTC(year, 6, 15));
  return result;
}

const choiceCache = new Map<string, TimezoneChoice[]>();

/** "PT", "ET": short enough for a phone's picker; zones with no short generic name fall back to their offset. */
const getCompactName = (timeZone: string, at: number) => {
  const short = getZoneName(timeZone, at, 'shortGeneric');
  return short && short.length <= 4 ? short : formatUtcOffset(getOffsetMinutes(timeZone, at));
};

/** Every zone the runtime knows, as search-friendly choices. The offset and abbreviation come from
 * `at`, since they change with daylight saving. Searching matches the city, the zone's own name
 * ("Eastern Time Zone") and its abbreviation. `compact` shortens the names for a phone. A well-known
 * city that isn't the zone's own ("Milwaukee" for Central Time) is offered by `getTimezoneCityMatches`
 * while the person is typing it. */
export function getTimezoneChoices(at: number = Date.now(), compact = false): TimezoneChoice[] {
  const day = Math.floor(at / 86_400_000);
  const cacheKey = `${day}-${compact}`;
  const cached = choiceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const choices = zones
    .map((zone) => {
      const generic = getZoneName(zone, at, 'longGeneric');
      const offset = formatUtcOffset(getOffsetMinutes(zone, at));
      const shortName = getZoneName(zone, at, 'short');
      const abbreviation = shortName.startsWith('GMT') ? '' : `${shortName} · `;
      const noDst = observesDaylightSaving(zone, at) ? '' : ' · no daylight saving';
      const detail = `${generic ? `${generic} Zone` : cityFromZone(zone)} · ${abbreviation}${offset}${noDst}`;
      const label = compact ? getCompactName(zone, at) : generic;
      return { value: zone, text: label ? `${cityFromZone(zone)} · ${label}` : cityFromZone(zone), description: detail };
    })
    .sort((first, second) => first.text.localeCompare(second.text));

  choiceCache.clear();
  choiceCache.set(cacheKey, choices);
  return choices;
}

const MAX_CITY_MATCHES = 4;
export const CITY_MATCH_SEPARATOR = '#';

/** Well-known cities that a search names but that aren't a zone's own city, each as its own option in that
 * zone ("Milwaukee · Central Time"), so the city typed is always there to pick. Its value is
 * `zone#City`; `getZoneFromChoiceValue` turns that back into the zone. */
export function getTimezoneCityMatches(query: string, at: number = Date.now(), compact = false): TimezoneChoice[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) {
    return [];
  }

  const byZone = new Map(getTimezoneChoices(at, compact).map((choice) => [choice.value, choice]));
  const matches = Object.entries(CITY_ALIASES)
    .flatMap(([zone, cities]) =>
      cities
        .filter((city) => city.toLowerCase().includes(needle))
        .map((city) => ({ zone, city, startsWith: city.toLowerCase().startsWith(needle) })),
    )
    .sort((first, second) => Number(second.startsWith) - Number(first.startsWith) || first.city.localeCompare(second.city))
    .slice(0, MAX_CITY_MATCHES);

  const result = matches.flatMap(({ zone, city }) => {
    const legacyName = Object.keys(LEGACY_ZONE_NAMES).find((name) => LEGACY_ZONE_NAMES[name] === zone);
    const base = byZone.get(zone) ?? (legacyName ? byZone.get(legacyName) : undefined);
    if (!base) {
      return [];
    }
    const zoneName = base.text.split(' · ').slice(1).join(' · ');
    return [{ value: `${base.value}${CITY_MATCH_SEPARATOR}${city}`, text: zoneName ? `${city} · ${zoneName}` : city, description: base.description }];
  });
  return result;
}

export const getZoneFromChoiceValue = (value: string) => value.split(CITY_MATCH_SEPARATOR)[0];

/** The choices, plus the chosen zone itself when this runtime doesn't list it (a saved legacy name). */
export function getTimezoneChoicesWith(timeZone: string, at?: number, compact = false): TimezoneChoice[] {
  const choices = getTimezoneChoices(at, compact);
  if (choices.some((choice) => choice.value === timeZone)) {
    return choices;
  }
  return [...choices, { value: timeZone, text: cityFromZone(timeZone), description: timeZone.replace(/_/g, ' ') }];
}

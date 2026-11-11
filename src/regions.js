// Valid country and state/province codes. The theme sends codes directly:
// active-vent-new/assets/custom.js (US_STATES / CA_PROVINCES) — keep these lists in sync.

export const REGION_CODES_BY_COUNTRY = {
  US: [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
    'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND',
    'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
  ],
  CA: ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'ON', 'PE', 'QC', 'SK', 'NT', 'NU', 'YT'],
};

export function isValidCountryCode(countryCode) {
  return Object.hasOwn(REGION_CODES_BY_COUNTRY, countryCode);
}

export function isValidRegionCode(regionCode, countryCode) {
  return REGION_CODES_BY_COUNTRY[countryCode]?.includes(regionCode) ?? false;
}

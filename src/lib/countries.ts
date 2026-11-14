export const COUNTRIES = [
  { code: "FI", name: "Finland" },
  { code: "SE", name: "Sweden" },
  { code: "DE", name: "Germany" },
  { code: "EE", name: "Estonia" },
  { code: "PL", name: "Poland" },
  { code: "NL", name: "Netherlands" },
  { code: "DK", name: "Denmark" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];

export function countryName(code: string): string {
  return COUNTRIES.find((country) => country.code === code)?.name ?? code;
}

export function isCountryCode(code: string): code is CountryCode {
  return COUNTRIES.some((country) => country.code === code);
}

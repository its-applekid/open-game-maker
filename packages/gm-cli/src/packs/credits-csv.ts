import type { LicenseMap } from './license-map.js';

const REQUIRED = ['filename', 'notes', 'authors', 'licenses', 'urls'] as const;
const SPDX = new Map<string, string>([
  ['CC0', 'CC0-1.0'],
  ['CC0-1.0', 'CC0-1.0'],
  ['CC-BY 3.0', 'CC-BY-3.0'],
  ['CC-BY-3.0', 'CC-BY-3.0'],
  ['CC-BY 4.0', 'CC-BY-4.0'],
  ['CC-BY-4.0', 'CC-BY-4.0'],
  ['CC-BY-SA 3.0', 'CC-BY-SA-3.0'],
  ['CC-BY-SA-3.0', 'CC-BY-SA-3.0'],
  ['CC-BY-SA 4.0', 'CC-BY-SA-4.0'],
  ['CC-BY-SA-4.0', 'CC-BY-SA-4.0'],
  ['OGA-BY 3.0', 'OGA-BY-3.0'],
  ['OGA-BY-3.0', 'OGA-BY-3.0'],
  ['GPL 2.0', 'GPL-2.0-only'],
  ['GPL-2.0', 'GPL-2.0-only'],
  ['GPL-2.0-ONLY', 'GPL-2.0-only'],
  ['GPL 3.0', 'GPL-3.0-only'],
  ['GPL-3.0', 'GPL-3.0-only'],
  ['GPL-3.0-ONLY', 'GPL-3.0-only'],
]);

const PREFERENCE = [
  'CC0-1.0',
  'OGA-BY-3.0',
  'CC-BY-4.0',
  'CC-BY-3.0',
  'CC-BY-SA-4.0',
  'CC-BY-SA-3.0',
  'GPL-3.0-only',
  'GPL-2.0-only',
];
const RESTRICTIVE_LPC_CEILING = ['GPL-3.0-only', 'GPL-2.0-only', 'CC-BY-SA-4.0', 'CC-BY-SA-3.0'];

function requiresAttribution(license: string): boolean {
  return license.startsWith('CC-BY-') || license === 'OGA-BY-3.0';
}

export function lpcCollectionLicense(map: LicenseMap): string {
  const kept = new Set(
    Object.values(map)
      .filter((entry) => !entry.dropped)
      .map((entry) => entry.license),
  );
  return RESTRICTIVE_LPC_CEILING.find((license) => kept.has(license)) ?? 'CC-BY-3.0';
}

function rows(csv: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]!;
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field.trim());
      field = '';
    } else if (character === '\n') {
      row.push(field.trim());
      if (row.some(Boolean)) result.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') field += character;
  }
  if (quoted) throw new Error('unterminated quoted field in CREDITS.csv');
  row.push(field.trim());
  if (row.some(Boolean)) result.push(row);
  return result;
}

function attribution(value: string): string | null {
  const names = value
    .split(/[\n,]+/)
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length === 0 ? null : [...new Set(names)].join(', ');
}

function mappedLicenses(value: string): { mapped: string[]; unknown: string[] } {
  const mapped: string[] = [];
  const unknown: string[] = [];
  for (const token of value
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean)) {
    const license = SPDX.get(token.toUpperCase().replace(/\s+/g, ' '));
    if (license) mapped.push(license);
    else unknown.push(token);
  }
  return { mapped: [...new Set(mapped)], unknown };
}

export function parseLpcCredits(csv: string, options: { includeSa: boolean }): LicenseMap {
  const parsed = rows(csv);
  const header = parsed.shift()?.map((name) => name.toLowerCase()) ?? [];
  const missing = REQUIRED.filter((name) => !header.includes(name));
  if (missing.length > 0) throw new Error(`CREDITS.csv is missing required columns: ${missing.join(', ')}`);
  const columns = Object.fromEntries(header.map((name, index) => [name, index]));
  const result: LicenseMap = {};
  for (const row of parsed) {
    const filename = row[columns.filename!] ?? '';
    if (!filename) continue;
    const author = attribution(row[columns.authors!] ?? '');
    const rawLicenses = row[columns.licenses!] ?? '';
    const { mapped, unknown } = mappedLicenses(rawLicenses);
    if (unknown.length > 0 || mapped.length === 0) {
      result[filename] = {
        license: 'NOASSERTION',
        attribution: author,
        dropped: `unmapped license "${unknown[0] ?? rawLicenses}"`,
      };
      continue;
    }
    const allowed = options.includeSa
      ? mapped
      : mapped.filter((license) => !license.includes('-SA-') && !license.startsWith('GPL-'));
    const candidates = allowed.length > 0 ? allowed : mapped;
    const license = PREFERENCE.find((candidate) => candidates.includes(candidate)) ?? candidates[0]!;
    const excluded = allowed.length === 0;
    const missingAttribution = !excluded && requiresAttribution(license) && author === null;
    result[filename] = {
      license,
      attribution: author,
      ...(excluded || missingAttribution
        ? {
            dropped: missingAttribution
              ? `missing attribution for ${license}`
              : license.startsWith('GPL-')
                ? 'GPL item excluded; pass --include-sa to keep it'
                : 'share-alike item excluded; pass --include-sa to keep it',
          }
        : {}),
    };
  }
  return result;
}
